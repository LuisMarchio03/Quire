import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncTransport } from './syncEngine'
import { localMirror } from '../store/localMirror'
import { createBookStore } from '../store/bookStore'
import { deleteQuireDb } from '../store/idb'
import type { Book } from '../types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'h1',
  title: 'Livro',
  author: null,
  format: 'epub',
  language: null,
  coverUrl: null,
  fileSize: 10,
  spineCount: 1,
  status: 'unread',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

function fakeTransport(
  impl?: Partial<{ cursor: string; changes: unknown[]; rejected: number[]; fail: boolean }>,
) {
  const calls: unknown[] = []
  const transport: SyncTransport = {
    async sync(request) {
      calls.push(request)
      if (impl?.fail) throw new Error('rede indisponível')
      return {
        cursor: impl?.cursor ?? '2026-06-01T00:00:00.000Z',
        changes: (impl?.changes ?? []) as never,
        rejected: impl?.rejected ?? [],
        copies: [],
      }
    },
  }
  return { transport, calls }
}

const engineWith = (transport: SyncTransport) =>
  createSyncEngine({ transport, listLocalFiles: async () => ['h1'] })

describe('syncEngine', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('envia o que está na fila e esvazia a fila confirmada', async () => {
    await localMirror.saveBook(book())
    const { transport, calls } = fakeTransport()

    const result = await engineWith(transport).syncNow()

    expect(result.pushed).toBe(1)
    expect((calls[0] as { changes: unknown[] }).changes).toHaveLength(1)
    expect(await localMirror.drainOutbox()).toHaveLength(0)
  })

  it('envia o estado atual do registro, não o de quando entrou na fila', async () => {
    await localMirror.saveBook(book({ title: 'Antigo' }))
    await localMirror.saveBook(book({ title: 'Novo', updatedAt: '2026-01-02T00:00:00.000Z' }))
    const { transport, calls } = fakeTransport()

    await engineWith(transport).syncNow()

    const sent = (calls[0] as { changes: Array<{ data: Book }> }).changes
    expect(sent).toHaveLength(1)
    expect(sent[0].data.title).toBe('Novo')
  })

  it('mantém na fila o que o servidor recusou', async () => {
    await localMirror.saveBook(book())
    const { transport } = fakeTransport({ rejected: [0] })

    await engineWith(transport).syncNow()

    expect(await localMirror.drainOutbox()).toHaveLength(1)
  })

  it('aplica o que veio do servidor sem devolver para a fila', async () => {
    const { transport } = fakeTransport({
      changes: [{ entity: 'book', data: book({ id: 'servidor', title: 'Do servidor' }) }],
    })

    const result = await engineWith(transport).syncNow()

    expect(result.pulled).toBe(1)
    expect((await localMirror.getBook('servidor'))?.title).toBe('Do servidor')
    expect(await localMirror.drainOutbox()).toHaveLength(0)
  })

  it('não deixa o servidor sobrescrever uma edição local mais nova', async () => {
    await localMirror.saveBook(book({ title: 'Local novo', updatedAt: '2026-05-01T00:00:00.000Z' }))
    await localMirror.ackOutbox((await localMirror.drainOutbox()).map((e) => e.id))
    const { transport } = fakeTransport({
      changes: [{ entity: 'book', data: book({ title: 'Servidor velho', updatedAt: '2026-01-01T00:00:00.000Z' }) }],
    })

    await engineWith(transport).syncNow()

    expect((await localMirror.getBook('h1'))?.title).toBe('Local novo')
  })

  it('avança o cursor só quando dá certo', async () => {
    const falha = fakeTransport({ fail: true })
    const engine = engineWith(falha.transport)
    const result = await engine.syncNow()

    expect(result.error).toBeTruthy()
    expect(await localMirror.getSyncCursor()).toBeNull()

    const ok = fakeTransport({ cursor: '2026-07-01T00:00:00.000Z' })
    await engineWith(ok.transport).syncNow()
    expect(await localMirror.getSyncCursor()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('a fila sobrevive à falha de rede', async () => {
    await localMirror.saveBook(book())
    const { transport } = fakeTransport({ fail: true })

    await engineWith(transport).syncNow()

    expect(await localMirror.drainOutbox()).toHaveLength(1)
  })

  it('chamadas concorrentes viram uma sincronização só', async () => {
    const { transport, calls } = fakeTransport()
    const engine = engineWith(transport)

    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()])

    expect(calls).toHaveLength(1)
  })

  it('informa ao servidor quais arquivos existem neste aparelho', async () => {
    const { transport, calls } = fakeTransport()
    await engineWith(transport).syncNow()
    expect((calls[0] as { copies: string[] }).copies).toEqual(['h1'])
  })

  it('anuncia mudança de estado para a interface', async () => {
    const states: string[] = []
    const { transport } = fakeTransport()
    const engine = createSyncEngine({
      transport,
      listLocalFiles: async () => [],
      onStateChange: (s) => states.push(s),
    })

    await engine.syncNow()

    expect(states).toEqual(['syncing', 'idle'])
  })

  it('start dispara ao voltar a conexão e stop desliga o ouvinte', async () => {
    const { transport, calls } = fakeTransport()
    const engine = engineWith(transport)

    engine.start({ intervalMs: 0 })
    await vi.waitFor(() => expect(calls.length).toBe(1))

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(calls.length).toBe(2))

    engine.stop()
    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toHaveLength(2)
  })
})

