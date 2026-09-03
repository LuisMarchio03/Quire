import type { ReactNode } from 'react'
import type { ReaderFont, ReaderPalette, ReaderTheme } from '../../lib/reader/types'
import type { FocusOptions } from './focusMode'
import { UiScaleControl, type UiScaleControls } from '../settings/UiScaleControl'
import { Icon } from '../ui/Icon'

const FONTS: Array<{ value: ReaderFont; label: string; hint: string }> = [
  { value: 'serif', label: 'Serifada', hint: 'Literata' },
  { value: 'sans', label: 'Sem serifa', hint: 'sistema' },
  { value: 'easy', label: 'Leitura fácil', hint: 'espaçada' },
]

const PALETTES: Array<{ value: ReaderPalette; label: string; bg: string; fg: string }> = [
  { value: 'light', label: 'Claro', bg: '#faf8f5', fg: '#342f2b' },
  { value: 'sepia', label: 'Sépia', bg: '#f3e9d6', fg: '#453524' },
  { value: 'gray', label: 'Cinza', bg: '#46423d', fg: '#eae5dd' },
  { value: 'dark', label: 'Escuro', bg: '#201c18', fg: '#c4bdb2' },
  { value: 'oled', label: 'Preto', bg: '#000000', fg: '#a49d95' },
]

const ZOOM_STEP = 0.5

/** Os controles de página fixa — só o PDF tem. */
export interface PageControls {
  zoom: number
  onZoom: (value: number) => void
  crop: boolean
  onCrop: () => void
}

interface TypographyPanelProps {
  theme: ReaderTheme
  focus: FocusOptions
  uiScale?: UiScaleControls
  page?: PageControls
  onTheme: (patch: Partial<ReaderTheme>) => void
  onFocus: (patch: Partial<FocusOptions>) => void
  onReset: () => void
  onClose: () => void
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-6 text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">{children}</p>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2.5">{children}</div>
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
    <Row>
      <span className="text-sm text-ink-dim">{label}</span>
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`Diminuir ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
          className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink"
        >
          −
        </button>
        <span className="w-14 text-center text-[0.8125rem] tabular-nums text-ink">{display}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
          className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink"
        >
          +
        </button>
      </span>
    </Row>
  )
}

function Switch({
  label,
  checked,
  onChange,
  muted = true,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  muted?: boolean
}) {
  return (
    <label className={`flex items-center justify-between gap-3 py-2.5 text-sm ${muted ? 'text-ink-dim' : 'text-ink'}`}>
      {label}
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

/**
 * Folha inferior com os ajustes de leitura. Seções separadas por rótulo e
 * espaço, não por caixas; o que é de página fixa (corte, ampliação) só aparece
 * quando o livro é um PDF.
 */
export function TypographyPanel({
  theme,
  focus,
  uiScale,
  page,
  onTheme,
  onFocus,
  onReset,
  onClose,
}: TypographyPanelProps) {
  return (
    <section
      aria-label="Ajustes de leitura"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 shadow-sheet sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-3xl sm:shadow-pop"
    >
      <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-surface-3 sm:hidden" />

      <div className="flex items-center justify-between">
        <h2 className="text-sm text-ink">Leitura</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar ajustes"
          className="-mr-2 grid size-9 place-items-center rounded-xl text-ink-dim hover:text-ink"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="mt-2 flex rounded-xl bg-surface-2 p-0.5">
        {FONTS.map((font) => {
          const active = theme.font === font.value
          return (
            <button
              key={font.value}
              type="button"
              aria-pressed={active}
              onClick={() => onTheme({ font: font.value })}
              className={`flex-1 rounded-[0.625rem] px-2 py-1.5 text-center transition ${
                active ? 'bg-canvas text-ink' : 'text-ink-dim hover:text-ink'
              }`}
            >
              <span className="block text-[0.8125rem]">{font.label}</span>
              <span className="block text-[0.625rem] text-ink-faint">{font.hint}</span>
            </button>
          )
        })}
      </div>

      <Label>Texto</Label>
      <div className="divide-y divide-line">
        <Stepper
          label="Tamanho"
          value={theme.fontSize}
          display={`${theme.fontSize} px`}
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
          display={`${theme.margin} px`}
          step={4}
          min={8}
          max={96}
          onChange={(margin) => onTheme({ margin })}
        />
        <Stepper
          label="Largura"
          value={theme.maxWidth}
          display={theme.maxWidth === 0 ? 'cheia' : `${theme.maxWidth} px`}
          step={40}
          min={0}
          max={1200}
          onChange={(maxWidth) => onTheme({ maxWidth })}
        />
        <Switch
          label="Justificado"
          checked={theme.justify}
          onChange={(justify) => onTheme({ justify })}
        />
        <Switch
          label="Hifenização"
          checked={theme.hyphens}
          onChange={(hyphens) => onTheme({ hyphens })}
        />
      </div>

      <Label>Paleta</Label>
      <div className="flex justify-between px-1 py-1">
        {PALETTES.map((palette) => {
          const active = theme.palette === palette.value
          return (
            <button
              key={palette.value}
              type="button"
              aria-label={palette.label}
              aria-pressed={active}
              onClick={() => onTheme({ palette: palette.value })}
              style={{ background: palette.bg, color: palette.fg }}
              className={`grid size-10 place-items-center rounded-full font-serif text-[0.8125rem] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08)] transition ${
                active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
              }`}
            >
              Aa
            </button>
          )
        })}
      </div>

      {page && (
        <>
          <Label>Página do PDF</Label>
          <div className="divide-y divide-line">
            <Switch label="Cortar as margens" checked={page.crop} onChange={() => page.onCrop()} />
            <Row>
              <span className="text-sm text-ink-dim">Ampliação</span>
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Diminuir ampliação"
                  onClick={() => page.onZoom(page.zoom - ZOOM_STEP)}
                  className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink"
                >
                  −
                </button>
                <span className="w-14 text-center text-[0.8125rem] tabular-nums text-ink">
                  {Math.round(page.zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Aumentar ampliação"
                  onClick={() => page.onZoom(page.zoom + ZOOM_STEP)}
                  className="grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-dim hover:text-ink"
                >
                  +
                </button>
              </span>
            </Row>
          </div>
        </>
      )}

      <Label>Foco</Label>
      <div className="divide-y divide-line">
        <Switch
          label="Modo foco"
          muted={false}
          checked={focus.enabled}
          onChange={(enabled) => onFocus({ enabled })}
        />
        {focus.enabled && (
          <>
            <Switch
              label="Régua sob a linha"
              checked={focus.ruler}
              onChange={(ruler) => onFocus({ ruler })}
            />
            <label className="block py-2.5 text-sm text-ink-dim">
              Intensidade
              <input
                type="range"
                min={0.05}
                max={0.6}
                step={0.01}
                value={focus.dimOpacity}
                onChange={(event) => onFocus({ dimOpacity: Number(event.target.value) })}
                className="mt-1.5 w-full accent-accent"
              />
            </label>
          </>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        Escurece tudo menos o parágrafo em leitura. As setas ↑ ↓ movem o foco.
      </p>

      {uiScale && (
        <>
          <Label>Interface</Label>
          <UiScaleControl controls={uiScale} variant="panel" />
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Isto muda os controles do app, não o texto do livro — o corpo do texto é o ajuste
            “Tamanho” aqui em cima.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mt-6 w-full rounded-xl bg-surface-2 py-2.5 text-sm text-ink-dim hover:text-ink"
      >
        Voltar ao padrão de leitura
      </button>
    </section>
  )
}
