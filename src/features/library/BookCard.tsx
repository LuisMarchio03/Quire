import type { Book } from '../../lib/types'
import { BookCover } from './BookCover'

interface BookCardProps {
  book: Book
  percent: number
  hasFile: boolean
  onOpen: () => void
  onAddFile: () => void
  onRemoveFile: () => void
  onDelete: () => void
}

export function BookCard({
  book,
  percent,
  hasFile,
  onOpen,
  onAddFile,
  onRemoveFile,
  onDelete,
}: BookCardProps) {
  const percentLabel = `${Math.round(percent * 100)}%`

  return (
    <article
      aria-label={book.title}
      tabIndex={0}
      onClick={() => (hasFile ? onOpen() : onAddFile())}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          hasFile ? onOpen() : onAddFile()
        }
      }}
      className="group flex cursor-pointer flex-col gap-2 focus:outline-none"
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-card bg-surface-2 ring-1 ring-line transition group-hover:ring-accent/50 group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <div className={hasFile ? '' : 'opacity-40 grayscale'}>
          <div className="h-full w-full">
            <BookCover book={book} />
          </div>
        </div>

        {!hasFile && (
          <div className="absolute inset-x-0 bottom-0 bg-canvas/85 p-2 text-center backdrop-blur-sm">
            <p className="text-[0.68rem] leading-tight text-ink-dim">não está neste aparelho</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onAddFile()
              }}
              className="mt-1 text-[0.72rem] font-medium text-accent underline underline-offset-2"
            >
              Adicionar arquivo aqui
            </button>
          </div>
        )}

        {percent > 0 && hasFile && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-canvas/70">
            <div className="h-full bg-accent" style={{ width: `${percent * 100}%` }} />
          </div>
        )}

        <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <details className="relative" onClick={(event) => event.stopPropagation()}>
            <summary
              aria-label={`Opções de ${book.title}`}
              className="grid size-7 cursor-pointer list-none place-items-center rounded-full bg-canvas/80 text-ink-dim backdrop-blur-sm hover:text-ink"
            >
              ⋯
            </summary>
            <div className="absolute right-0 top-8 z-10 w-52 overflow-hidden rounded-lg border border-line bg-surface-2 text-left text-sm shadow-xl">
              {hasFile && (
                <button
                  type="button"
                  onClick={onRemoveFile}
                  className="block w-full px-3 py-2 text-left hover:bg-surface-3"
                >
                  Remover arquivo daqui
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="block w-full px-3 py-2 text-left text-danger hover:bg-surface-3"
              >
                Excluir do acervo
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-ink" title={book.title}>
          {book.title}
        </h3>
        <p className="truncate text-xs text-ink-faint">
          {book.author ?? 'Autor desconhecido'}
          {percent > 0 && <span className="text-ink-dim"> · {percentLabel}</span>}
        </p>
      </div>
    </article>
  )
}
