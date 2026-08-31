import type { Anchor, Locator } from '../types'
import { PALETTES } from './contentStyles'
import { DEFAULT_THEME, type ReaderEngine, type ReaderTheme, type SearchHit } from './types'

/**
 * Interface mínima do documento PDF de que o motor precisa. Ela existe para
 * que a navegação seja testável sem carregar o pdf.js inteiro — e para que
 * trocar de biblioteca um dia não signifique reescrever o leitor.
 */
export interface PdfViewport {
  width: number
  height: number
  scale: number
  transform: number[]
}

export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

export interface PdfPageLike {
  getViewport(options: { scale: number }): PdfViewport
  render(options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
    canvas?: HTMLCanvasElement
  }): { promise: Promise<void>; cancel?: () => void }
  getTextContent(): Promise<{ items: PdfTextItem[] }>
}

export interface PdfSource {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
}

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Multiplicação das matrizes 2D do PDF — as duas vêm como seis números. */
function multiply(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

const INVERTING_PALETTES: ReadonlyArray<ReaderTheme['palette']> = ['dark', 'oled', 'gray']

export function createPdfEngine(source: PdfSource): ReaderEngine {
  let wrapper: HTMLElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let textLayer: HTMLElement | null = null
  let theme: ReaderTheme = DEFAULT_THEME
  let pageNumber = 1
  let renderToken = 0

  const listeners = new Set<(locator: Locator) => void>()
  const textCache = new Map<number, string>()

  function emit() {
    const locator = engine.locate()
    for (const listener of listeners) listener(locator)
  }

  function applyPalette() {
    if (!wrapper || !canvas) return
    const palette = PALETTES[theme.palette]
    wrapper.style.background = palette.bg
    // O PDF tem página branca gravada; inverter o canvas é o que dá leitura
    // noturna sem mexer no arquivo. A camada de texto fica fora do filtro.
    canvas.style.filter = INVERTING_PALETTES.includes(theme.palette)
      ? 'invert(1) hue-rotate(180deg) brightness(0.92)'
      : ''
  }

  function paintTextLayer(items: PdfTextItem[], viewport: PdfViewport) {
    if (!textLayer) return
    textLayer.replaceChildren()

    for (const item of items) {
      if (!item.str.trim()) continue
      const transform = multiply(viewport.transform, item.transform)
      const fontHeight = Math.hypot(transform[2], transform[3]) || item.height
      const span = document.createElement('span')
      span.textContent = item.str
      span.style.cssText = [
        'position:absolute',
        'white-space:pre',
        'transform-origin:0 0',
        'color:transparent',
        `left:${transform[4]}px`,
        `top:${transform[5] - fontHeight}px`,
        `font-size:${fontHeight}px`,
        'font-family:sans-serif',
      ].join(';')
      textLayer.append(span)
    }
  }

  async function renderPage(target: number) {
    if (!canvas || !textLayer) return
    pageNumber = Math.min(Math.max(target, 1), source.numPages)
    const token = ++renderToken

    const page = await source.getPage(pageNumber)
    if (token !== renderToken) return

    const available = wrapper?.clientWidth || 0
    const base = page.getViewport({ scale: 1 })
    const scale = available > 0 ? available / base.width : 1
    const viewport = page.getViewport({ scale })
    const ratio = globalThis.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    textLayer.style.width = `${viewport.width}px`
    textLayer.style.height = `${viewport.height}px`

    const context = canvas.getContext('2d')
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, viewport.width, viewport.height)
      await page.render({ canvasContext: context, viewport, canvas }).promise
    }

    const { items } = await page.getTextContent()
    if (token !== renderToken) return
    paintTextLayer(items, viewport)
    applyPalette()
  }

  async function pageText(index: number): Promise<string> {
    const cached = textCache.get(index)
    if (cached !== undefined) return cached
    const page = await source.getPage(index + 1)
    const { items } = await page.getTextContent()
    const text = items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim()
    textCache.set(index, text)
    return text
  }

  const engine: ReaderEngine = {
    async mount(container) {
      wrapper = document.createElement('div')
      wrapper.style.cssText =
        'position:relative;width:100%;height:100%;overflow:auto;display:flex;justify-content:center;align-items:flex-start'

      const stack = document.createElement('div')
      stack.style.cssText = 'position:relative'

      canvas = document.createElement('canvas')
      canvas.style.cssText = 'display:block;max-width:100%'

      textLayer = document.createElement('div')
      textLayer.setAttribute('data-quire-text-layer', '')
      textLayer.style.cssText =
        'position:absolute;inset:0;overflow:hidden;line-height:1;opacity:1;user-select:text'

      stack.append(canvas, textLayer)
      wrapper.append(stack)
      container.append(wrapper)

      await renderPage(pageNumber)
    },

    destroy() {
      renderToken++
      listeners.clear()
      wrapper?.remove()
      wrapper = null
      canvas = null
      textLayer = null
    },

    async goTo(locator) {
      await renderPage(locator.spineIndex + 1)
      emit()
    },

    async next() {
      if (pageNumber >= source.numPages) return
      await renderPage(pageNumber + 1)
      emit()
    },

    async prev() {
      if (pageNumber <= 1) return
      await renderPage(pageNumber - 1)
      emit()
    },

    locate: () => ({ spineIndex: pageNumber - 1, progressInSpine: 0 }),

    percent: () => pageNumber / source.numPages,

    size: () => source.numPages,

    applyTheme(next) {
      theme = next
      applyPalette()
    },

    contentRoot: () => textLayer,

    pageInChapter: () => ({ page: pageNumber, pages: source.numPages }),

    async search(query, limit = 50) {
      const needle = fold(query.trim())
      if (!needle) return []

      const hits: SearchHit[] = []
      for (let index = 0; index < source.numPages && hits.length < limit; index++) {
        const text = await pageText(index)
        const haystack = fold(text)
        let from = 0
        while (hits.length < limit) {
          const at = haystack.indexOf(needle, from)
          if (at === -1) break
          hits.push({
            locator: { spineIndex: index, progressInSpine: 0 },
            excerpt: text.slice(Math.max(0, at - 40), at + needle.length + 40).trim(),
          })
          from = at + needle.length
        }
      }
      return hits
    },

    rectsForAnchor(anchor: Anchor) {
      if (anchor.kind !== 'pdf' || !textLayer || anchor.page !== pageNumber - 1) return []
      const width = textLayer.clientWidth
      const height = textLayer.clientHeight
      return anchor.rects.map(
        (rect) => new DOMRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height),
      )
    },

    on(_event, handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
  }

  return engine
}
