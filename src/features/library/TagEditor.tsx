import { useState } from 'react'
import { foldTag, normalizeTags, parseTagInput, type TagCount } from '../../lib/library/tags'
import type { Book } from '../../lib/types'
import { Icon } from '../ui/Icon'

interface TagEditorProps {
  book: Book
  /** Etiquetas já usadas no acervo, para sugerir em vez de exigir digitação. */
  available: TagCount[]
  onSave: (tags: string[]) => void
  onClose: () => void
}

export function TagEditor({ book, available, onSave, onClose }: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(book.tags ?? [])
  const [draft, setDraft] = useState('')

  const add = (entrada: string) => {
    const novas = parseTagInput(entrada)
    if (novas.length === 0) return
    setTags((atuais) => normalizeTags([...atuais, ...novas]))
    setDraft('')
  }

  const remove = (tag: string) => setTags((atuais) => atuais.filter((t) => t !== tag))

  const jaTem = new Set(tags.map(foldTag))
  const sugestoes = available.filter((t) => !jaTem.has(foldTag(t.tag))).slice(0, 12)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-canvas/70 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Etiquetas de ${book.title}`}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-pop"
      >
        <h2 className="text-sm text-ink">Etiquetas</h2>
        <p className="mt-0.5 truncate font-serif text-[0.9375rem] text-ink-dim">{book.title}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-3 pr-1 text-xs text-accent"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remover etiqueta ${tag}`}
                onClick={() => remove(tag)}
                className="grid size-5 place-items-center rounded-full text-accent/70 hover:text-accent"
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <p className="text-xs text-ink-faint">Nenhuma etiqueta ainda.</p>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            add(draft)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            autoFocus
            aria-label="Nova etiqueta"
            placeholder="filosofia, faculdade"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === ',' || event.key === ';') {
                event.preventDefault()
                add(draft)
              }
            }}
            className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-xl bg-surface-2 px-3.5 text-sm text-ink-dim hover:text-ink disabled:opacity-30"
          >
            Adicionar
          </button>
        </form>

        {sugestoes.length > 0 && (
          <div className="mt-5">
            <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">
              Já usadas no acervo
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugestoes.map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => add(tag)}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
                >
                  {tag} <span className="text-ink-faint">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(tags)}
            className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-canvas"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-dim hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
