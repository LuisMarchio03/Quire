import { useState } from 'react'
import type { Annotation, Book } from '../../lib/types'
import type { SearchHit } from '../../lib/reader/types'
import { Icon } from '../ui/Icon'
import { exportMarkdown } from './exportMarkdown'

interface AnnotationsPanelProps {
  book: Book
  annotations: Annotation[]
  orphanIds: Set<string>
  onJump: (annotation: Annotation) => void
  onJumpToHit: (hit: SearchHit) => void
  onSearch: (query: string) => Promise<SearchHit[]>
  onEditNote: (id: string, text: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

type Tab = 'marks' | 'search'

const tabClass = (active: boolean) =>
  `border-b-[1.5px] px-1 pb-2 pt-1 text-sm transition ${
    active ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink-dim'
  }`

export function AnnotationsPanel({
  book,
  annotations,
  orphanIds,
  onJump,
  onJumpToHit,
  onSearch,
  onEditNote,
  onRemove,
  onClose,
}: AnnotationsPanelProps) {
  const [tab, setTab] = useState<Tab>('marks')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const passages = annotations.filter((a) => a.type !== 'bookmark')
  const bookmarks = annotations.filter((a) => a.type === 'bookmark')

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setHits(await onSearch(query))
    setSearching(false)
  }

  const download = () => {
    const blob = new Blob([exportMarkdown(book, annotations)], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${book.title.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'livro'}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <aside
      aria-label="Anotações do livro"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-surface shadow-pop"
    >
      <header className="flex items-center gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 gap-4">
          <button type="button" onClick={() => setTab('marks')} className={tabClass(tab === 'marks')}>
            Anotações
          </button>
          <button type="button" onClick={() => setTab('search')} className={tabClass(tab === 'search')}>
            Buscar
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar anotações"
          className="grid size-9 place-items-center rounded-xl text-ink-dim hover:text-ink"
        >
          <Icon name="close" />
        </button>
      </header>

      {tab === 'marks' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {annotations.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-faint">
              Selecione um trecho no texto para destacar ou anotar.
            </p>
          )}

          {bookmarks.length > 0 && (
            <>
              <h3 className="mb-1 text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">
                Marcas de página
              </h3>
              <ul className="mb-6 divide-y divide-line">
                {bookmarks.map((bookmark) => (
                  <li key={bookmark.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onJump(bookmark)}
                      className="flex-1 truncate py-2.5 text-left text-sm text-ink-dim hover:text-ink"
                    >
                      {bookmark.quotedText || 'Marca'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(bookmark.id)}
                      aria-label="Remover marca"
                      className="grid size-8 place-items-center rounded-lg text-ink-faint hover:text-danger"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {passages.length > 0 && (
            <h3 className="mb-2 text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">Trechos</h3>
          )}
          <ul className="space-y-4">
            {passages.map((annotation) => (
              <li
                key={annotation.id}
                className="pl-3"
                style={{ borderLeft: `2px solid ${annotation.color ?? '#e8c468'}` }}
              >
                <button
                  type="button"
                  onClick={() => onJump(annotation)}
                  className="block w-full text-left font-serif text-[0.9375rem] leading-snug text-ink"
                >
                  {annotation.quotedText || '(trecho sem texto)'}
                </button>

                {orphanIds.has(annotation.id) && (
                  <p className="mt-1 text-xs text-ink-faint">
                    trecho não encontrado nesta edição — o texto ficou guardado
                  </p>
                )}

                {editing === annotation.id ? (
                  <div className="mt-2">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none"
                    />
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onEditNote(annotation.id, draft.trim())
                          setEditing(null)
                        }}
                        className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-canvas"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-lg px-2 py-1 text-xs text-ink-dim"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <p className="flex-1 whitespace-pre-wrap text-xs text-ink-dim">
                      {annotation.noteText}
                    </p>
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(annotation.id)
                          setDraft(annotation.noteText ?? '')
                        }}
                        className="text-xs text-ink-faint hover:text-ink"
                      >
                        {annotation.noteText ? 'Editar' : 'Anotar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(annotation.id)}
                        className="text-xs text-ink-faint hover:text-danger"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={runSearch} className="flex gap-2">
            <input
              type="search"
              aria-label="Buscar no livro"
              placeholder="Buscar no livro"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-3.5 text-sm font-medium text-canvas"
            >
              Ir
            </button>
          </form>

          {searching && <p className="mt-4 text-sm text-ink-dim">Procurando…</p>}
          {hits?.length === 0 && !searching && (
            <p className="mt-4 text-sm text-ink-faint">Nada encontrado.</p>
          )}

          <ul className="mt-3 divide-y divide-line">
            {hits?.map((hit, index) => (
              <li key={`${hit.locator.spineIndex}-${index}`}>
                <button
                  type="button"
                  onClick={() => onJumpToHit(hit)}
                  className="w-full py-2.5 text-left text-xs leading-relaxed text-ink-dim hover:text-ink"
                >
                  …{hit.excerpt}…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={download}
          disabled={annotations.length === 0}
          className="w-full rounded-xl bg-surface-2 py-2.5 text-sm text-ink-dim hover:text-ink disabled:opacity-40"
        >
          Exportar em Markdown
        </button>
      </footer>
    </aside>
  )
}
