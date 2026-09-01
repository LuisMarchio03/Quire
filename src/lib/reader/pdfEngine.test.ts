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

describe('pdfEngine — tela de celular', () => {
  const medida = (largura: number, altura = 800) => () => ({ width: largura, height: altura })

  it('desenha a página na largura disponível', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
  })

  it('redesenha na nova largura quando a tela gira', async () => {
    let largura = 390
    const engine = createPdfEngine(fakeSource(), { measure: () => ({ width: largura, height: 800 }) })
    await engine.mount(container)

    largura = 844
    await engine.resize()

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('844px')
    expect(engine.locate().spineIndex).toBe(0)
  })

  it('girar a tela não muda a página em que se está', async () => {
    let largura = 390
    const engine = createPdfEngine(fakeSource(), { measure: () => ({ width: largura, height: 800 }) })
    await engine.mount(container)
    await engine.goTo({ spineIndex: 2, progressInSpine: 0 })

    largura = 844
    await engine.resize()

    expect(engine.locate().spineIndex).toBe(2)
  })

  it('o PDF admite zoom, e o EPUB não precisa dele', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)

    expect(engine.canZoom()).toBe(true)
    expect(engine.getZoom()).toBe(1)
  })

  it('aumentar o zoom aumenta a página desenhada', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)

    await engine.setZoom(2)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('780px')
    expect(engine.getZoom()).toBe(2)
  })

  it('o zoom fica dentro de limites úteis', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)

    await engine.setZoom(0.2)
    expect(engine.getZoom()).toBe(1)

    await engine.setZoom(99)
    expect(engine.getZoom()).toBe(6)
  })

  it('o zoom sobrevive à troca de página', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)
    await engine.setZoom(3)

    await engine.next()

    expect(engine.getZoom()).toBe(3)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('1170px')
  })

  it('as faixas seguras da tela encolhem a área de desenho', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida(390) })
    await engine.mount(container)

    engine.applyInsets({ top: 47, right: 0, bottom: 34, left: 0 })
    await engine.resize()

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.paddingTop).toBe('47px')
    expect(wrapper.style.paddingBottom).toBe('34px')
  })
})

describe('pdfEngine — corte das margens', () => {
  // Página de 600 de largura com texto ocupando 60% dela, a partir de 20%.
  const caixa = async () => ({ x: 0.2, y: 0.1, w: 0.6, h: 0.8 })
  const medida = () => ({ width: 390, height: 800 })

  it('encaixa a caixa de texto na largura da tela, e não a folha inteira', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    // 390 / 0,6 = 650: a folha fica maior que a tela, o texto é que cabe nela.
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('650px')
  })

  it('desloca a folha para o texto encostar na borda', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    const stack = container.querySelector('canvas')!.parentElement as HTMLElement
    // 650 de largura desenhada × 20% = 130; 867 de altura × 10% = 87.
    expect(stack.style.marginLeft).toBe('-130px')
    expect(stack.style.marginTop).toBe('-87px')
  })

  it('sem corte, a folha inteira cabe na largura', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: medida,
      detectBox: caixa,
      crop: false,
    })
    await engine.mount(container)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
    expect(engine.getCrop()).toBe(false)
  })

  it('desligar o corte em tempo de leitura volta à folha inteira', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    await engine.setCrop(false)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
    const stack = canvas.parentElement as HTMLElement
    expect(stack.style.marginLeft).toBe('0px')
  })

  it('o zoom multiplica em cima do corte', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    await engine.setZoom(2)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('1300px')
  })

  it('a caixa de cada página é descoberta uma vez só', async () => {
    const detectBox = vi.fn(caixa)
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox })
    await engine.mount(container)

    await engine.next()
    await engine.prev()
    await engine.setZoom(2)

    // Duas páginas visitadas: duas detecções, apesar das quatro renderizações.
    expect(detectBox).toHaveBeenCalledTimes(2)
  })

  it('página que a detecção não entende é desenhada inteira, sem quebrar', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: medida,
      detectBox: async () => {
        throw new Error('sem acesso aos pixels')
      },
    })
    await engine.mount(container)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
    expect(engine.contentRoot()?.textContent).toContain('rio corre')
  })
})
