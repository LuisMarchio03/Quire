import { beforeEach, describe, expect, it } from 'vitest'
import { localMirror } from './localMirror'
import { deleteQuireDb } from './idb'
import type { Annotation, Book, Progress } from '../types'

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'hash-1',
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    format: 'epub',
    language: 'pt',
    coverUrl: null,
    fileSize: 1024,
    spineCount: 12,
    status: 'unread',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    bookId: 'hash-1',
    type: 'highlight',
    color: '#e8c468',
    anchor: { kind: 'epub', spineIndex: 0, startPath: [0, 0], startOffset: 0, endPath: [0, 0], endOffset: 5 },
    quotedText: 'Capítulo',
    noteText: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const progress = (overrides: Partial<Progress> = {}): Progress => ({
  bookId: 'hash-1',
  locator: { spineIndex: 2, progressInSpine: 0.5 },
  percent: 0.2,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('localMirror', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('gravar livro enfileira uma entrada na outbox', async () => {
    await localMirror.saveBook(makeBook())
    const queue = await localMirror.drainOutbox()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ entity: 'book', key: 'hash-1' })
  })

  it('gravar com origem no servidor não enfileira', async () => {
    await localMirror.saveBook(makeBook(), { queue: false })
    expect(await localMirror.drainOutbox()).toHaveLength(0)
    expect(await localMirror.getBook('hash-1')).toBeDefined()
  })

  it('duas escritas do mesmo registro deixam uma entrada só na fila', async () => {
    await localMirror.saveBook(makeBook())
    await localMirror.saveBook(makeBook({ status: 'reading' }))
    expect(await localMirror.drainOutbox()).toHaveLength(1)
  })

  it('listBooks omite os excluídos e ordena do mais recente para o mais antigo', async () => {
    await localMirror.saveBook(makeBook({ id: 'a', addedAt: '2026-01-01T00:00:00.000Z' }))
    await localMirror.saveBook(makeBook({ id: 'b', addedAt: '2026-02-01T00:00:00.000Z' }))
    await localMirror.saveBook(makeBook({ id: 'c', deletedAt: '2026-03-01T00:00:00.000Z' }))
    expect((await localMirror.listBooks()).map((b) => b.id)).toEqual(['b', 'a'])
  })

  it('a fila sai na ordem em que entrou', async () => {
    await localMirror.saveBook(makeBook({ id: 'a' }))
    await localMirror.saveProgress(progress())
    await localMirror.saveAnnotation(makeAnnotation())
    expect((await localMirror.drainOutbox()).map((e) => e.entity)).toEqual([
      'book',
      'progress',
      'annotation',
    ])
  })

  it('drainOutbox respeita o limite pedido', async () => {
    await localMirror.saveBook(makeBook({ id: 'a' }))
    await localMirror.saveBook(makeBook({ id: 'b' }))
    expect(await localMirror.drainOutbox(1)).toHaveLength(1)
  })

  it('ackOutbox remove só o que foi confirmado', async () => {
    await localMirror.saveBook(makeBook({ id: 'a' }))
    await localMirror.saveBook(makeBook({ id: 'b' }))
    const queue = await localMirror.drainOutbox()
    await localMirror.ackOutbox([queue[0].id])
    expect((await localMirror.drainOutbox()).map((e) => e.key)).toEqual(['b'])
  })

  it('anotações são listadas por livro, sem as excluídas', async () => {
    await localMirror.saveAnnotation(makeAnnotation({ id: 'x' }))
    await localMirror.saveAnnotation(makeAnnotation({ id: 'y', deletedAt: '2026-02-01T00:00:00.000Z' }))
    await localMirror.saveAnnotation(makeAnnotation({ id: 'z', bookId: 'outro' }))
    expect((await localMirror.listAnnotations('hash-1')).map((a) => a.id)).toEqual(['x'])
  })

  it('progresso é gravado e lido por livro', async () => {
    await localMirror.saveProgress(progress())
    expect((await localMirror.getProgress('hash-1'))?.locator.spineIndex).toBe(2)
    expect(await localMirror.getProgress('inexistente')).toBeUndefined()
  })

  it('o cursor de sincronização persiste', async () => {
    expect(await localMirror.getSyncCursor()).toBeNull()
    await localMirror.setSyncCursor('2026-05-01T00:00:00.000Z')
    expect(await localMirror.getSyncCursor()).toBe('2026-05-01T00:00:00.000Z')
  })
})
