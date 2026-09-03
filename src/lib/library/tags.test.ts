import { describe, expect, it } from 'vitest'
import { collectTags, filterBooks, normalizeTags, parseTagInput } from './tags'
import type { Book } from '../types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'id',
  title: 'Grande Sertão: Veredas',
  author: 'João Guimarães Rosa',
  format: 'epub',
  language: 'pt',
  coverUrl: null,
  fileSize: 1,
  spineCount: 1,
  status: 'unread',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

describe('normalizeTags', () => {
  it('preserva como foi escrito e ordena', () => {
    expect(normalizeTags(['Ficção', 'Brasil'])).toEqual(['Brasil', 'Ficção'])
  })

  it('junta as que só diferem em acento ou caixa', () => {
    expect(normalizeTags(['Ficção', 'ficcao', 'FICÇÃO'])).toEqual(['Ficção'])
  })

  it('apara espaço e descarta vazias', () => {
    expect(normalizeTags(['  filosofia  ', '', '   ', 'grécia'])).toEqual(['filosofia', 'grécia'])
  })

  it('encolhe espaço interno repetido', () => {
    expect(normalizeTags(['livro    técnico'])).toEqual(['livro técnico'])
  })

  it('corta etiqueta absurdamente longa', () => {
    expect(normalizeTags(['x'.repeat(200)])[0]).toHaveLength(40)
  })

  it('limita quantas cabem num livro', () => {
    const muitas = Array.from({ length: 50 }, (_, i) => `etiqueta ${i}`)
    expect(normalizeTags(muitas)).toHaveLength(24)
  })

  it('ignora o que não é texto', () => {
    expect(normalizeTags([null, 3, 'boa'] as unknown as string[])).toEqual(['boa'])
  })
})

describe('parseTagInput', () => {
  it('separa por vírgula, ponto e vírgula e quebra de linha', () => {
    expect(parseTagInput('filosofia, grécia; estoicismo\nreler')).toEqual([
      'estoicismo',
      'filosofia',
      'grécia',
      'reler',
    ])
  })

  it('texto vazio não vira etiqueta', () => {
    expect(parseTagInput('  ,  ; ')).toEqual([])
  })
})

describe('collectTags', () => {
  it('conta o uso e ordena da mais usada para a menos', () => {
    const acervo = [
      book({ id: '1', tags: ['Ficção', 'Brasil'] }),
      book({ id: '2', tags: ['Ficção'] }),
      book({ id: '3', tags: ['Técnico'] }),
    ]

    expect(collectTags(acervo)).toEqual([
      { tag: 'Ficção', count: 2 },
      { tag: 'Brasil', count: 1 },
      { tag: 'Técnico', count: 1 },
    ])
  })

  it('trata variação de acento como a mesma etiqueta', () => {
    const acervo = [book({ id: '1', tags: ['Ficção'] }), book({ id: '2', tags: ['ficcao'] })]
    expect(collectTags(acervo)).toEqual([{ tag: 'Ficção', count: 2 }])
  })

  it('acervo sem etiqueta nenhuma devolve lista vazia', () => {
    expect(collectTags([book()])).toEqual([])
  })
})

describe('filterBooks', () => {
  const acervo = [
    book({ id: '1', title: 'Grande Sertão: Veredas', author: 'Rosa', tags: ['Ficção', 'Brasil'] }),
    book({ id: '2', title: 'Vidas Secas', author: 'Graciliano Ramos', tags: ['Ficção'], status: 'finished' }),
    book({ id: '3', title: 'Clean Architecture', author: 'Robert Martin', tags: ['Técnico', 'Trabalho'] }),
  ]

  it('sem filtro, devolve tudo', () => {
    expect(filterBooks(acervo, {})).toHaveLength(3)
  })

  it('casa título, autor e etiqueta no mesmo campo', () => {
    expect(filterBooks(acervo, { query: 'sertão' }).map((b) => b.id)).toEqual(['1'])
    expect(filterBooks(acervo, { query: 'graciliano' }).map((b) => b.id)).toEqual(['2'])
    expect(filterBooks(acervo, { query: 'técnico' }).map((b) => b.id)).toEqual(['3'])
  })

  it('ignora acento e caixa', () => {
    expect(filterBooks(acervo, { query: 'FICCAO' })).toHaveLength(2)
  })

  it('cada palavra digitada precisa aparecer em algum lugar', () => {
    expect(filterBooks(acervo, { query: 'rosa sertão' }).map((b) => b.id)).toEqual(['1'])
    expect(filterBooks(acervo, { query: 'rosa clean' })).toHaveLength(0)
  })

  it('etiquetas escolhidas se somam: filtrar estreita', () => {
    expect(filterBooks(acervo, { tags: ['Ficção'] })).toHaveLength(2)
    expect(filterBooks(acervo, { tags: ['Ficção', 'Brasil'] }).map((b) => b.id)).toEqual(['1'])
    expect(filterBooks(acervo, { tags: ['Ficção', 'Técnico'] })).toHaveLength(0)
  })

  it('combina etiqueta, situação e texto', () => {
    expect(
      filterBooks(acervo, { tags: ['Ficção'], status: 'finished' }).map((b) => b.id),
    ).toEqual(['2'])
    expect(filterBooks(acervo, { tags: ['Ficção'], status: 'finished', query: 'rosa' })).toHaveLength(0)
  })

  it('livro sem etiqueta nenhuma não quebra o filtro', () => {
    const semEtiqueta = [book({ id: '4', tags: undefined as unknown as string[] })]
    expect(filterBooks(semEtiqueta, { query: 'sertão' })).toHaveLength(1)
    expect(filterBooks(semEtiqueta, { tags: ['Ficção'] })).toHaveLength(0)
  })
})