describe('syncEngine — aliases e arquivos', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('os aliases vindos do servidor se somam aos já conhecidos, e a união é reenviada', async () => {
    await localMirror.saveBook(book({ aliases: ['x'] }), { queue: false })
    const { transport } = fakeTransport({
      changes: [
        { entity: 'book', data: book({ aliases: ['y'], updatedAt: '2026-02-01T00:00:00.000Z' }) },
      ],
    })

    await engineWith(transport).syncNow()

    const local = await localMirror.getBook('h1')
    expect(local?.aliases).toEqual(['y', 'x'])
    // Carimbo novo, senão o servidor recusa o reenvio como repetição.
    expect(local!.updatedAt > '2026-02-01T00:00:00.000Z').toBe(true)
    expect((await localMirror.drainOutbox()).map((e) => e.id)).toEqual(['book:h1'])
  })

  it('registro local mais novo não perde alias que só o servidor conhecia', async () => {
    await localMirror.saveBook(
      book({ aliases: [], updatedAt: '2026-05-01T00:00:00.000Z', title: 'Local novo' }),
      { queue: false },
    )
    const { transport } = fakeTransport({
      changes: [
        { entity: 'book', data: book({ aliases: ['y'], updatedAt: '2026-01-01T00:00:00.000Z' }) },
      ],
    })

    await engineWith(transport).syncNow()

    const local = await localMirror.getBook('h1')
    expect(local?.title).toBe('Local novo')
    expect(local?.aliases).toEqual(['y'])
    expect(local!.updatedAt > '2026-05-01T00:00:00.000Z').toBe(true)
    expect((await localMirror.drainOutbox()).map((e) => e.id)).toEqual(['book:h1'])
  })

  it('sem alias novo, nada é reenviado', async () => {
    await localMirror.saveBook(
      book({ aliases: ['x'], updatedAt: '2026-05-01T00:00:00.000Z' }),
      { queue: false },
    )
    const { transport } = fakeTransport({
      changes: [
        { entity: 'book', data: book({ aliases: ['x'], updatedAt: '2026-01-01T00:00:00.000Z' }) },
      ],
    })

    await engineWith(transport).syncNow()

    expect(await localMirror.drainOutbox()).toHaveLength(0)
  })

  it('arquivo guardado sob um alias passa a servir o livro quando o alias chega', async () => {
    const store = createBookStore()
    await store.put('h2', new Blob([new Uint8Array([9])]))
    const { transport } = fakeTransport({
      changes: [{ entity: 'book', data: book({ aliases: ['h2'] }) }],
    })

    await engineWith(transport).syncNow()

    expect(await store.has('h1')).toBe(true)
    expect(await store.has('h2')).toBe(false)
    expect(Array.from((await store.getBytes('h1')) ?? [])).toEqual([9])
  })

  it('se o livro já tem arquivo aqui, o guardado sob o alias é só apagado', async () => {
    const store = createBookStore()
    await store.put('h1', new Blob([new Uint8Array([1])]))
    await store.put('h2', new Blob([new Uint8Array([2])]))
    const { transport } = fakeTransport({
      changes: [{ entity: 'book', data: book({ aliases: ['h2'] }) }],
    })

    await engineWith(transport).syncNow()

    expect(Array.from((await store.getBytes('h1')) ?? [])).toEqual([1])
    expect(await store.has('h2')).toBe(false)
  })

  it('avisa quantas mudanças chegaram, e só quando chegou alguma', async () => {
    const pulled: number[] = []
    const cheio = fakeTransport({ changes: [{ entity: 'book', data: book() }] })
    await createSyncEngine({
      transport: cheio.transport,
      listLocalFiles: async () => [],
      onPulled: (n) => pulled.push(n),
    }).syncNow()

    const vazio = fakeTransport()
    await createSyncEngine({
      transport: vazio.transport,
      listLocalFiles: async () => [],
      onPulled: (n) => pulled.push(n),
    }).syncNow()

    expect(pulled).toEqual([1])
  })

  it('a aba voltar a ficar visível dispara uma sincronização; ficar escondida, não', async () => {
    const { transport, calls } = fakeTransport()
    const engine = engineWith(transport)
    engine.start({ intervalMs: 0 })
    await vi.waitFor(() => expect(calls.length).toBe(1))

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(calls.length).toBe(2))

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toHaveLength(2)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    engine.stop()
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toHaveLength(2)
  })
})
