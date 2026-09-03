import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPdfEngine, type PdfPageLike, type PdfSource, type PdfViewport } from './pdfEngine'
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

  it('a página é pintada com o papel e a tinta da paleta, não como um bloco cinza', async () => {
    const engine = createPdfEngine(fakeSource())
    await engine.mount(container)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    const stack = canvas.parentElement as HTMLElement

    engine.applyTheme({ ...DEFAULT_THEME, palette: 'dark' })
    expect(canvas.style.getPropertyValue('mix-blend-mode')).toBe('screen')
    expect(Number(canvas.style.opacity)).toBeGreaterThan(0.5)
    expect(Number(canvas.style.opacity)).toBeLessThan(1)
    // O fundo contra o qual a folha se funde é o papel da paleta, isolado do resto.
    expect(stack.style.background).toBe('rgb(32, 28, 24)')
    expect(stack.style.getPropertyValue('isolation')).toBe('isolate')

    engine.applyTheme({ ...DEFAULT_THEME, palette: 'sepia' })
    expect(canvas.style.getPropertyValue('mix-blend-mode')).toBe('multiply')
    expect(canvas.style.filter).toBe('')
    expect(Number(canvas.style.opacity)).toBeLessThan(1)
    expect(stack.style.background).toBe('rgb(243, 233, 214)')
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
  // Página de 600 de largura com o texto ocupando 60% dela, a partir de 20%.
  const caixa = async () => ({ x: 0.2, y: 0.1, w: 0.6, h: 0.8 })
  const medida = () => ({ width: 390, height: 800 })
  const janela = () => container.querySelector('canvas')!.parentElement as HTMLElement

  it('encaixa a caixa de texto na largura da tela, e não a folha inteira', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    // 390 menos 4% de respiro de cada lado = 359; 359 / 0,6 = 598. A folha
    // desenhada é maior que a tela; o texto é que cabe nela, com margem.
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('598px')
  })

  it('recorta com uma janela, e não empurrando a folha com margem negativa', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    // Margem negativa dentro de um contêiner centralizado soma dois
    // deslocamentos e joga o texto para fora da tela. A janela recorta no lugar.
    expect(janela().style.marginLeft).toBe('')
    expect(janela().style.overflow).toBe('hidden')
    expect(janela().style.width).toBe('359px')

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.position).toBe('absolute')
    expect(canvas.style.left).toBe('-120px')
    expect(canvas.style.top).toBe('-80px')
  })

  it('a camada de texto acompanha o mesmo recorte', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    const camada = engine.contentRoot() as HTMLElement
    expect(camada.style.left).toBe('-120px')
    expect(camada.style.top).toBe('-80px')
  })

  it('mede a caixa no documento inteiro, não na página aberta', async () => {
    // Folha de rosto tem bloco estreito; medir só por ela ampliaria demais.
    const detectBox = vi.fn(async (_page: PdfPageLike, _base: PdfViewport) => ({
      x: 0.1,
      y: 0.1,
      w: 0.6,
      h: 0.8,
    }))
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox })
    await engine.mount(container)

    // Três páginas no documento falso: todas viram amostra, uma vez cada.
    expect(detectBox).toHaveBeenCalledTimes(3)

    await engine.next()
    await engine.prev()
    expect(detectBox).toHaveBeenCalledTimes(3)
  })

  it('a união das amostras garante que nenhuma página perca conteúdo', async () => {
    let chamada = 0
    const detectBox = async () => {
      chamada++
      // Uma página com texto à esquerda, outra à direita.
      return chamada === 1
        ? { x: 0.1, y: 0.1, w: 0.4, h: 0.8 }
        : { x: 0.5, y: 0.1, w: 0.4, h: 0.8 }
    }
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox })
    await engine.mount(container)

    // União: de 0,1 a 0,9 — 80% da largura. 359 / 0,8 = 448,5 → 449.
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('449px')
  })

  it('não amplia além do dobro, por mais estreito que o texto pareça', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: medida,
      detectBox: async () => ({ x: 0.4, y: 0.4, w: 0.36, h: 0.3 }),
    })
    await engine.mount(container)

    // Sem o limite, 359/0,36 daria 997 — letra gigante e página perdida.
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('718px')
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
    expect(canvas.style.left).toBe('0px')
    expect(engine.getCrop()).toBe(false)
  })

  it('desligar o corte em tempo de leitura volta à folha inteira', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    await engine.setCrop(false)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('390px')
    expect(canvas.style.left).toBe('0px')
  })

  it('o zoom multiplica em cima do corte', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    await engine.setZoom(2)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('1196px')
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

  it('numa tela estreita o corte entra ligado', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: () => ({ width: 390, height: 800 }),
      detectBox: caixa,
    })
    await engine.mount(container)

    expect(engine.getCrop()).toBe(true)
  })

  it('numa tela larga o corte fica desligado — sobra largura, não há ganho', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: () => ({ width: 1400, height: 900 }),
      detectBox: caixa,
    })
    await engine.mount(container)

    expect(engine.getCrop()).toBe(false)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('1400px')
  })

  it('a escolha de quem lê vence a decisão automática', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: () => ({ width: 1400, height: 900 }),
      detectBox: caixa,
    })
    await engine.mount(container)

    await engine.setCrop(true)
    expect(engine.getCrop()).toBe(true)

    await engine.resize()
    expect(engine.getCrop()).toBe(true)
  })
})

describe('pdfEngine — respiro e alinhamento', () => {
  const caixa = async () => ({ x: 0.2, y: 0.1, w: 0.6, h: 0.8 })
  const medida = () => ({ width: 400, height: 800 })

  it('deixa margem lateral: o texto não pode encostar na borda da tela', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    const janela = container.querySelector('canvas')!.parentElement as HTMLElement
    const largura = Number.parseFloat(janela.style.width)
    // 4% de cada lado: a caixa de texto ocupa 368 dos 400 disponíveis.
    expect(largura).toBe(368)
  })

  it('sem corte, a folha continua usando a largura toda', async () => {
    const engine = createPdfEngine(fakeSource(), {
      measure: medida,
      detectBox: caixa,
      crop: false,
    })
    await engine.mount(container)

    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('400px')
  })

  it('centraliza na vertical quando a página é mais baixa que a tela', async () => {
    const engine = createPdfEngine(fakeSource(), { measure: medida, detectBox: caixa })
    await engine.mount(container)

    const wrapper = container.firstElementChild as HTMLElement
    // `safe center` centraliza quando cabe e encosta no topo quando não cabe —
    // sem isso sobra um vão morto embaixo da página curta.
    expect(wrapper.style.alignItems).toContain('center')
  })
})
