import type { Anchor, Locator } from '../types'

export type ReaderFont = 'serif' | 'sans' | 'easy'
export type ReaderPalette = 'light' | 'sepia' | 'gray' | 'dark' | 'oled'

export interface ReaderTheme {
  font: ReaderFont
  /** Corpo do texto em px. */
  fontSize: number
  lineHeight: number
  /** Margem lateral em px — também define o vão entre as páginas. */
  margin: number
  /** Largura máxima da coluna de texto em px; 0 usa a tela inteira. */
  maxWidth: number
  justify: boolean
  hyphens: boolean
  palette: ReaderPalette
}

export const DEFAULT_THEME: ReaderTheme = {
  font: 'serif',
  fontSize: 19,
  lineHeight: 1.6,
  margin: 28,
  maxWidth: 680,
  justify: false,
  hyphens: true,
  palette: 'dark',
}

export interface SearchHit {
  locator: Locator
  excerpt: string
}

export interface ReaderEngine {
  mount(container: HTMLElement): Promise<void>
  destroy(): void
  goTo(locator: Locator): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  locate(): Locator
  percent(): number
  /** Quantidade de unidades navegáveis: capítulos no EPUB, páginas no PDF. */
  size(): number
  applyTheme(theme: ReaderTheme): void
  /** Raiz do conteúdo renderizado — é onde modo foco e anotações trabalham. */
  contentRoot(): Element | null
  /** Página atual dentro do capítulo e total, para a barra de progresso. */
  pageInChapter(): { page: number; pages: number }
  search(query: string, limit?: number): Promise<SearchHit[]>
  rectsForAnchor(anchor: Anchor): DOMRect[]
  on(event: 'relocated', handler: (locator: Locator) => void): () => void
}
