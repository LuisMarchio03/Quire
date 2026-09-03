import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReaderScreen } from './ReaderScreen'
import { makeEpub, type Chapter } from '../../lib/epub/fixtures/makeEpub'
import { createBookStore } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import { deleteQuireDb } from '../../lib/store/idb'
import type { Book } from '../../lib/types'

const CHAPTERS: Chapter[] = [
  { href: 'c1.xhtml', title: 'Primeiro', body: '<p>O rio corre para o mar sem pressa.</p>' },
  { href: 'c2.xhtml', title: 'Segundo', body: '<p>A serra guarda a chuva do inverno.</p>' },
  { href: 'c3.xhtml', title: 'Terceiro', body: '<p>No fim, tudo volta ao rio.</p>' },
]

const BOOK: Book = {
  id: 'livro-1',
  title: 'Águas do Sertão',
  author: 'Autora Exemplo',
  format: 'epub',
  language: 'pt-BR',
  coverUrl: null,
  fileSize: 100,
  spineCount: 3,
  status: 'unread',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

async function seed({ withFile = true } = {}) {
  await localMirror.saveBook(BOOK, { queue: false })
  if (withFile) {
    await createBookStore().put(BOOK.id, new Blob([makeEpub({ chapters: CHAPTERS }) as BlobPart]))
  }
}

const frame = () => document.querySelector('iframe') as HTMLIFrameElement
const contentText = () => frame()?.contentDocument?.getElementById('quire-content')?.textContent ?? ''

const escalaFalsa = {
  scale: 1,
  increase: () => {},
  decrease: () => {},
  reset: () => {},
  atMin: false,
  atMax: false,
}

async function openReader(onClose: () => void = () => {}) {
  const view = render(
    <ReaderScreen bookId={BOOK.id} onClose={onClose} uiScale={escalaFalsa} />,
  )
  // O conteúdo do iframe aparece durante a montagem do motor, antes de o React
  // terminar de aplicar o estado. Esperar pelos dois evita teste instável.
  await waitFor(() => expect(contentText()).toContain('rio corre'))
  await screen.findByText('Águas do Sertão')
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  return view
}

function clickAt(clientX: number) {
  const doc = frame().contentDocument!
  doc.dispatchEvent(new doc.defaultView!.MouseEvent('click', { clientX, bubbles: true }))
}

beforeEach(async () => {
  localStorage.clear()
  await deleteQuireDb()
})

afterEach(() => {
  cleanup()
})

describe('ReaderScreen', () => {
  it('abre o livro e mostra o título nos controles', async () => {
    await seed()
    await openReader()

    expect(screen.getByText('Águas do Sertão')).toBeTruthy()
  })

  it('avisa quando o arquivo não está neste aparelho', async () => {
    await seed({ withFile: false })

    render(<ReaderScreen bookId={BOOK.id} onClose={() => {}} />)

    expect(await screen.findByText(/não está neste aparelho/i)).toBeTruthy()
  })

  it('avisa quando o livro não existe no acervo', async () => {
    render(<ReaderScreen bookId="fantasma" onClose={() => {}} />)

    expect(await screen.findByText(/não está no acervo/i)).toBeTruthy()
  })

  it('retoma a leitura onde parou', async () => {
    await seed()
    await localMirror.saveProgress({
      bookId: BOOK.id,
      locator: { spineIndex: 2, progressInSpine: 0 },
      percent: 0.7,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    render(<ReaderScreen bookId={BOOK.id} onClose={() => {}} />)

    await waitFor(() => expect(contentText()).toContain('tudo volta ao rio'))
  })

  it('toque na lateral direita avança e na esquerda volta', async () => {
    await seed()
    await openReader()

    clickAt(950)
    await waitFor(() => expect(contentText()).toContain('serra guarda'))

    clickAt(60)
    await waitFor(() => expect(contentText()).toContain('rio corre'))
  })

  it('toque no centro esconde e mostra os controles', async () => {
    await seed()
    await openReader()

    clickAt(500)
    await waitFor(() => expect(screen.queryByText('Águas do Sertão')).toBeNull())

    clickAt(500)
    await waitFor(() => expect(screen.getByText('Águas do Sertão')).toBeTruthy())
  })

  it('aumentar a fonte chega ao texto do livro', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /ajustes de leitura/i }))
    await userEvent.click(screen.getByRole('button', { name: /aumentar tamanho/i }))

    await waitFor(() => {
      const css = frame().contentDocument!.getElementById('quire-theme')!.textContent!
      expect(css).toContain('font-size: 20px')
    })
  })

  it('a paleta escolhida vale na próxima abertura', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /ajustes de leitura/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Sépia' }))
    cleanup()

    render(<ReaderScreen bookId={BOOK.id} onClose={() => {}} />)

    await waitFor(() => {
      const css = frame().contentDocument!.getElementById('quire-theme')!.textContent!
      expect(css).toContain('#f3e9d6')
    })
  })

  it('guarda a posição depois de virar a página', async () => {
    await seed()
    await openReader()

    clickAt(950)

    await waitFor(
      async () => expect((await localMirror.getProgress(BOOK.id))?.locator.spineIndex).toBe(1),
      { timeout: 3000 },
    )
  })

  it('marcar a página liga e desliga a estrela', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /marcar esta página/i }))
    const marcada = await screen.findByRole('button', { name: /remover marca de página/i })
    expect(marcada.getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(marcada)
    expect(await screen.findByRole('button', { name: /marcar esta página/i })).toBeTruthy()
  })

  it('modo foco escurece os demais parágrafos do capítulo', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /modo foco/i }))

    await waitFor(() => {
      const root = frame().contentDocument!.getElementById('quire-content')!
      expect(root.querySelector('[data-quire-focus="on"]')).not.toBeNull()
    })
  })

  it('a busca no painel leva ao capítulo do resultado', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /anotações/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await userEvent.type(screen.getByLabelText(/buscar no livro/i), 'serra')
    await userEvent.click(screen.getByRole('button', { name: 'Ir' }))

    await userEvent.click(await screen.findByText(/serra guarda/i))
    await waitFor(() => expect(contentText()).toContain('serra guarda'))
  })

  it('o painel de anotações começa vazio e explica o que fazer', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /anotações/i }))

    expect(await screen.findByText(/selecione um trecho no texto/i)).toBeTruthy()
  })

  it('destaque criado aparece no painel e é pintado no texto', async () => {
    await seed()
    await openReader()

    // Seleciona "rio corre" dentro do iframe, como faria o dedo do leitor.
    const doc = frame().contentDocument!
    const textNode = doc.getElementById('quire-content')!.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(textNode, 2)
    range.setEnd(textNode, 11)
    const selection = doc.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    doc.dispatchEvent(new doc.defaultView!.MouseEvent('mouseup', { bubbles: true }))

    await userEvent.click(await screen.findByRole('button', { name: /destacar em amarelo/i }))

    await waitFor(() => {
      expect(doc.querySelector('mark[data-quire-color="#e8c468"]')?.textContent).toBe('rio corre')
    })

    await userEvent.click(screen.getByRole('button', { name: /^anotações$/i }))
    expect(await screen.findByText('rio corre')).toBeTruthy()
  })

  it('os controles somem sozinhos para o texto ficar livre', async () => {
    await seed()
    await openReader()
    expect(screen.getByText('Águas do Sertão')).toBeTruthy()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4200))
    })

    expect(screen.queryByText('Águas do Sertão')).toBeNull()
  })

  it('os controles não somem enquanto um painel está aberto', async () => {
    await seed()
    await openReader()
    await userEvent.click(screen.getByRole('button', { name: /ajustes de leitura/i }))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4200))
    })

    expect(screen.getByRole('button', { name: /ajustes de leitura/i })).toBeTruthy()
  })

  it('deslizar para a esquerda vira a página', async () => {
    await seed()
    await openReader()

    const doc = frame().contentDocument!
    const toque = (tipo: string, x: number, lista: 'touches' | 'changedTouches') => {
      const evento = new doc.defaultView!.Event(tipo, { bubbles: true })
      const outra = lista === 'touches' ? 'changedTouches' : 'touches'
      Object.defineProperty(evento, lista, { value: [{ clientX: x, clientY: 400 }] })
      Object.defineProperty(evento, outra, { value: [] })
      doc.dispatchEvent(evento)
    }

    toque('touchstart', 320, 'touches')
    toque('touchend', 80, 'changedTouches')

    await waitFor(() => expect(contentText()).toContain('serra guarda'))
  })

  it('o EPUB não oferece ampliação — quem aumenta a letra é a tipografia', async () => {
    await seed()
    await openReader()

    expect(screen.queryByRole('button', { name: /aumentar amplia\u00e7\u00e3o/i })).toBeNull()
  })

  it('há botões visíveis para avançar e voltar página', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /próxima página/i }))
    await waitFor(() => expect(contentText()).toContain('serra guarda'))

    await userEvent.click(screen.getByRole('button', { name: /página anterior/i }))
    await waitFor(() => expect(contentText()).toContain('rio corre'))
  })

  it('o botão de voltar fica desativado no começo do livro', async () => {
    await seed()
    await openReader()

    expect(screen.getByRole('button', { name: /página anterior/i })).toHaveProperty('disabled', true)

    await userEvent.click(screen.getByRole('button', { name: /próxima página/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /página anterior/i })).toHaveProperty(
        'disabled',
        false,
      ),
    )
  })

  it('o botão de avançar fica desativado no fim do livro', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /próxima página/i }))
    await userEvent.click(screen.getByRole('button', { name: /próxima página/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /próxima página/i })).toHaveProperty(
        'disabled',
        true,
      ),
    )
  })

  it('a pinça sobre o texto do EPUB muda o corpo da letra', async () => {
    await seed()
    await openReader()
    const css = () => frame().contentDocument!.getElementById('quire-theme')!.textContent!
    expect(css()).toContain('font-size: 19px')

    const doc = frame().contentDocument!
    const dedos = (separacao: number) => [
      { clientX: 200 - separacao / 2, clientY: 300 },
      { clientX: 200 + separacao / 2, clientY: 300 },
    ]
    const toque = (tipo: string, ativos: object[], mudados: object[] = []) => {
      const evento = new doc.defaultView!.Event(tipo, { bubbles: true })
      Object.defineProperty(evento, 'touches', { value: ativos })
      Object.defineProperty(evento, 'changedTouches', { value: mudados })
      doc.dispatchEvent(evento)
    }

    await act(async () => {
      toque('touchstart', dedos(100))
      toque('touchmove', dedos(200))
      toque('touchend', [], dedos(200))
    })

    // Dedos afastados ao dobro: 19 vira 38.
    await waitFor(() => expect(css()).toContain('font-size: 38px'))
  })

  it('o painel de leitura oferece o tamanho da interface, separado do texto', async () => {
    await seed()
    await openReader()

    await userEvent.click(screen.getByRole('button', { name: /ajustes de leitura/i }))

    expect(screen.getByText(/tamanho da interface/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /aumentar interface/i })).toBeTruthy()
    // O ajuste do texto continua sendo outro, e com nome próprio.
    expect(screen.getByRole('button', { name: /aumentar tamanho/i })).toBeTruthy()
  })

  it('as setas ficam no rodapé, nunca por cima do texto', async () => {
    await seed()
    await openReader()

    const anterior = screen.getByRole('button', { name: /página anterior/i })
    const proxima = screen.getByRole('button', { name: /próxima página/i })

    // Botão opaco no meio da tela cobre a linha que se está lendo.
    expect(anterior.closest('footer')).not.toBeNull()
    expect(proxima.closest('footer')).not.toBeNull()
  })
})

describe('ReaderScreen — fechar o livro', () => {
  it('fechar logo depois de virar a página não perde a posição', async () => {
    await seed()
    const onClose = vi.fn()
    await openReader(onClose)

    clickAt(950)
    await waitFor(() => expect(contentText()).toContain('serra guarda'))
    await userEvent.click(screen.getByRole('button', { name: /voltar para a estante/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await localMirror.getProgress(BOOK.id))?.locator.spineIndex).toBe(1)
  })
})
