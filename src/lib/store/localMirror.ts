import { nowIso } from '../time'
import { openQuireDb } from './idb'
import type { Annotation, Book, OutboxEntity, OutboxEntry, Progress } from '../types'

const CURSOR_KEY = 'syncCursor'
const SEQ_KEY = 'outboxSeq'

export interface WriteOptions {
  /**
   * `false` para escrita vinda do servidor: aplicar um delta recebido não pode
   * enfileirar o mesmo dado de volta, senão a sincronização nunca termina.
   */
  queue?: boolean
}

async function enqueue(entity: OutboxEntity, key: string): Promise<void> {
  const db = await openQuireDb()
  const tx = db.transaction(['outbox', 'meta'], 'readwrite')
  const meta = tx.objectStore('meta')
  const seq = (((await meta.get(SEQ_KEY)) as number | undefined) ?? 0) + 1
  await Promise.all([
    meta.put(seq, SEQ_KEY),
    tx.objectStore('outbox').put({ id: `${entity}:${key}`, seq, entity, key, queuedAt: nowIso() }),
    tx.done,
  ])
}

/** O espelho local dos dados que também vivem no Turso. */
export const localMirror = {
  async listBooks(): Promise<Book[]> {
    const db = await openQuireDb()
    const books = await db.getAll('books')
    return books
      .filter((b) => !b.deletedAt)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  },

  async getBook(id: string): Promise<Book | undefined> {
    const db = await openQuireDb()
    return db.get('books', id)
  },

  async saveBook(book: Book, { queue = true }: WriteOptions = {}): Promise<void> {
    const db = await openQuireDb()
    await db.put('books', book)
    if (queue) await enqueue('book', book.id)
  },

  /**
   * O livro dono de um hash de arquivo: pelo próprio id ou por alias. É a porta
   * de entrada da importação — um arquivo que o dono já declarou ser "o mesmo
   * livro" reencontra o registro certo em qualquer aparelho.
   */
  async findBookByFileId(fileId: string): Promise<Book | undefined> {
    const db = await openQuireDb()
    const direct = await db.get('books', fileId)
    if (direct) return direct
    const all = await db.getAll('books')
    return all.find((book) => (book.aliases ?? []).includes(fileId))
  },

  async getProgress(bookId: string): Promise<Progress | undefined> {
    const db = await openQuireDb()
    return db.get('progress', bookId)
  },

  async saveProgress(progress: Progress, { queue = true }: WriteOptions = {}): Promise<void> {
    const db = await openQuireDb()
    await db.put('progress', progress)
    if (queue) await enqueue('progress', progress.bookId)
  },

  async listAnnotations(bookId: string): Promise<Annotation[]> {
    const db = await openQuireDb()
    const all = await db.getAllFromIndex('annotations', 'by_book', bookId)
    return all.filter((a) => !a.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async getAnnotation(id: string): Promise<Annotation | undefined> {
    const db = await openQuireDb()
    return db.get('annotations', id)
  },

  async saveAnnotation(annotation: Annotation, { queue = true }: WriteOptions = {}): Promise<void> {
    const db = await openQuireDb()
    await db.put('annotations', annotation)
    if (queue) await enqueue('annotation', annotation.id)
  },

  async drainOutbox(limit = 200): Promise<OutboxEntry[]> {
    const db = await openQuireDb()
    const all = await db.getAll('outbox')
    return all.sort((a, b) => a.seq - b.seq).slice(0, limit)
  },

  async ackOutbox(ids: string[]): Promise<void> {
    const db = await openQuireDb()
    const tx = db.transaction('outbox', 'readwrite')
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  },

  async getSyncCursor(): Promise<string | null> {
    const db = await openQuireDb()
    return ((await db.get('meta', CURSOR_KEY)) as string | undefined) ?? null
  },

  async setSyncCursor(cursor: string): Promise<void> {
    const db = await openQuireDb()
    await db.put('meta', cursor, CURSOR_KEY)
  },
}
