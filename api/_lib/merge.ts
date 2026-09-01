import type {
  Annotation,
  AnnotationType,
  Book,
  BookFormat,
  BookStatus,
  Progress,
} from '../../src/lib/types.js'

export type Change =
  | { entity: 'book'; data: Book }
  | { entity: 'progress'; data: Progress }
  | { entity: 'annotation'; data: Annotation }

export interface SyncRequest {
  /** Último `cursor` recebido do servidor. `null` puxa o acervo inteiro. */
  since: string | null
  changes: Change[]
}

export interface SyncResponse {
  cursor: string
  changes: Change[]
}

type Row = Record<string, unknown>

/**
 * Última escrita vence. O empate fica com o servidor: repetir o mesmo carimbo
 * é sinal de reenvio, não de mudança, e reaplicar só gera escrita à toa.
 */
export function shouldApply(incomingUpdatedAt: string, currentUpdatedAt: string | undefined): boolean {
  if (currentUpdatedAt === undefined) return true
  return incomingUpdatedAt > currentUpdatedAt
}

const str = (v: unknown): string => String(v)

/** Etiqueta trafega e é guardada como JSON; conteúdo estranho vira lista vazia. */
function parseTags(value: unknown): string[] {
  if (value === null || value === undefined) return []
  try {
    const parsed = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string') : []
  } catch {
    return []
  }
}
const nullableStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

export function rowToBook(row: Row): Book {
  return {
    id: str(row.id),
    title: str(row.title),
    author: nullableStr(row.author),
    format: str(row.format) as BookFormat,
    language: nullableStr(row.language),
    coverUrl: nullableStr(row.cover_url),
    fileSize: Number(row.file_size),
    spineCount: Number(row.spine_count),
    status: str(row.status) as BookStatus,
    tags: parseTags(row.tags),
    addedAt: str(row.added_at),
    updatedAt: str(row.updated_at),
    deletedAt: nullableStr(row.deleted_at),
  }
}

export function rowToProgress(row: Row): Progress {
  return {
    bookId: str(row.book_id),
    locator: JSON.parse(str(row.locator)),
    percent: Number(row.percent),
    updatedAt: str(row.updated_at),
  }
}

export function rowToAnnotation(row: Row): Annotation {
  return {
    id: str(row.id),
    bookId: str(row.book_id),
    type: str(row.type) as AnnotationType,
    color: nullableStr(row.color),
    anchor: JSON.parse(str(row.anchor)),
    quotedText: str(row.quoted_text),
    noteText: nullableStr(row.note_text),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    deletedAt: nullableStr(row.deleted_at),
  }
}

const FORMATS: readonly string[] = ['epub', 'pdf']
const STATUSES: readonly string[] = ['unread', 'reading', 'finished']
const ANNOTATION_TYPES: readonly string[] = ['highlight', 'note', 'bookmark']

const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200
const isStamp = (v: unknown): v is string => typeof v === 'string' && v.length >= 20
const isOptionalStamp = (v: unknown): boolean => v === null || v === undefined || isStamp(v)
const isTagList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 64 && v.every((tag) => typeof tag === 'string' && tag.length <= 80)

/**
 * A única porta por onde dado de fora entra no banco. É app de um usuário só,
 * mas registro malformado que passa daqui estraga a estante em todos os
 * aparelhos — e sai caro de desfazer.
 */
export function parseChange(raw: unknown): Change | null {
  if (!isObject(raw) || !isObject(raw.data)) return null
  const data = raw.data

  if (raw.entity === 'book') {
    if (!isId(data.id) || !isStamp(data.updatedAt) || !isStamp(data.addedAt)) return null
    if (typeof data.title !== 'string' || !FORMATS.includes(String(data.format))) return null
    if (!STATUSES.includes(String(data.status)) || !isOptionalStamp(data.deletedAt)) return null
    if (data.tags !== undefined && !isTagList(data.tags)) return null
    return { entity: 'book', data: { ...data, tags: data.tags ?? [] } as unknown as Book }
  }

  if (raw.entity === 'progress') {
    if (!isId(data.bookId) || !isStamp(data.updatedAt) || !isObject(data.locator)) return null
    if (typeof data.percent !== 'number' || !Number.isFinite(data.percent)) return null
    return { entity: 'progress', data: data as unknown as Progress }
  }

  if (raw.entity === 'annotation') {
    if (!isId(data.id) || !isId(data.bookId) || !isStamp(data.updatedAt)) return null
    if (!isStamp(data.createdAt) || !ANNOTATION_TYPES.includes(String(data.type))) return null
    if (!isObject(data.anchor) || typeof data.quotedText !== 'string') return null
    if (!isOptionalStamp(data.deletedAt)) return null
    return { entity: 'annotation', data: data as unknown as Annotation }
  }

  return null
}
