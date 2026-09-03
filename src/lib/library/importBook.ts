import { sha256Hex } from '../hash'
import { parseEpub } from '../epub/parseEpub'
import { loadPdf } from '../reader/loadPdf'
import { createBookStore, type BookStore } from '../store/bookStore'
import { localMirror } from '../store/localMirror'
import { nowIso } from '../time'
import type { Book, BookFormat } from '../types'
import { makeCoverThumbnail } from './cover'
import { normalizeTags } from './tags'

export type ImportStage = 'hash' | 'leitura' | 'capa' | 'gravação' | 'pronto'

export type ImportResult =
  | { status: 'added'; book: Book }
  /** O arquivo já pertence a um livro do acervo: reencontrou o próprio histórico. */
  | { status: 'relinked'; book: Book }
  | { status: 'unsupported'; reason: string }

export interface ImportDeps {
  store?: BookStore
  loadPdfSource?: typeof loadPdf
  makeCover?: (source: Blob | HTMLCanvasElement) => Promise<string | null>
}

export interface ImportOptions {
  onProgress?: (stage: ImportStage, fraction: number) => void
  deps?: ImportDeps
}

const ZIP_MAGIC = [0x50, 0x4b]
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]

function detectFormat(head: Uint8Array, fileName: string): BookFormat | null {
  const starts = (magic: number[]) => magic.every((byte, index) => head[index] === byte)
  if (starts(PDF_MAGIC)) return 'pdf'
  // Todo EPUB é um zip; a extensão desempata contra .zip comum.
  if (starts(ZIP_MAGIC) && /\.(epub|zip)$/i.test(fileName)) return 'epub'
  if (starts(ZIP_MAGIC) && !fileName.includes('.')) return 'epub'
  return null
}

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim() || 'Sem título'

/**
 * Traz um arquivo para o acervo.
 *
 * A ordem importa: o hash vem primeiro porque é a identidade do livro, e é ele
 * que decide entre adicionar e reconectar. A gravação do arquivo é a última
 * coisa a acontecer — se a leitura falhar no meio, não sobra lixo guardado.
 */
export async function importBook(file: File, options: ImportOptions = {}): Promise<ImportResult> {
  const { onProgress, deps = {} } = options
  const store = deps.store ?? createBookStore()
  const readPdf = deps.loadPdfSource ?? loadPdf
  const makeCover = deps.makeCover ?? makeCoverThumbnail

  const report = (stage: ImportStage, fraction = 1) => onProgress?.(stage, fraction)

  report('hash', 0)
  const id = await sha256Hex(file, (fraction) => report('hash', fraction))

  // Pelo id ou por alias: um arquivo que o dono já disse ser "o mesmo livro"
  // reencontra o registro dele, e fica guardado sob o id desse registro.
  const existing = await localMirror.findBookByFileId(id)
  if (existing) {
    if (!(await store.has(existing.id))) await store.put(existing.id, file)
    const restored: Book = existing.deletedAt
      ? { ...existing, deletedAt: null, updatedAt: nowIso() }
      : existing
    if (restored !== existing) await localMirror.saveBook(restored)
    report('pronto')
    return { status: 'relinked', book: restored }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = detectFormat(bytes.subarray(0, 8), file.name)
  if (!format) {
    return { status: 'unsupported', reason: 'formato não reconhecido — use EPUB ou PDF' }
  }

  report('leitura')
  let title = baseName(file.name)
  let author: string | null = null
  let language: string | null = null
  let spineCount = 0
  let tags: string[] = []
  let coverSource: Blob | HTMLCanvasElement | null = null

  try {
    if (format === 'epub') {
      const epub = await parseEpub(bytes)
      title = epub.metadata.title || title
      author = epub.metadata.author
      language = epub.metadata.language
      spineCount = epub.spine.length
      // EPUB costuma trazer assunto no metadado; vira etiqueta já preenchida.
      tags = normalizeTags(epub.metadata.subjects)
      const cover = epub.coverPath ? epub.resource(epub.coverPath) : undefined
      if (cover) coverSource = new Blob([cover.bytes as BlobPart], { type: cover.mediaType })
    } else {
      const pdf = await readPdf(bytes)
      title = pdf.title || title
      author = pdf.author
      spineCount = pdf.numPages
      coverSource = await pdf.renderCover(400)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'não foi possível ler o arquivo'
    return { status: 'unsupported', reason }
  }

  report('capa')
  const coverUrl = coverSource ? await makeCover(coverSource) : null

  report('gravação')
  const now = nowIso()
  const book: Book = {
    id,
    title,
    author,
    format,
    language,
    coverUrl,
    fileSize: file.size,
    spineCount,
    status: 'unread',
    tags,
    aliases: [],
    addedAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  await store.put(id, file)
  try {
    await localMirror.saveBook(book)
  } catch (error) {
    await store.delete(id)
    throw error
  }

  report('pronto')
  return { status: 'added', book }
}
