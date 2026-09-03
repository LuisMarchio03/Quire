/** Tipos de domínio do acervo. Compartilhados entre app, espelho local e API. */

export type BookFormat = 'epub' | 'pdf'
export type BookStatus = 'unread' | 'reading' | 'finished'
export type AnnotationType = 'highlight' | 'note' | 'bookmark'

/**
 * Onde o leitor está. `spineIndex` é o capítulo no EPUB ou a página no PDF;
 * `progressInSpine` vai de 0 a 1 dentro dele. Nada aqui é pixel: o locator
 * precisa sobreviver a troca de fonte, de tamanho e de tela.
 */
export interface Locator {
  spineIndex: number
  progressInSpine: number
  label?: string
}

/**
 * Onde uma anotação mora. No EPUB, o caminho é a sequência de índices de filho
 * da raiz até o nó de texto. No PDF, a posição é fixa, então retângulos
 * normalizados pela caixa da página bastam.
 */
export type Anchor =
  | {
      kind: 'epub'
      spineIndex: number
      startPath: number[]
      startOffset: number
      endPath: number[]
      endOffset: number
    }
  | {
      kind: 'pdf'
      page: number
      rects: Array<{ x: number; y: number; w: number; h: number }>
    }

export interface Book {
  id: string
  title: string
  author: string | null
  format: BookFormat
  language: string | null
  /** Miniatura da capa como data URL webp. Sincroniza; o arquivo do livro não. */
  coverUrl: string | null
  fileSize: number
  spineCount: number
  status: BookStatus
  /** Etiquetas livres. Moram no próprio livro para sincronizarem junto com ele. */
  tags: string[]
  /**
   * Outros SHA-256 que são este mesmo livro: o arquivo que chegou ao celular
   * não é byte a byte o do computador, mas o dono disse que é o mesmo. A lista
   * só cresce — ao aplicar uma mudança vinda do servidor, faz-se a união.
   */
  aliases: string[]
  addedAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Progress {
  bookId: string
  locator: Locator
  percent: number
  updatedAt: string
}

export interface Annotation {
  id: string
  bookId: string
  type: AnnotationType
  color: string | null
  anchor: Anchor
  quotedText: string
  noteText: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type OutboxEntity = 'book' | 'progress' | 'annotation'

/**
 * Uma escrita local à espera de subir. Guarda a referência, não uma cópia: na
 * hora de enviar, o estado atual do registro é lido do espelho, então uma fila
 * atrasada nunca ressuscita um valor velho.
 */
export interface OutboxEntry {
  /** `${entity}:${key}` — a chave própria dedupa reescritas do mesmo registro. */
  id: string
  seq: number
  entity: OutboxEntity
  key: string
  queuedAt: string
}

export const HIGHLIGHT_COLORS = ['#e8c468', '#7fc4a2', '#8ab4e8', '#dd93b8'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]
