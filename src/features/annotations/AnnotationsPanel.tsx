import { useState } from 'react'
import type { Annotation, Book } from '../../lib/types'
import type { SearchHit } from '../../lib/reader/types'
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
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex flex-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('marks')}
            className={`rounded-full px-3 py-1 text-xs ${tab === 'marks' ? 'bg-accent/15 text-accent' : 'text-ink-dim'}`}
          >
            Anotações
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className={`rounded-full px-3 py-1 text-xs ${tab === 'search' ? 'bg-accent/15 text-accent' : 'text-ink-dim'}`}
          >
            Buscar
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar anotações" className="text-ink-dim hover:text-ink">
          ✕
        </button>
      </header>

      {tab === 'marks' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {annotations.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-faint">
              Selecione um trecho no texto para destacar ou anotar.
            </p>
          )}

          {bookmarks.length > 0 && (
            <>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-ink-faint">Marcas de página</h3>
              <ul className="mb-5 space-y-1">
                {bookmarks.map((bookmark) => (
                  <li key={bookmark.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onJump(bookmark)}
                      className="flex-1 truncate rounded px-2 py-1 text-left text-sm text-ink-dim hover:bg-surface-2 hover:text-ink"
                    >
                      {bookmark.quotedText || 'Marca'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(bookmark.id)}
                      aria-label="Remover marca"
                      className="text-ink-faint hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {passages.length > 0 && (
            <h3 className="mb-2 text-xs uppercase tracking-wide text-ink-faint">Trechos</h3>
          )}
          <ul className="space-y-3">
            {passages.map((annotation) => (
              <li
                key={annotation.id}
                className="rounded-lg border border-line bg-surface-2 p-3"
                style={{ borderLeft: `3px solid ${annotation.color ?? '#e8c468'}` }}
              >
                <button
                  type="button"
                  onClick={() => onJump(annotation)}
                  className="block w-full text-left font-serif text-sm text-ink"
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
                      className="w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none"
                    />
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onEditNote(annotation.id, draft.trim())
                          setEditing(null)
                        }}
                        className="rounded bg-accent px-2 py-1 text-xs text-canvas"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded px-2 py-1 text-xs text-ink-dim"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <p className="flex-1 whitespace-pre-wrap text-xs text-ink-dim">
                      {annotation.noteText}
                    </p>
                    <div className="flex shrink-0 gap-2">
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
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <form onSubmit={runSearch} className="flex gap-2">
            <input
              type="search"
              aria-label="Buscar no livro"
              placeholder="Buscar no livro"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-accent px-3 text-sm text-canvas">
              Ir
            </button>
          </form>

          {searching && <p className="mt-4 text-sm text-ink-dim">Procurando…</p>}
          {hits?.length === 0 && !searching && (
            <p className="mt-4 text-sm text-ink-faint">Nada encontrado.</p>
          )}

          <ul className="mt-4 space-y-2">
            {hits?.map((hit, index) => (
              <li key={`${hit.locator.spineIndex}-${index}`}>
                <button
                  type="button"
                  onClick={() => onJumpToHit(hit)}
                  className="w-full rounded-lg border border-line bg-surface-2 p-2 text-left text-xs text-ink-dim hover:text-ink"
                >
                  …{hit.excerpt}…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={download}
          disabled={annotations.length === 0}
          className="w-full rounded-lg border border-line py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-40"
        >
          Exportar em Markdown
        </button>
      </footer>
    </aside>
  )
}
