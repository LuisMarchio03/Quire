interface ReaderControlsProps {
  title: string
  chapterLabel: string
  percent: number
  bookmarked: boolean
  focusEnabled: boolean
  onBack: () => void
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
  onBack,
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

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-canvas/92 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mb-1.5 h-0.5 w-full overflow-hidden rounded bg-surface-3">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent * 100}%` }} />
        </div>
        <div className="flex justify-between text-[0.7rem] text-ink-faint">
          <span>{chapterLabel}</span>
          <span>{Math.round(percent * 100)}%</span>
        </div>
      </footer>
    </>
  )
}
