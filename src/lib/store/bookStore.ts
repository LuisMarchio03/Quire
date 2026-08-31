import { nowIso } from '../time'
import { openQuireDb } from './idb'

export interface StorageUsage {
  /** Bytes usados pela origem inteira, segundo o navegador. */
  used: number
  quota: number
  /** Bytes ocupados só pelos arquivos de livro. */
  booksBytes: number
  persisted: boolean
}

/**
 * Onde os bytes do livro moram. A interface existe para que trocar IndexedDB
 * por armazenamento em nuvem seja escrever outro adaptador, não refazer o app.
 */
export interface BookStore {
  put(bookId: string, file: Blob): Promise<void>
  get(bookId: string): Promise<Blob | undefined>
  getBytes(bookId: string): Promise<Uint8Array | undefined>
  has(bookId: string): Promise<boolean>
  delete(bookId: string): Promise<void>
  list(): Promise<string[]>
  usage(): Promise<StorageUsage>
}

export function createBookStore(): BookStore {
  return {
    async put(bookId, file) {
      const db = await openQuireDb()
      const bytes = new Uint8Array(await file.arrayBuffer())
      await db.put('files', { id: bookId, bytes, size: bytes.byteLength, addedAt: nowIso() })
    },

    async get(bookId) {
      const bytes = await this.getBytes(bookId)
      return bytes && new Blob([bytes as BlobPart])
    },

    async getBytes(bookId) {
      const db = await openQuireDb()
      return (await db.get('files', bookId))?.bytes
    },

    async has(bookId) {
      const db = await openQuireDb()
      return (await db.getKey('files', bookId)) !== undefined
    },

    async delete(bookId) {
      const db = await openQuireDb()
      await db.delete('files', bookId)
    },

    async list() {
      const db = await openQuireDb()
      return db.getAllKeys('files')
    },

    async usage() {
      const db = await openQuireDb()
      const booksBytes = (await db.getAll('files')).reduce((sum, f) => sum + f.size, 0)
      const storage = globalThis.navigator?.storage
      if (!storage?.estimate) return { used: 0, quota: 0, booksBytes, persisted: false }
      const [estimate, persisted] = await Promise.all([
        storage.estimate(),
        storage.persisted?.() ?? Promise.resolve(false),
      ])
      return {
        used: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
        booksBytes,
        persisted,
      }
    },
  }
}

/**
 * Pede ao navegador que não despeje o acervo sob pressão de disco. Sem isso, os
 * arquivos podem sumir sozinhos — e é o único dado do app que não está no Turso.
 */
export async function requestPersistence(): Promise<boolean> {
  const storage = globalThis.navigator?.storage
  if (!storage?.persist) return false
  if (await storage.persisted?.()) return true
  return storage.persist()
}
