import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPdfEngine, type PdfPageLike, type PdfSource } from './pdfEngine'
import { DEFAULT_THEME } from './types'

const PAGES = [
  'O rio corre para o mar sem pressa.',
  'A serra guarda a chuva do inverno.',
  'No fim, tudo volta ao rio.',
]

function fakeSource(): PdfSource {
  return {
    numPages: PAGES.length,
    async getPage(n: number): Promise<PdfPageLike> {
      return {
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale, scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
        getTextContent: async () => ({
          items: [{ str: PAGES[n - 1], transform: [12, 0, 0, 12, 40, 700], width: 300, height: 12 }],
        }),
      }
    },
  }
}

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('pdfEngine', () => {
  it('abre na primeira página e informa o total', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    expect(engine.locate().spineIndex).toBe(0)
    expect(engine.size()).toBe(3)
    expect(engine.pageInChapter()).toEqual({ page: 1, pages: 3 })
  })

  it('next e prev andam de página em página', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    await engine.next()
    expect(engine.locate().spineIndex).toBe(1)

    await engine.prev()
    expect(engine.locate().spineIndex).toBe(0)
  })

  it('não passa dos limites do documento', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    await engine.prev()
    expect(engine.locate().spineIndex).toBe(0)

    await engine.goTo({ spineIndex: 2, progressInSpine: 0 })
    await engine.next()
    expect(engine.locate().spineIndex).toBe(2)
  })

  it('percent é a página sobre o total', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    expect(engine.percent()).toBeCloseTo(1 / 3)
    await engine.goTo({ spineIndex: 2, progressInSpine: 0 })
    expect(engine.percent()).toBe(1)
  })

  it('desenha a camada de texto da página, que é o que permite selecionar', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    expect(engine.contentRoot()?.textContent).toContain('rio corre para o mar')
    await engine.next()
    expect(engine.contentRoot()?.textContent).toContain('serra guarda a chuva')
  })

  it('tema escuro inverte a página sem apagar a camada de texto', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    engine.applyTheme({ ...DEFAULT_THEME, palette: 'dark' })

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.filter).toContain('invert')
    expect(engine.contentRoot()?.textContent).toContain('rio corre')

    engine.applyTheme({ ...DEFAULT_THEME, palette: 'light' })
    expect(canvas.style.filter).toBe('')
  })

  it('search percorre o documento e devolve a página certa', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    const hits = await engine.search('serra')

    expect(hits).toHaveLength(1)
    expect(hits[0].locator.spineIndex).toBe(1)
    expect(hits[0].excerpt).toContain('serra')
  })

  it('search ignora acento e caixa e respeita o limite', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    expect(await engine.search('RIO')).toHaveLength(2)
    expect(await engine.search('rio', 1)).toHaveLength(1)
  })

  it('avisa quem ouve quando a página muda', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)
    const heard: number[] = []
    const off = engine.on('relocated', (l) => heard.push(l.spineIndex))

    await engine.next()
    off()
    await engine.next()

    expect(heard).toEqual([1])
  })

  it('destroy limpa o que foi montado', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)

    engine.destroy()

    expect(container.querySelector('canvas')).toBeNull()
  })
})
