import type { Anchor, Locator } from '../types'
import { findContentBox, type ContentBox } from './contentBox'
import { PALETTES } from './contentStyles'
import {
  DEFAULT_THEME,
  NO_INSETS,
  type LayoutMetrics,
  type ReaderEngine,
  type ReaderTheme,
  type SafeInsets,
  type SearchHit,
} from './types'

export interface PdfEngineOptions {
  /** De onde sai o tamanho da área de leitura; o teste substitui por medidas fixas. */
  measure?: () => LayoutMetrics
  /**
   * Começa com o corte de margens ligado. Sem valor, decide pela largura: num
   * celular ele é o que torna a letra legível; num computador sobra tela, e
   * ligá-lo só acrescentaria risco sem ganho.
   */
  crop?: boolean
  /**
   * Como descobrir a caixa de conteúdo da página. O padrão desenha uma prova em
   * baixa resolução e lê os pixels; o teste injeta uma caixa pronta.
   */
  detectBox?: (page: PdfPageLike, base: PdfViewport) => Promise<ContentBox | null>
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6
/**
 * Respiro lateral, em fração da largura. Cortar a margem da folha até o texto
 * encostar nas duas bordas da tela é tão ruim de ler quanto não cortar nada.
 */
const COMFORT_MARGIN = 0.04

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

export function createPdfEngine(source: PdfSource, options: PdfEngineOptions = {}): ReaderEngine {
  let wrapper: HTMLElement | null = null
  let insets: SafeInsets = NO_INSETS
  let zoom = 1
  const CROP_MAX_WIDTH = 700
  let crop = options.crop ?? false
  let cropDecidido = options.crop !== undefined
  let stack: HTMLElement | null = null
  let documentBox: Promise<ContentBox | null> | null = null
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

  const metrics: () => LayoutMetrics =
    options.measure ??
    (() => ({ width: wrapper?.clientWidth || 0, height: wrapper?.clientHeight || 0 }))

  /**
   * Descobre onde está o texto desenhando a página pequena e lendo os pixels.
   * A prova é barata: um quinto do tamanho basta para achar as margens.
   */
  async function defaultDetectBox(page: PdfPageLike, base: PdfViewport): Promise<ContentBox | null> {
    const probeScale = Math.min(0.3, 400 / Math.max(1, base.width))
    const viewport = page.getViewport({ scale: probeScale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) return null

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport, canvas }).promise

    try {
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      return findContentBox(data, canvas.width, canvas.height)
    } catch {
      // Alguns ambientes recusam ler os pixels; sem corte a leitura continua.
      return null
    }
  }

  const detectBox = options.detectBox ?? defaultDetectBox

  const MIN_BOX_WIDTH = 0.5
  const MIN_BOX_HEIGHT = 0.3
  const SAMPLE_PAGES = 5

