import type { BookStore } from '../store/bookStore'
import type { Book } from '../types'

/** O pedaço do armazenamento de arquivos de que a adoção precisa. */
export type FileStore = Pick<BookStore, 'has' | 'getBytes' | 'put' | 'delete'>

/** União na ordem de chegada, sem repetição. */
export function unionStrings(first: readonly string[], second: readonly string[]): string[] {
  const out: string[] = []
  for (const item of [...first, ...second]) if (!out.includes(item)) out.push(item)
  return out
}

/**
 * Um arquivo guardado sob um alias passa a viver sob o id do livro. É assim que
 * o celular que adicionou "o arquivo errado" reencontra o livro unificado
 * depois que a junção foi feita no outro aparelho. Se o livro já tem arquivo
 * aqui, o que estava sob o alias é só apagado: ninguém mais chega até ele.
 * Devolve se algo mudou.
 */
export async function adoptAliasedFiles(book: Book, store: FileStore): Promise<boolean> {
  let changed = false
  for (const alias of book.aliases ?? []) {
    if (alias === book.id || !(await store.has(alias))) continue
    if (!(await store.has(book.id))) {
      const bytes = await store.getBytes(alias)
      if (bytes) await store.put(book.id, new Blob([bytes as BlobPart]))
    }
    await store.delete(alias)
    changed = true
  }
  return changed
}
