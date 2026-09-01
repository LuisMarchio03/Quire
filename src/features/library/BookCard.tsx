import { useEffect, useRef, useState } from 'react'
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
      className="group relative flex cursor-pointer flex-col gap-2 focus:outline-none"
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-card bg-surface-2 ring-1 ring-line transition group-hover:ring-accent/50 group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <div className={hasFile ? 'h-full w-full' : 'h-full w-full opacity-40 grayscale'}>
          <BookCover book={book} />
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

      </div>


      {/*
        O menu vive fora da caixa da capa de propósito: aquela caixa recorta o
        conteúdo para arredondar as bordas, e um balão ali dentro sai cortado.
        Onde existe mouse ele só aparece ao passar por cima; onde não existe
        (celular, tablet) fica sempre visível, senão seria inalcançável.
      */}
      <div
        ref={menuRef}
        data-quire-menu
        className="absolute right-1 top-1 z-20 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
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
          className="grid size-8 place-items-center rounded-full bg-canvas/85 text-lg leading-none text-ink-dim backdrop-blur-sm hover:text-ink"
        >
          ⋯
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-lg border border-line bg-surface-2 text-left text-sm shadow-xl">
            {hasFile && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onRemoveFile()
                }}
                className="block w-full px-3 py-2.5 text-left hover:bg-surface-3"
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
                setConfirming(true)
              }}
              className="block w-full px-3 py-2.5 text-left text-danger hover:bg-surface-3"
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
            className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl"
          >
            <p className="text-ink">Tem certeza que quer excluir “{book.title}” do acervo?</p>
            <p className="mt-2 text-sm text-ink-dim">
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
                className="flex-1 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-canvas"
              >
                Sim, excluir
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink-dim"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-ink" title={book.title}>
          {book.title}
        </h3>
        <p className="truncate text-xs text-ink-faint">
          {book.author ?? 'Autor desconhecido'}
          {percent > 0 && <span className="text-ink-dim"> · {Math.round(percent * 100)}%</span>}
        </p>
      </div>
    </article>
  )
}
