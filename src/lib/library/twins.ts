import type { Book } from '../types'
import { foldTag } from './tags'

const MIN_WORD_LENGTH = 4

/** As palavras que contam num título: sem acento nem caixa, quatro letras ou mais. */
export function titleWords(title: string): Set<string> {
  return new Set(
    foldTag(title)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= MIN_WORD_LENGTH),
  )
}

/** Chave estável de um par, independente da ordem — é o que a recusa guarda. */
export const twinKey = (a: Book, b: Book): string => [a.id, b.id].sort().join('|')

/**
 * Dois livros parecem ser o mesmo quando têm o mesmo formato, a mesma contagem
 * de páginas ou capítulos e pelo menos uma palavra em comum no título. A
 * contagem sozinha não basta — EPUB de doze capítulos há aos montes — e o
 * título sozinho também não: o mesmo título em edições diferentes é outro
 * livro de verdade, com outra paginação.
 */
export function looksLikeTwins(a: Book, b: Book): boolean {
  if (a.format !== b.format) return false
  if (a.spineCount <= 0 || a.spineCount !== b.spineCount) return false
  const words = titleWords(a.title)
  for (const word of titleWords(b.title)) if (words.has(word)) return true
  return false
}

export interface TwinOptions {
  /** Chaves (`twinKey`) dos pares que o dono já disse não serem o mesmo livro. */
  dismissed?: readonly string[]
}

/**
 * Pares de livros vivos que parecem ser o mesmo. É sugestão, nunca decisão:
 * quem junta é o dono. O mais antigo vem primeiro, para sobreviver à junção.
 * Cada livro entra num par só; juntado o primeiro, a próxima passada acha o
 * seguinte.
 */
export function findTwins(
  books: readonly Book[],
  { dismissed = [] }: TwinOptions = {},
): Array<[Book, Book]> {
  const alive = books
    .filter((book) => !book.deletedAt)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id))
  const skip = new Set(dismissed)
  const used = new Set<string>()
  const pairs: Array<[Book, Book]> = []

  for (let i = 0; i < alive.length; i++) {
    const older = alive[i]
    if (used.has(older.id)) continue
    for (let j = i + 1; j < alive.length; j++) {
      const newer = alive[j]
      if (used.has(newer.id)) continue
      if (skip.has(twinKey(older, newer)) || !looksLikeTwins(older, newer)) continue
      pairs.push([older, newer])
      used.add(older.id)
      used.add(newer.id)
      break
    }
  }

  return pairs
}
