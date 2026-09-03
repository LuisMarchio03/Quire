import { describe, expect, it } from 'vitest'
import { findTwins, twinKey } from './twins'
import type { Book } from '../types'

const book = (overrides: Partial<Book> = {}): Book => ({
  id: 'a',
  title: 'Confissões',
  author: null,
  format: 'pdf',
  language: null,
  coverUrl: null,
  fileSize: 100,
  spineCount: 399,
  status: 'unread',
  tags: [],
  aliases: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
})

const depois = '2026-02-01T00:00:00.000Z'

describe('findTwins', () => {
  it('mesmo formato, mesma contagem e título parecido: gêmeos', () => {
    const a = book({ id: 'a', title: 'confissoes-santo-agostinho' })
    const b = book({ id: 'b', title: 'Confissões — Santo Agostinho', addedAt: depois })

    expect(findTwins([a, b])).toEqual([[a, b]])
  })

  it('o mais antigo vem primeiro, para ser o sobrevivente', () => {
    const novo = book({ id: 'n', addedAt: '2026-03-01T00:00:00.000Z' })
    const velho = book({ id: 'v', addedAt: '2026-01-01T00:00:00.000Z' })

    expect(findTwins([novo, velho])).toEqual([[velho, novo]])
  })

  it('formato diferente não é gêmeo', () => {
    const a = book({ id: 'a' })
    const b = book({ id: 'b', format: 'epub', addedAt: depois })

    expect(findTwins([a, b])).toEqual([])
  })

  it('contagem de páginas diferente não é gêmeo', () => {
    expect(findTwins([book({ id: 'a' }), book({ id: 'b', spineCount: 398, addedAt: depois })])).toEqual([])
  })

  it('sem contagem conhecida não arrisca', () => {
    const a = book({ id: 'a', spineCount: 0 })
    const b = book({ id: 'b', spineCount: 0, addedAt: depois })

    expect(findTwins([a, b])).toEqual([])
  })

  it('título sem palavra em comum não é gêmeo, mesmo com a contagem igual', () => {
    const a = book({ id: 'a', title: 'Confissões' })
    const b = book({ id: 'b', title: 'Cidade de Deus', addedAt: depois })

    expect(findTwins([a, b])).toEqual([])
  })

  it('palavra curta não conta como semelhança', () => {
    const a = book({ id: 'a', title: 'Ode ao mar' })
    const b = book({ id: 'b', title: 'Rio e mar', addedAt: depois })

    expect(findTwins([a, b])).toEqual([])
  })

  it('casa o título tirado do metadado com o tirado do nome do arquivo', () => {
    const a = book({
      id: 'a',
      title: 'Microsoft Word - não tenho fé suficiente para ser ateu (norman geisler & frank turek).doc',
      spineCount: 302,
    })
    const b = book({
      id: 'b',
      title: 'Não Tenho Fé Suficiente para Ser Ateu_260831_182549',
      spineCount: 302,
      addedAt: depois,
    })

    expect(findTwins([a, b])).toEqual([[a, b]])
  })

  it('par recusado pelo dono não volta', () => {
    const a = book({ id: 'a' })
    const b = book({ id: 'b', addedAt: depois })

    expect(twinKey(a, b)).toBe(twinKey(b, a))
    expect(findTwins([a, b], { dismissed: [twinKey(a, b)] })).toEqual([])
  })

  it('livro excluído fica de fora', () => {
    const a = book({ id: 'a' })
    const b = book({ id: 'b', addedAt: depois, deletedAt: depois })

    expect(findTwins([a, b])).toEqual([])
  })

  it('cada livro entra num par só', () => {
    const a = book({ id: 'a' })
    const b = book({ id: 'b', addedAt: depois })
    const c = book({ id: 'c', addedAt: '2026-03-01T00:00:00.000Z' })

    expect(findTwins([a, b, c])).toEqual([[a, b]])
  })
})
