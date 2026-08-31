import type { Annotation, Book } from '../../lib/types'

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** Exporta o que foi marcado no livro como Markdown — para levar embora. */
export function exportMarkdown(book: Book, annotations: Annotation[]): string {
  const alive = annotations.filter((a) => !a.deletedAt)
  const passages = alive.filter((a) => a.type === 'highlight' || a.type === 'note')
  const bookmarks = alive.filter((a) => a.type === 'bookmark')

  const lines: string[] = [`# ${book.title}`]
  if (book.author) lines.push('', `*${book.author}*`)

  const counts = [
    passages.length > 0 && plural(passages.length, 'trecho', 'trechos'),
    bookmarks.length > 0 && plural(bookmarks.length, 'marca de página', 'marcas de página'),
  ].filter(Boolean)
  lines.push('', counts.length > 0 ? `> ${counts.join(' · ')}` : '> Nada marcado ainda.')

  if (passages.length > 0) {
    lines.push('', '## Trechos')
    for (const annotation of passages) {
      lines.push('')
      if (annotation.quotedText) {
        for (const line of annotation.quotedText.split('\n')) lines.push(`> ${line}`)
      }
      if (annotation.noteText) lines.push('', annotation.noteText)
      lines.push('', '---')
    }
  }

  if (bookmarks.length > 0) {
    lines.push('', '## Marcas de página')
    for (const bookmark of bookmarks) {
      lines.push(`- ${bookmark.noteText || bookmark.quotedText || positionLabel(bookmark)}`)
    }
  }

  return `${lines.join('\n').trim()}\n`
}

function positionLabel(annotation: Annotation): string {
  return annotation.anchor.kind === 'pdf'
    ? `Página ${annotation.anchor.page + 1}`
    : `Capítulo ${annotation.anchor.spineIndex + 1}`
}
