import type { Book } from '../../lib/types'

/** Cor estável derivada do id — dois livros sem capa nunca ficam iguais. */
function hueOf(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

export function BookCover({ book }: { book: Book }) {
  if (book.coverUrl) {
    return (
      <img
        src={book.coverUrl}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    )
  }

  const hue = hueOf(book.id)
  return (
    <div
      className="flex h-full w-full flex-col justify-between p-3"
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 26% 26%), hsl(${(hue + 40) % 360} 22% 16%))`,
      }}
    >
      <span className="font-serif text-[0.95rem] leading-tight text-ink/90 line-clamp-4">
        {book.title}
      </span>
      {book.author && (
        <span className="text-[0.7rem] text-ink-dim line-clamp-2">{book.author}</span>
      )}
    </div>
  )
}
