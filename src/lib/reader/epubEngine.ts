import type { EpubBook } from '../epub/parseEpub'
import type { Anchor, Locator } from '../types'
import { anchorToRange } from '../anchor/anchor'
import { buildContentCss } from './contentStyles'
import { DEFAULT_THEME, type ReaderEngine, type ReaderTheme, type SearchHit } from './types'

const THEME_STYLE_ID = 'quire-theme'
const CONTENT_ID = 'quire-content'
const VIEWPORT_ID = 'quire-viewport'

/** Tira acento e caixa para a busca casar "serra" com "SERRA" e "sertão" com "sertao". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function createEpubEngine(book: EpubBook): ReaderEngine {
  let iframe: HTMLIFrameElement | null = null
  let doc: Document | null = null
  let content: HTMLElement | null = null
  let theme: ReaderTheme = DEFAULT_THEME

  let spineIndex = 0
  let page = 0
  let pages = 1
  const objectUrls: string[] = []
  const listeners = new Set<(locator: Locator) => void>()

  // Peso de cada capítulo pelo tamanho do arquivo: dá uma barra de progresso
  // honesta, em que um capítulo de duas páginas não vale o mesmo que um de trinta.
  const weights = book.spine.map((item) => book.resource(item.href)?.bytes.length ?? 1)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1

  const textCache = new Map<number, string>()

  function resourceUrl(path: string): string | null {
    const resource = book.resource(path)
    if (!resource) return null
    try {
      const url = URL.createObjectURL(new Blob([resource.bytes as BlobPart], { type: resource.mediaType }))
      objectUrls.push(url)
      return url
    } catch {
      // Sem createObjectURL (ambiente de teste), data URL resolve igual.
      let binary = ''
      for (const byte of resource.bytes) binary += String.fromCharCode(byte)
      return `data:${resource.mediaType};base64,${btoa(binary)}`
    }
  }

  function rewriteCss(css: string, fromPath: string): string {
    return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (whole, _quote, href: string) => {
      if (/^(https?:|data:|blob:|#)/i.test(href)) return whole
      const url = resourceUrl(book.resolveFrom(fromPath, href))
      return url ? `url("${url}")` : whole
    })
  }

  /**
   * Prepara o capítulo para ir ao iframe: tira o que executa código, troca os
   * recursos internos por URLs locais e envolve o corpo no contêiner de colunas.
   */
  function buildChapterHtml(spinePath: string): string {
    const resource = book.resource(spinePath)
    if (!resource) return '<p>Capítulo indisponível.</p>'

    const source = new TextDecoder('utf-8').decode(resource.bytes)
    const parsed = new DOMParser().parseFromString(source, 'application/xhtml+xml')
    const parseFailed = parsed.getElementsByTagName('parsererror').length > 0
    const chapter = parseFailed
      ? new DOMParser().parseFromString(source, 'text/html')
      : parsed

    // Defesa em profundidade: o sandbox já barra script, mas conteúdo executável
    // não tem por que chegar até lá.
    chapter.querySelectorAll('script, object, embed, iframe').forEach((el) => el.remove())
    chapter.querySelectorAll('*').forEach((el) => {
      for (const attribute of Array.from(el.attributes)) {
        if (/^on/i.test(attribute.name)) el.removeAttribute(attribute.name)
      }
    })

    chapter.querySelectorAll('img[src]').forEach((img) => {
      const url = resourceUrl(book.resolveFrom(spinePath, img.getAttribute('src') ?? ''))
      if (url) img.setAttribute('src', url)
      else img.remove()
    })
    chapter.querySelectorAll('image').forEach((image) => {
      const href = image.getAttribute('xlink:href') ?? image.getAttribute('href') ?? ''
      const url = resourceUrl(book.resolveFrom(spinePath, href))
      if (url) image.setAttribute('href', url)
    })

    const styles: string[] = []
    chapter.querySelectorAll('link[rel~="stylesheet"]').forEach((link) => {
      const target = book.resolveFrom(spinePath, link.getAttribute('href') ?? '')
      const sheet = book.resource(target)
      if (sheet) styles.push(rewriteCss(new TextDecoder().decode(sheet.bytes), target))
      link.remove()
    })
    chapter.querySelectorAll('style').forEach((style) => {
      style.textContent = rewriteCss(style.textContent ?? '', spinePath)
    })

    const body = chapter.body ?? chapter.documentElement
    const headStyles = Array.from(chapter.querySelectorAll('style'))
      .map((s) => s.outerHTML)
      .join('\n')

    return `<!doctype html><html><head><meta charset="utf-8">
<style>${styles.join('\n')}</style>${headStyles}
<style id="${THEME_STYLE_ID}"></style></head>
<body><div id="${VIEWPORT_ID}"><div id="${CONTENT_ID}">${body?.innerHTML ?? ''}</div></div></body></html>`
  }

  function metrics() {
    return {
      width: iframe?.clientWidth || 800,
      height: iframe?.clientHeight || 1000,
    }
  }

  function writeTheme() {
    const style = doc?.getElementById(THEME_STYLE_ID)
    if (style) style.textContent = buildContentCss(theme, metrics())
  }

  /** Uma página é uma coluna do tamanho da tela; o total sai da largura do conteúdo. */
  function measurePages(): number {
    if (!content) return 1
    const step = metrics().width
    const width = content.scrollWidth || 0
    return Math.max(1, Math.round(width / step) || 1)
  }

  function applyOffset() {
    if (!content) return
    content.style.transform = `translate3d(${-page * metrics().width}px, 0, 0)`
  }

  function emit() {
    const locator = engine.locate()
    for (const listener of listeners) listener(locator)
  }

  async function renderChapter(index: number, atEnd: boolean) {
    if (!iframe) return
    spineIndex = Math.min(Math.max(index, 0), book.spine.length - 1)

    const html = buildChapterHtml(book.spine[spineIndex].href)
    const target = iframe.contentDocument
    if (!target) return
    target.open()
    target.write(html)
    target.close()

    doc = target
    content = target.getElementById(CONTENT_ID)
    writeTheme()

    pages = measurePages()
    page = atEnd ? pages - 1 : 0
    applyOffset()
  }

  function chapterText(index: number): string {
    const cached = textCache.get(index)
    if (cached !== undefined) return cached

    const resource = book.resource(book.spine[index].href)
    const raw = resource ? new TextDecoder('utf-8').decode(resource.bytes) : ''
    const parsed = new DOMParser().parseFromString(raw, 'text/html')
    const text = (parsed.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    textCache.set(index, text)
    return text
  }

  const engine: ReaderEngine = {
    async mount(container) {
      iframe = document.createElement('iframe')
      // Sem allow-scripts, de propósito: um EPUB é HTML de procedência
      // desconhecida e não tem por que rodar código nenhum.
      iframe.setAttribute('sandbox', 'allow-same-origin')
      iframe.setAttribute('title', 'Conteúdo do livro')
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent'
      container.append(iframe)

      if (!iframe.contentDocument) {
        await new Promise<void>((resolve) => {
          iframe!.addEventListener('load', () => resolve(), { once: true })
        })
      }

      await renderChapter(spineIndex, false)
    },

    destroy() {
      for (const url of objectUrls) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* data URL não precisa de revogação */
        }
      }
      objectUrls.length = 0
      listeners.clear()
      iframe?.remove()
      iframe = null
      doc = null
      content = null
    },

    async goTo(locator) {
      const index = Math.min(Math.max(locator.spineIndex, 0), book.spine.length - 1)
      if (index !== spineIndex || !content) {
        await renderChapter(index, false)
      }
      pages = measurePages()
      page = Math.min(pages - 1, Math.max(0, Math.round(locator.progressInSpine * (pages - 1))))
      applyOffset()
      emit()
    },

    async next() {
      if (page + 1 < pages) {
        page++
        applyOffset()
      } else if (spineIndex + 1 < book.spine.length) {
        await renderChapter(spineIndex + 1, false)
      } else return
      emit()
    },

    async prev() {
      if (page > 0) {
        page--
        applyOffset()
      } else if (spineIndex > 0) {
        await renderChapter(spineIndex - 1, true)
      } else return
      emit()
    },

    locate() {
      return {
        spineIndex,
        progressInSpine: pages > 1 ? page / (pages - 1) : 0,
        label: book.spine[spineIndex]?.id,
      }
    },

    percent() {
      const before = weights.slice(0, spineIndex).reduce((sum, w) => sum + w, 0)
      const within = weights[spineIndex] * (pages > 1 ? page / (pages - 1) : 0)
      return Math.min(1, (before + within) / totalWeight)
    },

    size: () => book.spine.length,

    applyTheme(next) {
      theme = next
      writeTheme()
      pages = measurePages()
      page = Math.min(page, pages - 1)
      applyOffset()
    },

    contentRoot: () => content,

    contentDocument: () => doc,

    pageInChapter: () => ({ page: page + 1, pages }),

    async search(query, limit = 50) {
      const needle = fold(query.trim())
      if (!needle) return []

      const hits: SearchHit[] = []
      for (let index = 0; index < book.spine.length && hits.length < limit; index++) {
        const text = chapterText(index)
        const haystack = fold(text)
        let from = 0
        while (hits.length < limit) {
          const at = haystack.indexOf(needle, from)
          if (at === -1) break
          hits.push({
            locator: { spineIndex: index, progressInSpine: text.length ? at / text.length : 0 },
            excerpt: text.slice(Math.max(0, at - 40), at + needle.length + 40).trim(),
          })
          from = at + needle.length
        }
      }
      return hits
    },

    rectsForAnchor(anchor: Anchor) {
      if (!content || anchor.kind !== 'epub') return []
      const range = anchorToRange(anchor, content)
      return range ? Array.from(range.getClientRects()) : []
    },

    on(_event, handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
  }

  return engine
}
