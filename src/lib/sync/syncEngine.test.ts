import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncTransport } from './syncEngine'
import { localMirror } from '../store/localMirror'
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