  /**
   * Uma caixa para o documento inteiro, e não uma por página.
   *
   * Medir página a página seria pior de duas formas: a folha de rosto tem bloco
   * estreito e ampliaria demais, e cada virada mudaria a escala — ler assim é
   * como ter alguém mexendo no zoom o tempo todo. Amostrando páginas espalhadas
   * e unindo as caixas, o resultado é estável e nunca corta conteúdo de nenhuma
   * delas.
   */
  async function computeDocumentBox(): Promise<ContentBox | null> {
    const total = source.numPages
    const amostras = Math.min(SAMPLE_PAGES, total)
    const indices = new Set<number>()
    for (let i = 0; i < amostras; i++) {
      indices.add(Math.min(total, Math.max(1, Math.round(((i + 0.5) / amostras) * total))))
    }

    const encontradas: ContentBox[] = []
    for (const numero of indices) {
      try {
        const page = await source.getPage(numero)
        const box = await detectBox(page, page.getViewport({ scale: 1 }))
        if (box) encontradas.push(box)
      } catch {
        // Página ilegível não impede as outras de contribuírem.
      }
    }
    if (encontradas.length === 0) return null

    const x = Math.min(...encontradas.map((b) => b.x))
    const y = Math.min(...encontradas.map((b) => b.y))
    const direita = Math.max(...encontradas.map((b) => b.x + b.w))
    const baixo = Math.max(...encontradas.map((b) => b.y + b.h))

    // Caixa estreita demais amplia demais; o limite prende a ampliação em 2×.
    const w = Math.min(1, Math.max(MIN_BOX_WIDTH, direita - x))
    const h = Math.min(1, Math.max(MIN_BOX_HEIGHT, baixo - y))
    if (w > 0.94 && h > 0.94) return null

    return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h }
  }

  async function boxFor(): Promise<ContentBox | null> {
    if (!crop) return null
    documentBox ??= computeDocumentBox().catch(() => null)
    return documentBox
  }

  function applyInsetPadding() {
    if (!wrapper) return
    wrapper.style.paddingTop = `${insets.top}px`
    wrapper.style.paddingRight = `${insets.right}px`
    wrapper.style.paddingBottom = `${insets.bottom}px`
    wrapper.style.paddingLeft = `${insets.left}px`
  }

  function applyPalette() {
    if (!wrapper || !canvas) return
    const palette = PALETTES[theme.palette]
    wrapper.style.background = palette.bg
    // O PDF tem página branca gravada; inverter o canvas é o que dá leitura
    // noturna sem mexer no arquivo. A camada de texto fica fora do filtro.
    // Inverter sozinho transforma a folha branca em preto puro, que é
    // justamente o pior fundo para ler. Baixar o contraste antes de clarear
    // deixa a página num cinza-escuro e mantém a letra bem clara.
    canvas.style.filter = INVERTING_PALETTES.includes(theme.palette)
      ? 'invert(1) hue-rotate(180deg) contrast(0.65) sepia(0.14)'
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

    // A largura útil desconta os recortes da tela; o zoom multiplica em cima
    // disso, e o excedente vira rolagem no contêiner — que é como se arrasta a
    // página ampliada no celular.
    const available = Math.max(0, metrics().width - insets.left - insets.right)
    if (!cropDecidido && available > 0) {
      crop = available < CROP_MAX_WIDTH
      cropDecidido = true
    }
    const base = page.getViewport({ scale: 1 })
    const box = await boxFor()
    if (token !== renderToken) return

    // Com o corte, quem precisa caber na tela é a caixa do texto, não a folha.
    // É isso que faz a letra crescer sem ninguém ampliar nada.
    // Com corte, parte da largura vira margem; sem corte a folha já traz a dela.
    const util = box ? available * (1 - COMFORT_MARGIN * 2) : available
    const fitWidth = util > 0 ? util / (base.width * (box?.w ?? 1)) : 1
    const viewport = page.getViewport({ scale: fitWidth * zoom })
    const ratio = globalThis.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    canvas.style.width = `${Math.round(viewport.width)}px`
    canvas.style.height = `${Math.round(viewport.height)}px`
    textLayer.style.width = `${Math.round(viewport.width)}px`
    textLayer.style.height = `${Math.round(viewport.height)}px`

    // A janela recorta; a folha desliza por baixo dela. Empurrar a folha com
    // margem negativa somaria ao alinhamento do contêiner e a jogaria para fora.
    const recorteX = box ? Math.round(box.x * viewport.width) : 0
    const recorteY = box ? Math.round(box.y * viewport.height) : 0
    canvas.style.left = `${-recorteX}px`
    canvas.style.top = `${-recorteY}px`
    textLayer.style.left = `${-recorteX}px`
    textLayer.style.top = `${-recorteY}px`

    if (stack) {
      stack.style.width = `${Math.round(viewport.width * (box?.w ?? 1))}px`
      stack.style.height = `${Math.round(viewport.height * (box?.h ?? 1))}px`
    }

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
      // `safe center` centraliza quando cabe e encosta à esquerda quando não
      // cabe — com `center` puro, a parte à esquerda de uma página ampliada
      // fica inalcançável pela rolagem.
      // `safe center` nos dois eixos: centraliza enquanto couber e encosta na
      // borda quando não couber — sem isso, ou sobra vão morto embaixo de uma
      // página curta, ou a parte de cima de uma página ampliada fica
      // inalcançável pela rolagem.
      wrapper.style.cssText =
        'position:relative;width:100%;height:100%;overflow:auto;display:flex;' +
        'align-items:center;align-items:safe center;' +
        'justify-content:center;justify-content:safe center'

      stack = document.createElement('div')
      stack.style.cssText = 'position:relative;overflow:hidden;flex:none'

      canvas = document.createElement('canvas')
      canvas.style.cssText = 'display:block;position:absolute;left:0;top:0'

      textLayer = document.createElement('div')
      textLayer.setAttribute('data-quire-text-layer', '')
      textLayer.style.cssText =
        'position:absolute;left:0;top:0;overflow:hidden;line-height:1;user-select:text'

      stack.append(canvas, textLayer)
      wrapper.append(stack)
      container.append(wrapper)
      applyInsetPadding()

      await renderPage(pageNumber)
    },

    destroy() {
      renderToken++
      listeners.clear()
      wrapper?.remove()
      wrapper = null
      stack = null
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

    applyInsets(next) {
      insets = next
      applyInsetPadding()
    },

    async resize() {
      await renderPage(pageNumber)
    },

    canZoom: () => true,
    getZoom: () => zoom,

    canCrop: () => true,
    getCrop: () => crop,

    async setCrop(enabled) {
      cropDecidido = true
      if (enabled === crop) return
      crop = enabled
      await renderPage(pageNumber)
    },



    async setZoom(scale) {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(scale.toFixed(2))))
      if (next === zoom) return
      zoom = next
      await renderPage(pageNumber)
    },

    contentRoot: () => textLayer,

    contentDocument: () => textLayer?.ownerDocument ?? null,

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
