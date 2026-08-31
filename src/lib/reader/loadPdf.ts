import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfSource } from './pdfEngine'

/**
 * Cola fina sobre o pdf.js. Fica isolada num módulo próprio para que o resto
 * do leitor não arraste a biblioteca inteira — e para que os testes de
 * navegação possam usar um documento falso.
 */
export interface LoadedPdf extends PdfSource {
  title: string | null
  author: string | null
  /** Desenha a primeira página num canvas, para virar capa. */
  renderCover(maxWidth: number): Promise<HTMLCanvasElement | null>
}

let pdfjs: typeof import('pdfjs-dist') | null = null

/** O pdf.js só é baixado quando um PDF é realmente aberto. */
async function loadLibrary() {
  if (pdfjs) return pdfjs
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  pdfjs = lib
  return lib
}

export async function loadPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  const lib = await loadLibrary()
  // O pdf.js assume a posse do buffer; uma cópia evita que o arquivo guardado
  // no acervo apareça vazio depois de aberto uma vez.
  const pdf = await lib.getDocument({ data: new Uint8Array(bytes) }).promise

  let title: string | null = null
  let author: string | null = null
  try {
    const info = (await pdf.getMetadata()).info as { Title?: string; Author?: string }
    title = info.Title?.trim() || null
    author = info.Author?.trim() || null
  } catch {
    /* PDF sem metadados é comum; o nome do arquivo assume o lugar do título */
  }

  return {
    numPages: pdf.numPages,
    getPage: (pageNumber) => pdf.getPage(pageNumber) as never,

    title,
    author,

    async renderCover(maxWidth) {
      const page = await pdf.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(maxWidth / base.width, 2) })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) return null
      await page.render({ canvasContext: context, viewport, canvas }).promise
      return canvas
    },
  }
}
