interface ReaderControlsProps {
  title: string
  chapterLabel: string
  percent: number
  bookmarked: boolean
  focusEnabled: boolean
  /** Ampliação — só aparece em formato de página fixa, como o PDF. */
  zoom?: { value: number; onChange: (value: number) => void }
  /** Corte das margens da página, que é o que faz a letra encher a tela. */
  crop?: { enabled: boolean; onToggle: () => void }
  onBack: () => void
  onPrev: () => void
  onNext: () => void
  atStart: boolean
  atEnd: boolean
  onToggleBookmark: () => void
  onToggleFocus: () => void
  onOpenTypography: () => void
  onOpenAnnotations: () => void
}

export function ReaderControls({
  title,
  chapterLabel,
  percent,
  bookmarked,
  focusEnabled,
  zoom,
  crop,
  onBack,
  onPrev,
  onNext,
  atStart,
  atEnd,
  onToggleBookmark,
  onToggleFocus,
  onOpenTypography,
  onOpenAnnotations,
}: ReaderControlsProps) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-line/60 bg-canvas/92 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para a estante"
          className="rounded-lg px-2 py-1 text-ink-dim hover:text-ink"
        >
          ←
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm text-ink">{title}</h1>

        <button
          type="button"
          onClick={onToggleFocus}
          aria-label="Modo foco"
          aria-pressed={focusEnabled}
          className={`rounded-lg px-2 py-1 ${focusEnabled ? 'text-accent' : 'text-ink-dim hover:text-ink'}`}
        >
          ◎
        </button>
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={bookmarked ? 'Remover marca de página' : 'Marcar esta página'}
          aria-pressed={bookmarked}
          className={`rounded-lg px-2 py-1 ${bookmarked ? 'text-accent' : 'text-ink-dim hover:text-ink'}`}
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <button
          type="button"
          onClick={onOpenAnnotations}
          aria-label="Anotações"
          className="rounded-lg px-2 py-1 text-ink-dim hover:text-ink"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onOpenTypography}
          aria-label="Ajustes de leitura"
          className="rounded-lg px-2 py-1 font-serif text-ink-dim hover:text-ink"
        >
          Aa
        </button>
      </header>

      {/*
        Setas visíveis nas laterais. As zonas de toque continuam existindo, mas
        ninguém adivinha que elas existem — e sem isto não há como voltar página
        no computador a não ser pelo teclado.
      */}
      <button
        type="button"
        onClick={onPrev}
        disabled={atStart}
        aria-label="Página anterior"
        className="fixed left-2 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-line/60 bg-canvas/80 text-xl text-ink-dim backdrop-blur transition hover:text-ink disabled:opacity-25"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={atEnd}
        aria-label="Próxima página"
        className="fixed right-2 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-line/60 bg-canvas/80 text-xl text-ink-dim backdrop-blur transition hover:text-ink disabled:opacity-25"
      >
        ›
      </button>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-canvas/92 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mb-1.5 h-0.5 w-full overflow-hidden rounded bg-surface-3">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent * 100}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[0.7rem] text-ink-faint">
          <span className="truncate">{chapterLabel}</span>

          {(zoom || crop) && (
            <span className="flex shrink-0 items-center gap-1">
              {crop && (
                <button
                  type="button"
                  onClick={crop.onToggle}
                  aria-pressed={crop.enabled}
                  className={`rounded px-1.5 py-0.5 ${crop.enabled ? 'text-accent' : 'text-ink-faint'}`}
                  title="Cortar as margens da página"
                >
                  ⤢ margens
                </button>
              )}
              {zoom && (
                <>
                  <button
                    type="button"
                    aria-label="Diminuir ampliação"
                    onClick={() => zoom.onChange(zoom.value - 0.5)}
                    className="rounded px-1.5 py-0.5 text-ink-dim"
                  >
                    −
                  </button>
                  <span className="w-9 text-center tabular-nums">
                    {Math.round(zoom.value * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar ampliação"
                    onClick={() => zoom.onChange(zoom.value + 0.5)}
                    className="rounded px-1.5 py-0.5 text-ink-dim"
                  >
                    +
                  </button>
                </>
              )}
            </span>
          )}

          <span className="shrink-0">{Math.round(percent * 100)}%</span>
        </div>
      </footer>
    </>
  )
}
