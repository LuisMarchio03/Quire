import { beforeEach, describe, expect, it } from 'vitest'
import { mergeBooks } from './mergeBooks'
import { createBookStore } from '../store/bookStore'
import { localMirror } from '../store/localMirror'
import { deleteQuireDb } from '../store/idb'
import type { Annotation, Book, Progress } from '../types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'velho',
  title: 'Confissões',
  author: 'Agostinho',
  format: 'pdf',
  language: null,
  coverUrl: null,
  fileSize: 100,
  spineCount: 399,
  status: 'unread',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

const progress = (overrides: Partial<Progress> = {}): Progress => ({
  bookId: 'velho',
  locator: { spineIndex: 9, progressInSpine: 0 },
  percent: 0.025,
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const annotation = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 'ann-1',
  bookId: 'novo',
  type: 'highlight',
  color: '#e8c468',
  anchor: { kind: 'pdf', page: 3, rects: [] },
  quotedText: 'trecho',
  noteText: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

const VELHO = book({ id: 'velho', tags: ['Filosofia'] })
const NOVO = book({
  id: 'novo',
  title: 'confissoes-santo-agostinho',
  tags: ['Clássicos'],
  coverUrl: 'data:image/webp;base64,AAA',
  aliases: ['novo-2'],
  status: 'reading',
  addedAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
})

const AGORA = '2026-09-04T00:00:00.000Z'
const store = createBookStore()

async function seed() {
  await localMirror.saveBook(VELHO, { queue: false })
  await localMirror.saveBook(NOVO, { queue: false })
}

describe('mergeBooks', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('o sobrevivente adota o id e os aliases do outro', async () => {
    await seed()

    const merged = await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect(merged?.id).toBe('velho')
    expect(merged?.aliases).toEqual(['novo', 'novo-2'])
    expect((await localMirror.getBook('velho'))?.aliases).toEqual(['novo', 'novo-2'])
    expect((await localMirror.getBook('velho'))?.updatedAt).toBe(AGORA)
  })

  it('o outro é excluído logicamente e some da estante', async () => {
    await seed()

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect((await localMirror.getBook('novo'))?.deletedAt).toBe(AGORA)
    expect((await localMirror.listBooks()).map((b) => b.id)).toEqual(['velho'])
  })

  it('o progresso mais recente vence e ganha carimbo novo', async () => {
    await seed()
    await localMirror.saveProgress(progress(), { queue: false })
    await localMirror.saveProgress(
      progress({
        bookId: 'novo',
        locator: { spineIndex: 21, progressInSpine: 0 },
        percent: 0.055,
        updatedAt: '2026-09-03T00:00:00.000Z',
      }),
      { queue: false },
    )

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    const final = await localMirror.getProgress('velho')
    expect(final?.locator.spineIndex).toBe(21)
    expect(final?.percent).toBeCloseTo(0.055)
    expect(final?.updatedAt).toBe(AGORA)
  })

  it('progresso mais antigo do outro não atropela o do sobrevivente', async () => {
    await seed()
    await localMirror.saveProgress(progress({ updatedAt: '2026-09-03T00:00:00.000Z' }), { queue: false })
    await localMirror.saveProgress(
      progress({ bookId: 'novo', locator: { spineIndex: 21, progressInSpine: 0 }, percent: 0.055 }),
      { queue: false },
    )

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    const final = await localMirror.getProgress('velho')
    expect(final?.locator.spineIndex).toBe(9)
    expect(final?.updatedAt).toBe('2026-09-03T00:00:00.000Z')
  })

  it('progresso que só o outro tinha é adotado', async () => {
    await seed()
    await localMirror.saveProgress(progress({ bookId: 'novo', percent: 0.3 }), { queue: false })

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect((await localMirror.getProgress('velho'))?.percent).toBeCloseTo(0.3)
  })

  it('a situação de leitura acompanha o progresso vencedor', async () => {
    await seed()
    await localMirror.saveProgress(progress({ bookId: 'novo' }), { queue: false })

    const merged = await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect(merged?.status).toBe('reading')
  })

  it('as anotações do outro passam para o sobrevivente', async () => {
    await seed()
    await localMirror.saveAnnotation(annotation(), { queue: false })
    await localMirror.saveAnnotation(
      annotation({ id: 'ann-apagada', deletedAt: '2026-08-02T00:00:00.000Z' }),
      { queue: false },
    )

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    const doSobrevivente = await localMirror.listAnnotations('velho')
    expect(doSobrevivente.map((a) => a.id)).toEqual(['ann-1'])
    expect(doSobrevivente[0].updatedAt).toBe(AGORA)
    expect(doSobrevivente[0].createdAt).toBe('2026-08-01T00:00:00.000Z')
    expect(await localMirror.listAnnotations('novo')).toHaveLength(0)
  })

  it('o arquivo local do outro passa a servir o sobrevivente', async () => {
    await seed()
    await store.put('novo', new Blob([new Uint8Array([7, 7, 7])]))

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect(await store.has('velho')).toBe(true)
    expect(await store.has('novo')).toBe(false)
    expect(Array.from((await store.getBytes('velho')) ?? [])).toEqual([7, 7, 7])
  })

  it('se os dois tinham arquivo, o do outro é apagado', async () => {
    await seed()
    await store.put('velho', new Blob([new Uint8Array([1])]))
    await store.put('novo', new Blob([new Uint8Array([2])]))

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect(Array.from((await store.getBytes('velho')) ?? [])).toEqual([1])
    expect(await store.has('novo')).toBe(false)
  })

  it('etiquetas se somam e a capa do outro serve se faltava', async () => {
    await seed()

    const merged = await mergeBooks('novo', 'velho', { now: () => AGORA })

    expect(merged?.tags).toEqual(['Clássicos', 'Filosofia'])
    expect(merged?.coverUrl).toBe('data:image/webp;base64,AAA')
  })

  it('tudo entra na fila de sincronização', async () => {
    await seed()
    await localMirror.saveProgress(progress({ bookId: 'novo' }), { queue: false })
    await localMirror.saveAnnotation(annotation(), { queue: false })

    await mergeBooks('novo', 'velho', { now: () => AGORA })

    const fila = (await localMirror.drainOutbox()).map((e) => e.id).sort()
    expect(fila).toEqual(['annotation:ann-1', 'book:novo', 'book:velho', 'progress:velho'])
  })

  it('não junta um livro consigo mesmo nem com um que não existe', async () => {
    await seed()

    expect(await mergeBooks('velho', 'velho', { now: () => AGORA })).toBeNull()
    expect(await mergeBooks('fantasma', 'velho', { now: () => AGORA })).toBeNull()
    expect(await mergeBooks('novo', 'fantasma', { now: () => AGORA })).toBeNull()
    expect((await localMirror.getBook('novo'))?.deletedAt).toBeNull()
    expect(await localMirror.drainOutbox()).toHaveLength(0)
  })
})
