import type { Book } from '../types'

export const MAX_TAGS_PER_BOOK = 24
export const MAX_TAG_LENGTH = 40

/** Tira acento e caixa: "Ficção" e "ficcao" são a mesma etiqueta. */
export const foldTag = (tag: string) =>
  tag.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/**
 * Arruma a lista de etiquetas de um livro.
 *
 * Guarda como a pessoa escreveu — acento e maiúscula fazem parte de ler bem —
 * mas compara sem, para "Filosofia" digitada de novo como "filosofia" não virar
 * duas fichas na estante.
 */
export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
    if (!tag) continue
    const key = foldTag(tag)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_TAGS_PER_BOOK) break
  }

  return out.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Aceita "filosofia, grécia; estoicismo" e devolve as três. */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,;\n]/))
}

export interface TagCount {
  tag: string
  count: number
}

/**
 * As etiquetas em uso no acervo, da mais usada para a menos. É o que a estante
 * mostra como fichas: um vocabulário que nasce do próprio acervo, sem cadastro.
 */
export function collectTags(books: readonly Book[]): TagCount[] {
  const counts = new Map<string, TagCount>()

  for (const book of books) {
    for (const tag of book.tags ?? []) {
      const key = foldTag(tag)
      const current = counts.get(key)
      if (current) current.count++
      else counts.set(key, { tag, count: 1 })
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'),
  )
}

export interface LibraryFilter {
  query?: string
  /** Etiquetas exigidas ao mesmo tempo — filtrar estreita, nunca alarga. */
  tags?: readonly string[]
  status?: Book['status'] | 'all'
}

/**
 * Um campo de busca só, casando título, autor e etiqueta. Cada palavra digitada
 * precisa aparecer em algum desses lugares — assim "rosa sertão" encontra o
 * livro sem exigir que a pessoa lembre em qual campo cada palavra estava.
 */
export function filterBooks(books: readonly Book[], filter: LibraryFilter): Book[] {
  const words = foldTag(filter.query ?? '').split(' ').filter(Boolean)
  const required = (filter.tags ?? []).map(foldTag).filter(Boolean)

  return books.filter((book) => {
    if (filter.status && filter.status !== 'all' && book.status !== filter.status) return false

    const bookTags = (book.tags ?? []).map(foldTag)
    if (required.some((tag) => !bookTags.includes(tag))) return false

    if (words.length === 0) return true
    const haystack = foldTag(`${book.title} ${book.author ?? ''} ${(book.tags ?? []).join(' ')}`)
    return words.every((word) => haystack.includes(word))
  })
}
