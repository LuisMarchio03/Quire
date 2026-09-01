export interface UiScaleControls {
  scale: number
  increase: () => void
  decrease: () => void
  reset: () => void
  atMin: boolean
  atMax: boolean
}

interface UiScaleControlProps {
  controls: UiScaleControls
  /** `panel` é a versão compacta, para caber junto dos ajustes de leitura. */
  variant?: 'section' | 'panel'
}

export function UiScaleControl({ controls, variant = 'section' }: UiScaleControlProps) {
  const compacto = variant === 'panel'

  return (
    <div className={compacto ? '' : 'rounded-xl border border-line bg-surface p-4'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className={compacto ? 'text-sm text-ink' : 'text-sm font-medium text-ink'}>
            Tamanho da interface
          </h2>
          {!compacto && (
            <p className="mt-1 text-xs text-ink-faint">
              Aumenta botões, menus e a estante. O texto do livro tem controle próprio, dentro da
              leitura.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Diminuir interface"
            onClick={controls.decrease}
            disabled={controls.atMin}
            className="size-8 rounded-md border border-line text-ink-dim hover:text-ink disabled:opacity-30"
          >
            −
          </button>
          <span className="w-14 text-center text-sm tabular-nums text-ink">
            {Math.round(controls.scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Aumentar interface"
            onClick={controls.increase}
            disabled={controls.atMax}
            className="size-8 rounded-md border border-line text-ink-dim hover:text-ink disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      {controls.scale !== 1 && (
        <button
          type="button"
          onClick={controls.reset}
          className="mt-2 text-xs text-ink-faint underline underline-offset-2 hover:text-ink-dim"
        >
          Voltar a 100%
        </button>
      )}
    </div>
  )
}
