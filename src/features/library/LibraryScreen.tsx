import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useLibrary, type StatusFilter } from './useLibrary'
import { BookCard } from './BookCard'
import { MergeOffer } from './MergeOffer'
import { TagEditor } from './TagEditor'
import { Icon } from '../ui/Icon'

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

const iconButton = 'grid size-9 shrink-0 place-items-center rounded-xl text-ink-dim transition hover:text-ink'

interface LibraryScreenProps {
  onOpen: (bookId: string) => void
  onOpenSettings?: () => void
  /** Espaço para o indicador de sincronização, no rodapé do cabeçalho. */
  statusSlot?: ReactNode
  /** Muda quando a sincronização trouxe algo: a estante relê o espelho. */
  refreshKey?: number
  /** Dois livros foram juntados — hora de subir a mudança. */
  onMerged?: () => void
}

export function LibraryScreen({
  onOpen,
  onOpenSettings,
  statusSlot,
  refreshKey,
  onMerged,
}: LibraryScreenProps) {
  const library = useLibrary({ refreshKey, onMerged })
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingBookId, setPendingBookId] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null)

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
      <header className="sticky top-0 z-20 bg-canvas/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-1">
            <h1 className="flex-1 font-serif text-[1.375rem] font-medium tracking-tight text-accent">
              Quire
            </h1>
            <button
              type="button"
              onClick={() => pickFiles()}
              aria-label="Adicionar livro"
              title="Adicionar livro"
              className={iconButton}
            >
              <Icon name="plus" />
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Ajustes"
                title="Ajustes"
                className={iconButton}
              >
                <Icon name="sliders" />
              </button>
            )}
          </div>

          <label className="mt-2 flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-ink-faint focus-within:ring-1 focus-within:ring-accent/40">
            <Icon name="search" size={16} />
            <input
              type="search"
              role="searchbox"
              aria-label="Buscar na estante"
              placeholder="Buscar por título, autor ou etiqueta"
              value={library.query}
              onChange={(event) => library.setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>

          <div className="mt-3 flex gap-5 text-[0.8125rem]">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => library.setStatusFilter(filter.value)}
                className={`border-b-[1.5px] pb-2 transition ${
                  library.statusFilter === filter.value
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-faint hover:text-ink-dim'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {library.availableTags.length > 0 && (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 pt-3">
            {library.availableTags.map(({ tag, count }) => {
              const ativa = library.selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => library.toggleTag(tag)}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${
                    ativa ? 'bg-accent/15 text-accent' : 'bg-surface text-ink-dim hover:text-ink'
                  }`}
                >
                  {tag} <span className={ativa ? 'text-accent/60' : 'text-ink-faint'}>{count}</span>
                </button>
              )
            })}
            {library.selectedTags.length > 0 && (
              <button
                type="button"
                onClick={library.clearTags}
                className="px-2 py-1 text-xs text-ink-faint underline underline-offset-2 hover:text-ink-dim"
              >
                limpar
              </button>
            )}
          </div>
        )}

        {statusSlot && <div className="mx-auto max-w-6xl px-4 pt-2.5">{statusSlot}</div>}
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
        {library.suggestion && (
          <MergeOffer
            suggestion={library.suggestion}
            onMerge={() => void library.acceptSuggestion()}
            onDismiss={library.dismissSuggestion}
          />
        )}

        {library.message && (
          <div
            role="alert"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-ink"
          >
            <span>{library.message}</span>
            <button
              type="button"
              onClick={library.dismissMessage}
              aria-label="Fechar aviso"
              className="grid size-6 shrink-0 place-items-center rounded-lg text-ink-dim hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {library.importing && (
          <p className="mb-5 text-sm text-ink-dim">
            Adicionando <span className="text-ink">{library.importing.name}</span> —{' '}
            {STAGE_LABEL[library.importing.stage] ?? library.importing.stage}
            {library.importing.stage === 'hash' &&
              ` ${Math.round(library.importing.fraction * 100)}%`}
          </p>
        )}

        {!library.loading && library.books.length === 0 && (
          <div className="mx-auto max-w-md py-24 text-center">
            <p className="font-serif text-2xl text-ink">Sua estante está vazia</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">
              Arraste um EPUB ou um PDF para esta janela, ou toque em{' '}
              <span className="text-ink">+</span>. O arquivo fica guardado só neste aparelho —
              anotações e progresso é que viajam entre eles.
            </p>
          </div>
        )}

        {library.books.length > 0 && library.visible.length === 0 && (
          <p className="py-16 text-center text-sm text-ink-dim">Nada encontrado com esse filtro.</p>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-5 gap-y-8">
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
              onEditTags={() => setEditingTagsFor(book.id)}
            />
          ))}
        </div>
      </main>

      {editingTagsFor &&
        (() => {
          const book = library.books.find((b) => b.id === editingTagsFor)
          if (!book) return null
          return (
            <TagEditor
              book={book}
              available={library.availableTags}
              onClose={() => setEditingTagsFor(null)}
              onSave={(tags) => {
                setEditingTagsFor(null)
                void library.setBookTags(book.id, tags)
              }}
            />
          )
        })()}

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-30 grid place-items-center rounded-2xl border border-dashed border-accent/60 bg-canvas/85 text-accent">
          Solte para adicionar à estante
        </div>
      )}
    </div>
  )
}
