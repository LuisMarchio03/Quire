import { useEffect, useRef, useState } from 'react'
import type { Book } from '../../lib/types'
import { Icon } from '../ui/Icon'
import { BookCover } from './BookCover'

interface BookCardProps {
  book: Book
  percent: number
  hasFile: boolean
  onOpen: () => void
  onAddFile: () => void
  onRemoveFile: () => void
  onDelete: () => void
  onEditTags: () => void
}

export function BookCard({
  book,
  percent,
  hasFile,
  onOpen,
  onAddFile,
  onRemoveFile,
  onDelete,
  onEditTags,
}: BookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
        setConfirming(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const activate = () => (hasFile ? onOpen() : onAddFile())

  return (
    <article
      aria-label={book.title}
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activate()
        }
      }}
      className="group relative flex cursor-pointer flex-col focus:outline-none"
    >
      {/* A capa é um objeto: sombra e cantos de livro, sem moldura. */}
      <div
        className={`relative aspect-2/3 overflow-hidden rounded-card bg-surface-2 shadow-cover transition group-focus-visible:ring-2 group-focus-visible:ring-accent ${
          hasFile ? '' : 'opacity-45 saturate-50'
        }`}
      >
        <BookCover book={book} />
      </div>

      {percent > 0 && hasFile && (
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent" style={{ width: `${percent * 100}%` }} />
        </div>
      )}

      {/*
        O menu vive fora da caixa da capa de propósito: aquela caixa recorta o
        conteúdo para arredondar as bordas, e um balão ali dentro sai cortado.
        Onde existe mouse ele só aparece ao passar por cima; onde não existe
        (celular, tablet) fica sempre visível, senão seria inalcançável.
      */}
      <div
        ref={menuRef}
        data-quire-menu
        className="absolute right-1.5 top-1.5 z-20 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={`Opções de ${book.title}`}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
          className="grid size-7 place-items-center rounded-full bg-canvas/75 text-ink-dim backdrop-blur-sm hover:text-ink"
        >
          <Icon name="more" size={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl bg-surface-2 py-1 text-left text-sm shadow-pop">
            {hasFile && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onRemoveFile()
                }}
                className="block w-full px-3.5 py-2.5 text-left hover:bg-surface-3"
              >
                Remover arquivo daqui
                <span className="block text-xs text-ink-faint">
                  libera espaço, mantém as anotações
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onEditTags()
              }}
              className="block w-full px-3.5 py-2.5 text-left hover:bg-surface-3"
            >
              Etiquetas
              <span className="block text-xs text-ink-faint">
                {book.tags.length > 0 ? book.tags.join(', ') : 'nenhuma ainda'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setConfirming(true)
              }}
              className="block w-full px-3.5 py-2.5 text-left text-danger hover:bg-surface-3"
            >
              Excluir do acervo
            </button>
          </div>
        )}
      </div>

      {/*
        A confirmação é um diálogo no centro da tela, e não um balão: ela tem
        texto a explicar, e num cartão de 170px de largura isso sai ilegível.
      */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-canvas/70 p-5 backdrop-blur-sm"
          onClick={(event) => {
            event.stopPropagation()
            setConfirming(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Excluir ${book.title}`}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop"
          >
            <p className="text-ink">Tem certeza que quer excluir “{book.title}” do acervo?</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              As anotações e o progresso vão junto, em todos os aparelhos. O arquivo original no seu
              computador não é tocado.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  onDelete()
                }}
                className="flex-1 rounded-xl bg-danger px-3 py-2 text-sm font-medium text-canvas"
              >
                Sim, excluir
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-dim hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 min-w-0">
        <h3
          className="truncate font-serif text-[0.9375rem] font-medium leading-tight text-ink"
          title={book.title}
        >
          {book.title}
        </h3>
        {hasFile ? (
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {book.author ?? 'Autor desconhecido'}
            {percent > 0 && <span className="text-ink-dim"> · {Math.round(percent * 100)}%</span>}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-faint">
            não está neste aparelho ·{' '}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onAddFile()
              }}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Adicionar arquivo aqui
            </button>
          </p>
        )}
        {book.tags.length > 0 && (
          <p className="mt-0.5 truncate text-[0.6875rem] text-accent/70" title={book.tags.join(', ')}>
            {book.tags.join(' · ')}
          </p>
        )}
      </div>
    </article>
  )
}
