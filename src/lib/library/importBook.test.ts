import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importBook } from './importBook'
import { makeEpub } from '../epub/fixtures/makeEpub'
import { createBookStore } from '../store/bookStore'
import { localMirror } from '../store/localMirror'
import { deleteQuireDb } from '../store/idb'

const epubFile = (name = 'livro.epub', options = {}) =>
  new File([makeEpub(options) as BlobPart], name, { type: 'application/epub+zip' })

const pdfFile = (name = 'apostila.pdf') =>
  new File([new TextEncoder().encode('%PDF-1.7\nconteúdo fingido') as BlobPart], name, {
    type: 'application/pdf',
  })

const fakePdfLoader = () =>
  vi.fn(async () => ({
    numPages: 12,
    getPage: async () => ({}) as never,
    title: 'Apostila de Cálculo',
    author: 'Departamento',
    renderCover: async () => null,
  }))

describe('importBook', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('adiciona um EPUB com título e autor lidos do próprio arquivo', async () => {
    const result = await importBook(epubFile('qualquer.epub', { title: 'Sagarana', author: 'Rosa' }))

    expect(result.status).toBe('added')
    if (result.status !== 'added') return
    expect(result.book.title).toBe('Sagarana')
    expect(result.book.author).toBe('Rosa')
    expect(result.book.format).toBe('epub')
    expect(result.book.spineCount).toBe(2)
  })

  it('guarda o arquivo e registra o livro no acervo', async () => {
    const result = await importBook(epubFile())
    if (result.status !== 'added') throw new Error('deveria ter adicionado')

    expect(await createBookStore().has(result.book.id)).toBe(true)
    expect(await localMirror.getBook(result.book.id)).toBeDefined()
  })

  it('usa o hash do conteúdo como identidade do livro', async () => {
    const bytes = makeEpub()
    const um = await importBook(new File([bytes as BlobPart], 'a.epub'))
    await deleteQuireDb()
    const outro = await importBook(new File([bytes as BlobPart], 'nome-diferente.epub'))

    expect(um.status).toBe('added')
    expect(outro.status).toBe('added')
    if (um.status !== 'added' || outro.status !== 'added') return
    expect(um.book.id).toBe(outro.book.id)
  })

  it('reimportar o mesmo arquivo reconecta em vez de duplicar', async () => {
    const bytes = makeEpub()
    const primeiro = await importBook(new File([bytes as BlobPart], 'a.epub'))
    const segundo = await importBook(new File([bytes as BlobPart], 'a.epub'))

    expect(segundo.status).toBe('relinked')
    if (primeiro.status !== 'added' || segundo.status !== 'relinked') return
    expect(segundo.book.id).toBe(primeiro.book.id)
    expect(await localMirror.listBooks()).toHaveLength(1)
  })

  it('reconectar preserva as anotações que já existiam', async () => {
    const bytes = makeEpub()
    const primeiro = await importBook(new File([bytes as BlobPart], 'a.epub'))
    if (primeiro.status !== 'added') throw new Error('deveria ter adicionado')

    await localMirror.saveAnnotation({
      id: 'ann-1',
      bookId: primeiro.book.id,
      type: 'highlight',
      color: '#e8c468',
      anchor: { kind: 'epub', spineIndex: 0, startPath: [0], startOffset: 0, endPath: [0], endOffset: 3 },
      quotedText: 'Era',
      noteText: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })
    await createBookStore().delete(primeiro.book.id)

    await importBook(new File([bytes as BlobPart], 'a.epub'))

    expect(await localMirror.listAnnotations(primeiro.book.id)).toHaveLength(1)
    expect(await createBookStore().has(primeiro.book.id)).toBe(true)
  })

  it('reconecta um livro que tinha sido excluído do acervo, trazendo-o de volta', async () => {
    const bytes = makeEpub()
    const primeiro = await importBook(new File([bytes as BlobPart], 'a.epub'))
    if (primeiro.status !== 'added') throw new Error('deveria ter adicionado')
    await localMirror.saveBook({ ...primeiro.book, deletedAt: '2026-02-01T00:00:00.000Z' })

    const segundo = await importBook(new File([bytes as BlobPart], 'a.epub'))

    expect(segundo.status).toBe('relinked')
    expect((await localMirror.getBook(primeiro.book.id))?.deletedAt).toBeNull()
  })

  it('lê o PDF pelo carregador injetado e usa os metadados dele', async () => {
    const loadPdfSource = fakePdfLoader()
    const result = await importBook(pdfFile(), { deps: { loadPdfSource } })

    expect(loadPdfSource).toHaveBeenCalled()
    if (result.status !== 'added') throw new Error('deveria ter adicionado')
    expect(result.book.format).toBe('pdf')
    expect(result.book.title).toBe('Apostila de Cálculo')
    expect(result.book.spineCount).toBe(12)
  })

  it('cai para o nome do arquivo quando o PDF não traz título', async () => {
    const loadPdfSource = vi.fn(async () => ({
      numPages: 3,
      getPage: async () => ({}) as never,
      title: null,
      author: null,
      renderCover: async () => null,
    }))

    const result = await importBook(pdfFile('Contabilidade Geral.pdf'), { deps: { loadPdfSource } })

    if (result.status !== 'added') throw new Error('deveria ter adicionado')
    expect(result.book.title).toBe('Contabilidade Geral')
  })

  it('recusa arquivo de formato desconhecido', async () => {
    const result = await importBook(new File([new TextEncoder().encode('oi') as BlobPart], 'nota.txt'))

    expect(result).toEqual({ status: 'unsupported', reason: expect.stringContaining('formato') })
    expect(await localMirror.listBooks()).toHaveLength(0)
  })

  it('recusa EPUB corrompido sem deixar arquivo órfão guardado', async () => {
    const quebrado = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]) as BlobPart], 'ruim.epub')

    const result = await importBook(quebrado)

    expect(result.status).toBe('unsupported')
    expect(await createBookStore().list()).toHaveLength(0)
    expect(await localMirror.listBooks()).toHaveLength(0)
  })

  it('importa mesmo quando a capa não pôde ser gerada', async () => {
    const result = await importBook(epubFile(), {
      deps: { makeCover: async () => null },
    })

    if (result.status !== 'added') throw new Error('deveria ter adicionado')
    expect(result.book.coverUrl).toBeNull()
  })

  it('guarda a capa gerada junto do livro', async () => {
    const result = await importBook(epubFile(), {
      deps: { makeCover: async () => 'data:image/webp;base64,AAA' },
    })

    if (result.status !== 'added') throw new Error('deveria ter adicionado')
    expect(result.book.coverUrl).toBe('data:image/webp;base64,AAA')
  })

  it('relata o progresso das etapas', async () => {
    const stages: string[] = []
    await importBook(epubFile(), { onProgress: (stage) => stages.push(stage) })

    expect(stages).toContain('hash')
    expect(stages).toContain('leitura')
    expect(stages.at(-1)).toBe('pronto')
  })
})
