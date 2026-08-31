import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryScreen } from './LibraryScreen'
import { localMirror } from '../../lib/store/localMirror'
import { createBookStore } from '../../lib/store/bookStore'
import { deleteQuireDb } from '../../lib/store/idb'
import { makeEpub } from '../../lib/epub/fixtures/makeEpub'
import type { Book } from '../../lib/types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'id-1',
  title: 'Grande Sertão: Veredas',
  author: 'João Guimarães Rosa',
  format: 'epub',
  language: 'pt',
  coverUrl: null,
  fileSize: 1000,
  spineCount: 10,
  status: 'unread',
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

async function seed(books: Book[], withFiles: string[] = []) {
  for (const b of books) await localMirror.saveBook(b, { queue: false })
  const store = createBookStore()
  for (const id of withFiles) await store.put(id, new Blob([new Uint8Array([1])]))
}

describe('LibraryScreen', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('mostra os livros do acervo', async () => {
    await seed([book(), book({ id: 'id-2', title: 'Vidas Secas', author: 'Graciliano Ramos' })])

    render(<LibraryScreen onOpen={() => {}} />)

    // O título aparece duas vezes de propósito quando não há capa: na capa
    // gerada e na legenda. A consulta usa o cabeçalho do cartão.
    expect(await screen.findByRole('heading', { name: 'Grande Sertão: Veredas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Vidas Secas' })).toBeTruthy()
  })

  it('convida a adicionar o primeiro livro quando a estante está vazia', async () => {
    render(<LibraryScreen onOpen={() => {}} />)

    expect(await screen.findByText(/sua estante está vazia/i)).toBeTruthy()
  })

  it('filtra por título conforme se digita', async () => {
    await seed([book(), book({ id: 'id-2', title: 'Vidas Secas', author: 'Graciliano Ramos' })])
    render(<LibraryScreen onOpen={() => {}} />)
    await screen.findByRole('heading', { name: 'Vidas Secas' })

    await userEvent.type(screen.getByRole('searchbox'), 'sertão')

    expect(screen.getByRole('heading', { name: 'Grande Sertão: Veredas' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Vidas Secas' })).toBeNull()
  })

  it('filtra por autor, ignorando acento e caixa', async () => {
    await seed([book(), book({ id: 'id-2', title: 'Vidas Secas', author: 'Graciliano Ramos' })])
    render(<LibraryScreen onOpen={() => {}} />)
    await screen.findByRole('heading', { name: 'Vidas Secas' })

    await userEvent.type(screen.getByRole('searchbox'), 'GRACILIANO')

    expect(screen.getByRole('heading', { name: 'Vidas Secas' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Grande Sertão: Veredas' })).toBeNull()
  })

  it('marca o livro cujo arquivo não está neste aparelho', async () => {
    await seed([book(), book({ id: 'id-2', title: 'Vidas Secas' })], ['id-1'])

    render(<LibraryScreen onOpen={() => {}} />)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const semArquivo = screen.getByRole('article', { name: /Vidas Secas/ })
    expect(semArquivo.textContent).toMatch(/não está neste aparelho/i)
  })

  it('abre o livro que tem arquivo aqui', async () => {
    await seed([book()], ['id-1'])
    const onOpen = vi.fn()
    render(<LibraryScreen onOpen={onOpen} />)

    await userEvent.click(await screen.findByRole('article', { name: /Grande Sertão/ }))

    expect(onOpen).toHaveBeenCalledWith('id-1')
  })

  it('não abre o livro sem arquivo — oferece adicioná-lo', async () => {
    await seed([book()])
    const onOpen = vi.fn()
    render(<LibraryScreen onOpen={onOpen} />)

    await userEvent.click(await screen.findByRole('article', { name: /Grande Sertão/ }))

    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText(/adicionar arquivo aqui/i)).toBeTruthy()
  })

  it('importa o arquivo escolhido e mostra o livro na estante', async () => {
    render(<LibraryScreen onOpen={() => {}} />)
    await screen.findByText(/sua estante está vazia/i)

    const file = new File([makeEpub({ title: 'Iracema' }) as BlobPart], 'iracema.epub')
    await userEvent.upload(screen.getByLabelText(/adicionar livros/i), file)

    expect(await screen.findByRole('heading', { name: 'Iracema' })).toBeTruthy()
  })

  it('avisa quando o arquivo escolhido não serve', async () => {
    render(<LibraryScreen onOpen={() => {}} />)
    await screen.findByText(/sua estante está vazia/i)

    // Extensão errada o próprio seletor de arquivos barra; o caso que precisa
    // de aviso é o arquivo com a extensão certa e o conteúdo quebrado.
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]) as BlobPart], 'ruim.epub')
    await userEvent.upload(screen.getByLabelText(/adicionar livros/i), file)

    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('filtra por situação de leitura', async () => {
    await seed([book(), book({ id: 'id-2', title: 'Vidas Secas', status: 'finished' })])
    render(<LibraryScreen onOpen={() => {}} />)
    await screen.findByRole('heading', { name: 'Vidas Secas' })

    await userEvent.click(screen.getByRole('button', { name: /terminados/i }))

    expect(screen.getByRole('heading', { name: 'Vidas Secas' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Grande Sertão: Veredas' })).toBeNull()
  })

  it('mostra o progresso de leitura no cartão', async () => {
    await seed([book()], ['id-1'])
    await localMirror.saveProgress({
      bookId: 'id-1',
      locator: { spineIndex: 3, progressInSpine: 0 },
      percent: 0.42,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    render(<LibraryScreen onOpen={() => {}} />)

    expect(await screen.findByText(/42%/)).toBeTruthy()
  })
})
