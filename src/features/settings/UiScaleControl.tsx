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
    <div>
      <div className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <h2 className={`text-sm ${compacto ? 'text-ink-dim' : 'text-ink'}`}>Tamanho da interface</h2>
          {!compacto && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
              Aumenta botões, menus e a estante. O texto do livro tem controle próprio, dentro da
              leitura.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Diminuir interface"
            onClick={controls.decrease}
            disabled={controls.atMin}
            className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink disabled:opacity-30"
          >
            −
          </button>
          <span className="w-14 text-center text-[0.8125rem] tabular-nums text-ink">
            {Math.round(controls.scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Aumentar interface"
            onClick={controls.increase}
            disabled={controls.atMax}
            className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      {controls.scale !== 1 && (
        <button
          type="button"
          onClick={controls.reset}
          className="text-xs text-ink-faint underline underline-offset-2 hover:text-ink-dim"
        >
          Voltar a 100%
        </button>
      )}
    </div>
  )
}
