import { describe, expect, it } from 'vitest'
import { exportMarkdown } from './exportMarkdown'
import type { Annotation, Book } from '../../lib/types'

const book: Book = {
  id: 'h1',
  title: 'Vidas Secas',
  author: 'Graciliano Ramos',
  format: 'epub',
  language: 'pt',
  coverUrl: null,
  fileSize: 1,
  spineCount: 5,
  status: 'reading',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

const annotation = (overrides: Partial<Annotation>): Annotation => ({
  id: 'a',
  bookId: 'h1',
  type: 'highlight',
  color: '#e8c468',
  anchor: { kind: 'epub', spineIndex: 2, startPath: [0], startOffset: 0, endPath: [0], endOffset: 1 },
  quotedText: '',
  noteText: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

describe('exportMarkdown', () => {
  it('abre com título e autor', () => {
    const md = exportMarkdown(book, [])
    expect(md).toContain('# Vidas Secas')
    expect(md).toContain('*Graciliano Ramos*')
  })

  it('omite o autor quando o livro não tem', () => {
    expect(exportMarkdown({ ...book, author: null }, [])).not.toContain('*')
  })

  it('cita o trecho destacado em bloco de citação', () => {
    const md = exportMarkdown(book, [annotation({ quotedText: 'Fabiano andava pelo pátio.' })])
    expect(md).toContain('> Fabiano andava pelo pátio.')
  })

  it('escreve a nota logo abaixo do trecho', () => {
    const md = exportMarkdown(book, [
      annotation({ type: 'note', quotedText: 'A cachorra Baleia', noteText: 'Aqui vira o livro.' }),
    ])
    expect(md).toContain('> A cachorra Baleia')
    expect(md).toContain('Aqui vira o livro.')
  })

  it('cita trecho de várias linhas mantendo a citação', () => {
    const md = exportMarkdown(book, [annotation({ quotedText: 'linha um\nlinha dois' })])
    expect(md).toContain('> linha um\n> linha dois')
  })

  it('lista as marcas de página com o capítulo', () => {
    const md = exportMarkdown(book, [annotation({ id: 'b', type: 'bookmark' })])
    expect(md).toContain('## Marcas de página')
    expect(md).toContain('- Capítulo 3')
  })

  it('usa o número da página quando o livro é PDF', () => {
    const md = exportMarkdown(book, [
      annotation({ id: 'b', type: 'bookmark', anchor: { kind: 'pdf', page: 41, rects: [] } }),
    ])
    expect(md).toContain('- Página 42')
  })

  it('conta o que foi marcado', () => {
    const md = exportMarkdown(book, [
      annotation({ id: '1', quotedText: 'um' }),
      annotation({ id: '2', quotedText: 'dois' }),
      annotation({ id: '3', type: 'bookmark' }),
    ])
    expect(md).toContain('2 trechos · 1 marca de página')
  })

  it('ignora o que foi excluído', () => {
    const md = exportMarkdown(book, [
      annotation({ id: '1', quotedText: 'fica' }),
      annotation({ id: '2', quotedText: 'some', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ])
    expect(md).toContain('fica')
    expect(md).not.toContain('some')
  })

  it('livro sem nada marcado ainda gera um documento válido', () => {
    expect(exportMarkdown(book, [])).toContain('Nada marcado ainda.')
  })
})
