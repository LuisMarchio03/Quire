import type { ReaderFont, ReaderPalette, ReaderTheme } from '../../lib/reader/types'
import type { FocusOptions } from './focusMode'
import { UiScaleControl, type UiScaleControls } from '../settings/UiScaleControl'

const FONTS: Array<{ value: ReaderFont; label: string; hint: string }> = [
  { value: 'serif', label: 'Serifada', hint: 'Literata' },
  { value: 'sans', label: 'Sem serifa', hint: 'Inter' },
  { value: 'easy', label: 'Leitura fácil', hint: 'espaçada' },
]

const PALETTES: Array<{ value: ReaderPalette; label: string; bg: string; fg: string }> = [
  { value: 'light', label: 'Claro', bg: '#faf8f5', fg: '#1c1917' },
  { value: 'sepia', label: 'Sépia', bg: '#f3e9d6', fg: '#453524' },
  { value: 'gray', label: 'Cinza', bg: '#4a4744', fg: '#e8e5e1' },
  { value: 'dark', label: 'Escuro', bg: '#1c1917', fg: '#cec8c1' },
  { value: 'oled', label: 'Preto', bg: '#000000', fg: '#a49d95' },
]

interface TypographyPanelProps {
  theme: ReaderTheme
  focus: FocusOptions
  uiScale?: UiScaleControls
  onTheme: (patch: Partial<ReaderTheme>) => void
  onFocus: (patch: Partial<FocusOptions>) => void
  onReset: () => void
  onClose: () => void
}

function Stepper({
  label,
  value,
  display,
  onChange,
  step,
  min,
  max,
}: {
  label: string
  value: number
  display: string
  onChange: (value: number) => void
  step: number
  min: number
  max: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-ink-dim">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
          className="size-7 rounded-md border border-line text-ink-dim hover:text-ink"
        >
          −
        </button>
        <span className="w-14 text-center text-sm tabular-nums text-ink">{display}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
          className="size-7 rounded-md border border-line text-ink-dim hover:text-ink"
        >
          +
        </button>
      </div>
    </div>
  )
}

export function TypographyPanel({
  theme,
  focus,
  uiScale,
  onTheme,
  onFocus,
  onReset,
  onClose,
}: TypographyPanelProps) {
  return (
    <section
      aria-label="Ajustes de leitura"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:rounded-2xl sm:border"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Leitura</h2>
        <button type="button" onClick={onClose} aria-label="Fechar ajustes" className="text-ink-dim hover:text-ink">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FONTS.map((font) => (
          <button
            key={font.value}
            type="button"
            onClick={() => onTheme({ font: font.value })}
            className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
              theme.font === font.value
                ? 'border-accent/60 bg-accent/10 text-ink'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            <span className="block text-sm">{font.label}</span>
            <span className="text-ink-faint">{font.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <Stepper
          label="Tamanho"
          value={theme.fontSize}
          display={`${theme.fontSize}px`}
          step={1}
          min={12}
          max={40}
          onChange={(fontSize) => onTheme({ fontSize })}
        />
        <Stepper
          label="Entrelinha"
          value={theme.lineHeight}
          display={theme.lineHeight.toFixed(2)}
          step={0.05}
          min={1.1}
          max={2.4}
          onChange={(lineHeight) => onTheme({ lineHeight })}
        />
        <Stepper
          label="Margem"
          value={theme.margin}
          display={`${theme.margin}px`}
          step={4}
          min={8}
          max={96}
          onChange={(margin) => onTheme({ margin })}
        />
        <Stepper
          label="Largura"
          value={theme.maxWidth}
          display={theme.maxWidth === 0 ? 'cheia' : `${theme.maxWidth}px`}
          step={40}
          min={0}
          max={1200}
          onChange={(maxWidth) => onTheme({ maxWidth })}
        />
      </div>

      <div className="mt-2 flex gap-2 border-t border-line pt-3">
        <label className="flex flex-1 items-center gap-2 text-sm text-ink-dim">
          <input
            type="checkbox"
            checked={theme.justify}
            onChange={(event) => onTheme({ justify: event.target.checked })}
            className="accent-accent"
          />
          Justificado
        </label>
        <label className="flex flex-1 items-center gap-2 text-sm text-ink-dim">
          <input
            type="checkbox"
            checked={theme.hyphens}
            onChange={(event) => onTheme({ hyphens: event.target.checked })}
            className="accent-accent"
          />
          Hifenização
        </label>
      </div>

      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        {PALETTES.map((palette) => (
          <button
            key={palette.value}
            type="button"
            aria-label={palette.label}
            aria-pressed={theme.palette === palette.value}
            onClick={() => onTheme({ palette: palette.value })}
            style={{ background: palette.bg, color: palette.fg }}
            className={`grid h-10 flex-1 place-items-center rounded-lg border font-serif text-sm transition ${
              theme.palette === palette.value ? 'border-accent' : 'border-line'
            }`}
          >
            Aa
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <label className="flex items-center justify-between text-sm text-ink">
          Modo foco
          <input
            type="checkbox"
            checked={focus.enabled}
            onChange={(event) => onFocus({ enabled: event.target.checked })}
            className="accent-accent"
          />
        </label>
        <p className="mt-1 text-xs text-ink-faint">
          Escurece tudo menos o parágrafo em leitura. As setas ↑ ↓ movem o foco.
        </p>

        {focus.enabled && (
          <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
            <label className="flex items-center justify-between text-sm text-ink-dim">
              Régua sob a linha
              <input
                type="checkbox"
                checked={focus.ruler}
                onChange={(event) => onFocus({ ruler: event.target.checked })}
                className="accent-accent"
              />
            </label>
            <label className="block text-sm text-ink-dim">
              Intensidade
              <input
                type="range"
                min={0.05}
                max={0.6}
                step={0.01}
                value={focus.dimOpacity}
                onChange={(event) => onFocus({ dimOpacity: Number(event.target.value) })}
                className="mt-1 w-full accent-accent"
              />
            </label>
          </div>
        )}
      </div>

      {uiScale && (
        <div className="mt-3 border-t border-line pt-3">
          <UiScaleControl controls={uiScale} variant="panel" />
          <p className="mt-1 text-xs text-ink-faint">
            Isto muda os controles do app, não o texto do livro — o corpo do texto é o ajuste
            “Tamanho” aqui em cima.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mt-4 w-full rounded-lg border border-line py-2 text-sm text-ink-dim hover:text-ink"
      >
        Voltar ao padrão de leitura
      </button>
    </section>
  )
}
