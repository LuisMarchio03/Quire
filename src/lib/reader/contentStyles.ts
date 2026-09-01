import { NO_INSETS, type LayoutMetrics, type ReaderTheme, type SafeInsets } from './types'

const FONT_STACKS: Record<ReaderTheme['font'], string> = {
  serif: "'Literata', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  // OpenDyslexic se estiver instalada; o espaçamento largo abaixo ajuda mesmo sem ela.
  easy: "'OpenDyslexic', 'Atkinson Hyperlegible', Verdana, sans-serif",
}

export const PALETTES: Record<ReaderTheme['palette'], { bg: string; fg: string; muted: string }> = {
  light: { bg: '#faf8f5', fg: '#342f2b', muted: '#7a726a' },
  sepia: { bg: '#f3e9d6', fg: '#453524', muted: '#857053' },
  gray: { bg: '#46423d', fg: '#eae5dd', muted: '#b6afa5' },
  dark: { bg: '#201c18', fg: '#c4bdb2', muted: '#8d8478' },
  oled: { bg: '#000000', fg: '#a49d95', muted: '#6b645c' },
}

/**
 * A folha injetada no capítulo. Ela faz três coisas: aplica a tipografia
 * escolhida, transforma o texto em colunas do tamanho exato da tela (é o que
 * dá a virada de página), e neutraliza o CSS do próprio livro onde ele
 * atrapalharia — margem de corpo, largura fixa, cor de fundo.
 */
export function buildContentCss(
  theme: ReaderTheme,
  metrics: LayoutMetrics,
  insets: SafeInsets = NO_INSETS,
): string {
  const palette = PALETTES[theme.palette]
  const gap = theme.margin * 2
  // A largura útil desconta os recortes da tela antes de virar coluna.
  const usableWidth = Math.max(200, metrics.width - insets.left - insets.right)
  const columnWidth = Math.max(120, usableWidth - gap)
  const contentWidth = theme.maxWidth > 0 ? Math.min(columnWidth, theme.maxWidth) : columnWidth
  const sidePad = theme.margin + (columnWidth - contentWidth) / 2

  return `
:root { color-scheme: ${theme.palette === 'light' || theme.palette === 'sepia' ? 'light' : 'dark'}; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: auto !important;
  max-width: none !important;
  background: ${palette.bg} !important;
  color: ${palette.fg};
  -webkit-text-size-adjust: none;
}
#quire-viewport {
  position: fixed;
  inset: ${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px;
  overflow: hidden;
  background: ${palette.bg};
  /* Sem isto, no celular o duplo toque para virar página vira zoom. */
  touch-action: manipulation;
}
#quire-content {
  height: 100%;
  box-sizing: border-box;
  padding: ${theme.margin}px ${sidePad}px;
  column-width: ${contentWidth}px;
  column-gap: ${gap + (columnWidth - contentWidth)}px;
  column-fill: auto;
  transform: translate3d(0, 0, 0);
  transition: transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
  font-family: ${FONT_STACKS[theme.font]};
  font-size: ${theme.fontSize}px;
  line-height: ${theme.lineHeight};
  text-align: ${theme.justify ? 'justify' : 'start'};
  hyphens: ${theme.hyphens ? 'auto' : 'manual'};
  -webkit-hyphens: ${theme.hyphens ? 'auto' : 'manual'};
  ${theme.font === 'easy' ? 'letter-spacing: 0.04em; word-spacing: 0.14em;' : ''}
  orphans: 2;
  widows: 2;
}
#quire-content * {
  max-width: 100% !important;
  background-color: transparent !important;
}
#quire-content img, #quire-content svg, #quire-content figure {
  max-height: ${Math.max(120, metrics.height - insets.top - insets.bottom - theme.margin * 4)}px;
  height: auto;
  object-fit: contain;
  break-inside: avoid;
}
#quire-content p { margin: 0 0 ${Math.round(theme.fontSize * 0.75)}px; }
#quire-content h1, #quire-content h2, #quire-content h3, #quire-content h4 {
  break-after: avoid;
  line-height: 1.25;
  color: ${palette.fg};
}
#quire-content a { color: ${palette.muted}; text-decoration-thickness: 1px; }
#quire-content blockquote {
  margin: 0 0 1em ${theme.margin / 2}px;
  padding-left: ${theme.margin / 2}px;
  border-left: 2px solid ${palette.muted};
  color: ${palette.muted};
}
#quire-content pre, #quire-content code { font-size: 0.9em; white-space: pre-wrap; }
#quire-content table { max-width: 100%; }
::selection { background: rgba(216, 164, 94, 0.35); }
`
}
