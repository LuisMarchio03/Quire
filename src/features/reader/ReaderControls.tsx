import { Icon } from '../ui/Icon'

interface ReaderControlsProps {
  title: string
  chapterLabel: string
  percent: number
  bookmarked: boolean
  focusEnabled: boolean
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

const iconButton = (active = false) =>
  `grid size-9 shrink-0 place-items-center rounded-xl transition ${
    active ? 'text-accent' : 'text-ink-dim hover:text-ink'
  }`

/**
 * O cromo do leitor: uma faixa em cima, uma linha embaixo. Nada de borda nem
 * caixa — as duas se dissolvem no fundo por um degradê, e somem com um toque
 * no centro da página.
 */
export function ReaderControls({
  title,
  chapterLabel,
  percent,
  bookmarked,
  focusEnabled,
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
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-0.5 bg-linear-to-b from-canvas via-canvas/90 to-transparent px-2 pb-5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="Voltar para a estante" className={iconButton()}>
          <Icon name="back" />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-1 text-[0.8125rem] text-ink-dim">{title}</h1>

        <button
          type="button"
          onClick={onToggleFocus}
          aria-label="Modo foco"
          aria-pressed={focusEnabled}
          className={iconButton(focusEnabled)}
        >
          <Icon name="focus" />
        </button>
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={bookmarked ? 'Remover marca de página' : 'Marcar esta página'}
          aria-pressed={bookmarked}
          className={iconButton(bookmarked)}
        >
          <Icon name="bookmark" filled={bookmarked} />
        </button>
        <button type="button" onClick={onOpenAnnotations} aria-label="Anotações" className={iconButton()}>
          <Icon name="notes" />
        </button>
        <button
          type="button"
          onClick={onOpenTypography}
          aria-label="Ajustes de leitura"
          className={`${iconButton()} font-serif text-[1.05rem]`}
        >
          Aa
        </button>
      </header>

      {/*
        As setas moram aqui, e não flutuando sobre a página: botão opaco no
        meio da tela cobre justamente a linha que se está lendo. E só aparecem
        onde há mouse — no celular, toque nas laterais e deslizar bastam.
      */}
      <footer className="fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-6">
        <div className="flex items-center justify-center gap-2 text-xs text-ink-faint tabular-nums">
          <button
            type="button"
            onClick={onPrev}
            disabled={atStart}
            aria-label="Página anterior"
            className="hidden size-8 place-items-center rounded-lg text-ink-faint transition hover:text-ink disabled:opacity-25 [@media(hover:hover)]:grid"
          >
            <Icon name="chevronLeft" size={18} />
          </button>

          <span className="truncate">{chapterLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{Math.round(percent * 100)}%</span>

          <button
            type="button"
            onClick={onNext}
            disabled={atEnd}
            aria-label="Próxima página"
            className="hidden size-8 place-items-center rounded-lg text-ink-faint transition hover:text-ink disabled:opacity-25 [@media(hover:hover)]:grid"
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>

        {/* O fio de progresso fica na borda, acima da faixa de gestos do aparelho. */}
        <div className="absolute inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] h-0.5 bg-surface-2">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent * 100}%` }} />
        </div>
      </footer>
    </>
  )
}
