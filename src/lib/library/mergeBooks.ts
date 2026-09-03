import { createBookStore, type BookStore } from '../store/bookStore'
import { localMirror } from '../store/localMirror'
import { nowIso } from '../time'
import type { Book, Progress } from '../types'
import { unionStrings } from './aliases'
import { normalizeTags } from './tags'

export interface MergeDeps {
  store?: BookStore
  now?: () => string
}

/** Entre dois progressos, o gravado por último. Empate fica com o primeiro. */
function pickProgress(first?: Progress, second?: Progress): Progress | undefined {
  if (!first) return second
  if (!second) return first
  return second.updatedAt > first.updatedAt ? second : first
}

/** Os aliases do sobrevivente mais o id e os aliases do outro, sem o próprio id. */
function unionAliases(survivor: Book, loser: Book): string[] {
  return unionStrings(survivor.aliases ?? [], [loser.id, ...(loser.aliases ?? [])]).filter(
    (alias) => alias !== survivor.id,
  )
}

/**
 * Junta dois livros que o dono disse serem o mesmo.
 *
 * O sobrevivente fica com a identidade e ganha o id do outro como alias — a
 * partir daí, o arquivo do outro reencontra este registro em qualquer
 * aparelho. O progresso mais recente vence e é regravado com carimbo novo,
 * para vencer também no servidor; anotações mudam de livro; o arquivo local do
 * outro passa a servir o sobrevivente; o outro é excluído logicamente. Tudo
 * passa pelo espelho local, então sobe pela fila como qualquer escrita.
 */
export async function mergeBooks(
  loserId: string,
  survivorId: string,
  deps: MergeDeps = {},
): Promise<Book | null> {
  if (loserId === survivorId) return null
  const [loser, survivor] = await Promise.all([
    localMirror.getBook(loserId),
    localMirror.getBook(survivorId),
  ])
  if (!loser || !survivor) return null

  const store = deps.store ?? createBookStore()
  const stamp = (deps.now ?? nowIso)()

  const [loserProgress, survivorProgress] = await Promise.all([
    localMirror.getProgress(loserId),
    localMirror.getProgress(survivorId),
  ])
  const winner = pickProgress(survivorProgress, loserProgress)
  const loserWon = winner !== undefined && winner === loserProgress

  const merged: Book = {
    ...survivor,
    aliases: unionAliases(survivor, loser),
    tags: normalizeTags([...(survivor.tags ?? []), ...(loser.tags ?? [])]),
    coverUrl: survivor.coverUrl ?? loser.coverUrl,
    status: loserWon ? loser.status : survivor.status,
    updatedAt: stamp,
    deletedAt: null,
  }
  await localMirror.saveBook(merged)

  if (loserWon && winner) {
    await localMirror.saveProgress({ ...winner, bookId: survivorId, updatedAt: stamp })
  }

  for (const annotation of await localMirror.listAnnotations(loserId)) {
    await localMirror.saveAnnotation({ ...annotation, bookId: survivorId, updatedAt: stamp })
  }

  const loserBytes = await store.getBytes(loserId)
  if (loserBytes) {
    if (!(await store.has(survivorId))) {
      await store.put(survivorId, new Blob([loserBytes as BlobPart]))
    }
    await store.delete(loserId)
  }

  await localMirror.saveBook({ ...loser, deletedAt: stamp, updatedAt: stamp })

  return merged
}
