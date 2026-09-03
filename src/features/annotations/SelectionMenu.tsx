import { HIGHLIGHT_COLORS, type HighlightColor } from '../../lib/types'
import { Icon } from '../ui/Icon'

interface SelectionMenuProps {
  /** Posição na janela, já convertida das coordenadas do conteúdo. */
  x: number
  y: number
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
  onCopy: () => void
  onClose: () => void
}

export function SelectionMenu({ x, y, onHighlight, onNote, onCopy, onClose }: SelectionMenuProps) {
  return (
    <div
      role="menu"
      aria-label="Ações do trecho selecionado"
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
      className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-2 py-1.5 pl-2.5 pr-1.5 shadow-pop"
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Destacar em ${colorName(color)}`}
          onClick={() => onHighlight(color)}
          style={{ background: color }}
          className="size-6 rounded-full transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      ))}
      <span className="mx-1 h-4 w-px bg-line" />
      <button
        type="button"
        onClick={onNote}
        className="rounded-full px-2 py-1 text-xs text-ink-dim hover:text-ink"
      >
        Nota
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-full px-2 py-1 text-xs text-ink-dim hover:text-ink"
      >
        Copiar
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="grid size-7 place-items-center rounded-full text-ink-faint hover:text-ink"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

function colorName(color: HighlightColor): string {
  return { '#e8c468': 'amarelo', '#7fc4a2': 'verde', '#8ab4e8': 'azul', '#dd93b8': 'rosa' }[color]
}
