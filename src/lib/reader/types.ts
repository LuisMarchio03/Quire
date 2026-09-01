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

/** Medidas da área de leitura, em px. */
export interface LayoutMetrics {
  width: number
  height: number
}

/**
 * Faixas que o conteúdo não pode ocupar: recortes da tela (notch, barra de
 * gestos). Sem isso o texto do livro fica embaixo deles no celular.
 */
export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface ReaderEngine {
  mount(container: HTMLElement): Promise<void>
  destroy(): void
  /**
   * Refaz o layout para o tamanho atual da tela, preservando a posição de
   * leitura. No celular isso acontece o tempo todo: a barra de endereço
   * encolhe ao rolar, o aparelho gira, o teclado abre.
   */
  resize(): Promise<void>
  goTo(locator: Locator): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  locate(): Locator
  percent(): number
  /** Quantidade de unidades navegáveis: capítulos no EPUB, páginas no PDF. */
  size(): number
  applyTheme(theme: ReaderTheme): void
  /** Informa as faixas seguras da tela ao conteúdo. */
  applyInsets(insets: SafeInsets): void
  /**
   * O PDF admite ampliação porque a página tem largura fixa: numa tela de
   * celular, encaixada na largura, a letra fica pequena demais. O EPUB reflui
   * o texto, então ali quem faz esse papel é o tamanho da fonte.
   */
  canZoom(): boolean
  getZoom(): number
  setZoom(scale: number): Promise<void>
  /**
   * Corte das margens da página. Só faz sentido em formato de página fixa: é o
   * que permite o texto de um PDF encher a largura do celular sem ampliação.
   */
  canCrop(): boolean
  getCrop(): boolean
  setCrop(enabled: boolean): Promise<void>
  /** Raiz do conteúdo renderizado — é onde modo foco e anotações trabalham. */
  contentRoot(): Element | null
  /**
   * Documento em que o conteúdo vive. No EPUB é o do iframe, e é nele que os
   * gestos precisam ser ouvidos: clique dentro de iframe não sobe para a página.
   */
  contentDocument(): Document | null
  /** Página atual dentro do capítulo e total, para a barra de progresso. */
  pageInChapter(): { page: number; pages: number }
  search(query: string, limit?: number): Promise<SearchHit[]>
  rectsForAnchor(anchor: Anchor): DOMRect[]
  on(event: 'relocated', handler: (locator: Locator) => void): () => void
}
