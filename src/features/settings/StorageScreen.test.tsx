import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StorageScreen } from './StorageScreen'
import { createBookStore } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import { deleteQuireDb } from '../../lib/store/idb'
import type { Book } from '../../lib/types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'id-1',
  title: 'Grande Sertão: Veredas',
  author: 'Rosa',
  format: 'epub',
  language: 'pt',
  coverUrl: null,
  fileSize: 2_500_000,
  spineCount: 10,
  status: 'reading',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

function stubStorage({ persisted = true, usage = 4_000_000, quota = 100_000_000 } = {}) {
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => ({ usage, quota }),
      persisted: async () => persisted,
      persist: async () => true,
    },
  })
}

describe('StorageScreen', () => {
  beforeEach(async () => {
    await deleteQuireDb()
    vi.unstubAllGlobals()
  })

  it('mostra o espaço usado e o disponível', async () => {
    stubStorage()
    render(<StorageScreen onClose={() => {}} />)

    expect(await screen.findByText(/3\.8 MB usados/)).toBeTruthy()
    expect(screen.getByText(/95 MB disponíveis/)).toBeTruthy()
  })

  it('avisa quando o navegador não garante a permanência dos arquivos', async () => {
    stubStorage({ persisted: false })
    render(<StorageScreen onClose={() => {}} />)

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toMatch(/ainda pode apagar os arquivos/i)
    expect(screen.getByRole('button', { name: /pedir para manter/i })).toBeTruthy()
  })

  it('não mostra o aviso quando a permanência já está garantida', async () => {
    stubStorage({ persisted: true })
    render(<StorageScreen onClose={() => {}} />)

    await screen.findByText(/usados/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lista só os livros cujo arquivo está neste aparelho', async () => {
    stubStorage()
    await localMirror.saveBook(book(), { queue: false })
    await localMirror.saveBook(book({ id: 'id-2', title: 'Vidas Secas' }), { queue: false })
    await createBookStore().put('id-1', new Blob([new Uint8Array([1, 2, 3])]))

    render(<StorageScreen onClose={() => {}} />)

    expect(await screen.findByText('Grande Sertão: Veredas')).toBeTruthy()
    expect(screen.queryByText('Vidas Secas')).toBeNull()
    expect(screen.getByText(/1 de 2/)).toBeTruthy()
  })

  it('remover o arquivo mantém o livro e as anotações', async () => {
    stubStorage()
    await localMirror.saveBook(book(), { queue: false })
    await createBookStore().put('id-1', new Blob([new Uint8Array([1, 2, 3])]))
    await localMirror.saveAnnotation({
      id: 'ann-1',
      bookId: 'id-1',
      type: 'highlight',
      color: '#e8c468',
      anchor: { kind: 'epub', spineIndex: 0, startPath: [0], startOffset: 0, endPath: [0], endOffset: 3 },
      quotedText: 'Nonada',
      noteText: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })

    render(<StorageScreen onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: /remover daqui/i }))

    await waitFor(() => expect(screen.getByText(/nenhum arquivo guardado/i)).toBeTruthy())
    expect(await createBookStore().has('id-1')).toBe(false)
    expect(await localMirror.getBook('id-1')).toBeDefined()
    expect(await localMirror.listAnnotations('id-1')).toHaveLength(1)
  })

  it('esconde o pareamento quando não há sessão para gerá-lo', async () => {
    stubStorage()
    render(<StorageScreen onClose={() => {}} canPair={false} />)

    await screen.findByText(/usados/)
    expect(screen.queryByRole('button', { name: /gerar código/i })).toBeNull()
  })

  it('mostra o controle de tamanho da interface e o aciona', async () => {
    stubStorage()
    const increase = vi.fn()
    const reset = vi.fn()
    render(
      <StorageScreen
        onClose={() => {}}
        uiScale={{ scale: 1.2, increase, decrease: vi.fn(), reset, atMin: false, atMax: false }}
      />,
    )

    expect(await screen.findByText('120%')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /aumentar interface/i }))
    expect(increase).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /voltar a 100%/i }))
    expect(reset).toHaveBeenCalled()
  })

  it('em 100% não oferece voltar ao padrão, porque já está nele', async () => {
    stubStorage()
    render(
      <StorageScreen
        onClose={() => {}}
        uiScale={{
          scale: 1,
          increase: vi.fn(),
          decrease: vi.fn(),
          reset: vi.fn(),
          atMin: false,
          atMax: false,
        }}
      />,
    )

    await screen.findByText('100%')
    expect(screen.queryByRole('button', { name: /voltar a 100%/i })).toBeNull()
  })

  it('nos limites, o botão correspondente fica desativado', async () => {
    stubStorage()
    render(
      <StorageScreen
        onClose={() => {}}
        uiScale={{
          scale: 1.6,
          increase: vi.fn(),
          decrease: vi.fn(),
          reset: vi.fn(),
          atMin: false,
          atMax: true,
        }}
      />,
    )

    expect(await screen.findByRole('button', { name: /aumentar interface/i })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('button', { name: /diminuir interface/i })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('sem o controle passado, a seção nem aparece', async () => {
    stubStorage()
    render(<StorageScreen onClose={() => {}} />)

    await screen.findByText(/usados/)
    expect(screen.queryByText(/tamanho da interface/i)).toBeNull()
  })
})
