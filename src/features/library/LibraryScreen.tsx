import { useRef, useState, type DragEvent } from 'react'
import { useLibrary, type StatusFilter } from './useLibrary'
import { BookCard } from './BookCard'

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'reading', label: 'Lendo' },
  { value: 'unread', label: 'Não lidos' },
  { value: 'finished', label: 'Terminados' },
]

const STAGE_LABEL: Record<string, string> = {
  hash: 'identificando',
  leitura: 'lendo o arquivo',
  capa: 'gerando a capa',
  'gravação': 'guardando',
  pronto: 'pronto',
}

interface LibraryScreenProps {
  onOpen: (bookId: string) => void
  onOpenSettings?: () => void
}

export function LibraryScreen({ onOpen, onOpenSettings }: LibraryScreenProps) {
  const library = useLibrary()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingBookId, setPendingBookId] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)

  const pickFiles = (bookId?: string) => {
    setPendingBookId(bookId)
    inputRef.current?.click()
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) await library.importFiles(files)
  }

  return (
    <div
      className="min-h-full"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="font-serif text-xl text-accent">Quire</h1>

          <input
            type="search"
            role="searchbox"
            aria-label="Buscar na estante"
            placeholder="Buscar por título ou autor"
            value={library.query}
            onChange={(event) => library.setQuery(event.target.value)}
            className="min-w-40 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
          />

          <div className="flex gap-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => library.setStatusFilter(filter.value)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  library.statusFilter === filter.value
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => pickFiles()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:bg-accent/90"
          >
            Adicionar
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Ajustes"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        multiple
        aria-label="Adicionar livros"
        className="sr-only"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) await library.importFiles(files, pendingBookId)
          setPendingBookId(undefined)
        }}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {library.message && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ink"
          >
            <span>{library.message}</span>
            <button
              type="button"
              onClick={library.dismissMessage}
              aria-label="Fechar aviso"
              className="text-ink-dim hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}

        {library.importing && (
          <p className="mb-4 text-sm text-ink-dim">
            Adicionando <span className="text-ink">{library.importing.name}</span> —{' '}
            {STAGE_LABEL[library.importing.stage] ?? library.importing.stage}
            {library.importing.stage === 'hash' &&
              ` ${Math.round(library.importing.fraction * 100)}%`}
          </p>
        )}

        {!library.loading && library.books.length === 0 && (
          <div className="mx-auto max-w-md py-20 text-center">
            <p className="font-serif text-2xl text-ink">Sua estante está vazia</p>
            <p className="mt-2 text-sm text-ink-dim">
              Arraste um EPUB ou um PDF para esta janela, ou use o botão Adicionar. O arquivo fica
              guardado só neste aparelho — anotações e progresso é que viajam entre eles.
            </p>
          </div>
        )}

        {library.books.length > 0 && library.visible.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-dim">Nada encontrado com esse filtro.</p>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
          {library.visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              percent={library.percents[book.id] ?? 0}
              hasFile={library.localIds.has(book.id)}
              onOpen={() => onOpen(book.id)}
              onAddFile={() => pickFiles(book.id)}
              onRemoveFile={() => void library.removeFile(book.id)}
              onDelete={() => void library.deleteBook(book.id)}
            />
          ))}
        </div>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent/70 bg-canvas/80 text-accent">
          Solte para adicionar à estante
        </div>
      )}
    </div>
  )
}
