import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Annotation, Book, OutboxEntry, Progress } from '../types'

export const DB_NAME = 'quire'
const DB_VERSION = 1

export interface StoredFile {
  id: string
  /** Bytes crus, e não um Blob: o structured clone de Blob varia entre
   *  navegadores, e o leitor precisa dos bytes de qualquer forma. */
  bytes: Uint8Array
  size: number
  addedAt: string
}

export interface QuireSchema extends DBSchema {
  /** Os bytes do livro. Nunca saem deste aparelho. */
  files: { key: string; value: StoredFile }
  books: { key: string; value: Book; indexes: { by_updated: string } }
  progress: { key: string; value: Progress }
  annotations: { key: string; value: Annotation; indexes: { by_book: string } }
  /** Escritas locais à espera de subir para o Turso. */
  outbox: { key: string; value: OutboxEntry }
  /** Cursor de sincronização e outras chaves soltas. */
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<QuireSchema>> | null = null

export function openQuireDb(): Promise<IDBPDatabase<QuireSchema>> {
  dbPromise ??= openDB<QuireSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('files', { keyPath: 'id' })
      db.createObjectStore('books', { keyPath: 'id' }).createIndex('by_updated', 'updatedAt')
      db.createObjectStore('progress', { keyPath: 'bookId' })
      db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('by_book', 'bookId')
      db.createObjectStore('outbox', { keyPath: 'id' })
      db.createObjectStore('meta')
    },
  })
  return dbPromise
}

/** Só para os testes: fecha e apaga o banco, para cada caso começar limpo. */
export async function deleteQuireDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await deleteDB(DB_NAME)
}
