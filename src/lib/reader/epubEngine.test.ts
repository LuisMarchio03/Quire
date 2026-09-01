import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEpubEngine } from './epubEngine'
import { parseEpub, type EpubBook } from '../epub/parseEpub'
import { makeEpub, type Chapter } from '../epub/fixtures/makeEpub'
import { DEFAULT_THEME } from './types'

const CHAPTERS: Chapter[] = [
  { href: 'c1.xhtml', title: 'Primeiro', body: '<p>O rio corre para o mar sem pressa.</p>' },
  { href: 'c2.xhtml', title: 'Segundo', body: '<p>A serra guarda a chuva do inverno.</p>' },
  { href: 'c3.xhtml', title: 'Terceiro', body: '<p>No fim, tudo volta ao rio.</p>' },
]

let book: EpubBook
let container: HTMLElement

beforeEach(async () => {
  book = await parseEpub(makeEpub({ chapters: CHAPTERS }))
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  document.body.innerHTML = ''
})

const iframeOf = () => container.querySelector('iframe')!

describe('epubEngine', () => {
  it('monta um iframe isolado, sem permissão de script', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    const sandbox = iframeOf().getAttribute('sandbox')
    expect(sandbox).toBe('allow-same-origin')
    expect(sandbox).not.toContain('allow-scripts')
  })

  it('abre no primeiro capítulo e informa o tamanho do livro', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    expect(engine.locate().spineIndex).toBe(0)
    expect(engine.size()).toBe(3)
  })

  it('goTo leva ao capítulo pedido e locate confirma', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    await engine.goTo({ spineIndex: 2, progressInSpine: 0 })

    expect(engine.locate().spineIndex).toBe(2)
    expect(engine.contentRoot()?.textContent).toContain('tudo volta ao rio')
  })

  it('next avança para o capítulo seguinte quando a página acaba', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    await engine.next()

    expect(engine.locate().spineIndex).toBe(1)
    expect(engine.contentRoot()?.textContent).toContain('serra guarda a chuva')
  })

  it('prev no começo do livro não sai do lugar', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    await engine.prev()

    expect(engine.locate().spineIndex).toBe(0)
  })

  it('next no fim do livro não passa do último capítulo', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)
    await engine.goTo({ spineIndex: 2, progressInSpine: 1 })

    await engine.next()

    expect(engine.locate().spineIndex).toBe(2)
  })

  it('percent cresce conforme o livro avança', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)
    const inicio = engine.percent()

    await engine.goTo({ spineIndex: 2, progressInSpine: 0 })

    expect(engine.percent()).toBeGreaterThan(inicio)
    expect(engine.percent()).toBeLessThanOrEqual(1)
  })

  it('applyTheme troca o estilo sem remontar o iframe', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)
    const before = iframeOf()

    engine.applyTheme({ ...DEFAULT_THEME, palette: 'sepia', fontSize: 30 })

    expect(iframeOf()).toBe(before)
    const css = before.contentDocument!.getElementById('quire-theme')!.textContent!
    expect(css).toContain('#f3e9d6')
    expect(css).toContain('font-size: 30px')
  })

  it('avisa quem estiver ouvindo quando a posição muda', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)
    const heard: number[] = []
    const off = engine.on('relocated', (l) => heard.push(l.spineIndex))

    await engine.next()
    off()
    await engine.next()

    expect(heard).toEqual([1])
  })

  it('search encontra o termo e devolve o capítulo certo, com trecho', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    const hits = await engine.search('serra')

    expect(hits).toHaveLength(1)
    expect(hits[0].locator.spineIndex).toBe(1)
    expect(hits[0].excerpt).toContain('serra')
  })

  it('search ignora diferença de acento e caixa', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    expect(await engine.search('SERRA')).toHaveLength(1)
    expect(await engine.search('rio')).toHaveLength(2)
  })

  it('search respeita o limite pedido', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    expect(await engine.search('rio', 1)).toHaveLength(1)
  })

  it('remove script e manipulador inline do conteúdo do livro', async () => {
    const malicioso = await parseEpub(
      makeEpub({
        chapters: [
          {
            href: 'c1.xhtml',
            title: 'Suspeito',
            body: '<p onclick="roubar()">Texto</p><script>window.invadiu = true;</script>',
          },
        ],
      }),
    )
    const engine = createEpubEngine(malicioso)
    await engine.mount(container)

    const root = engine.contentRoot()!
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('p')?.getAttribute('onclick')).toBeNull()
    expect((window as unknown as { invadiu?: boolean }).invadiu).toBeUndefined()
  })

  it('destroy tira o iframe da tela', async () => {
    const engine = createEpubEngine(book)
    await engine.mount(container)

    engine.destroy()

    expect(container.querySelector('iframe')).toBeNull()
  })

  it('libera as URLs de recurso ao destruir', async () => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fake', revokeObjectURL: revoke })

    const comImagem = await parseEpub(
      makeEpub({
        chapters: [{ href: 'c1.xhtml', title: 'Com capa', body: '<img src="images/cover.png"/>' }],
      }),
    )
    const engine = createEpubEngine(comImagem)
    await engine.mount(container)
    engine.destroy()

    expect(revoke).toHaveBeenCalledWith('blob:fake')
    vi.unstubAllGlobals()
  })
})

describe('epubEngine — mudança de viewport', () => {
  it('recalcula o layout quando a tela muda de tamanho', async () => {
    let largura = 800
    const engine = createEpubEngine(book, { measure: () => ({ width: largura, height: 1000 }) })
    await engine.mount(container)

    const css = () => iframeOf().contentDocument!.getElementById('quire-theme')!.textContent!
    expect(css()).toContain('column-width: 680px')

    largura = 390
    await engine.resize()

    // 390 de largura, margem 28 dos dois lados: a coluna precisa caber em 334.
    expect(css()).toContain('column-width: 334px')
  })

  it('mantém o capítulo e a posição relativa depois de girar a tela', async () => {
    let largura = 390
    const engine = createEpubEngine(book, { measure: () => ({ width: largura, height: 844 }) })
    await engine.mount(container)
    await engine.goTo({ spineIndex: 1, progressInSpine: 0 })

    largura = 844
    await engine.resize()

    expect(engine.locate().spineIndex).toBe(1)
    expect(engine.contentRoot()?.textContent).toContain('serra guarda')
  })

  it('não remonta o iframe ao redimensionar', async () => {
    const engine = createEpubEngine(book, { measure: () => ({ width: 400, height: 800 }) })
    await engine.mount(container)
    const antes = iframeOf()

    await engine.resize()

    expect(iframeOf()).toBe(antes)
  })
})
