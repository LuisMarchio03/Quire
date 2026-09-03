import { describe, expect, it } from 'vitest'
import { parseChange, rowToAnnotation, rowToBook, rowToProgress, shouldApply } from './merge.js'

describe('shouldApply', () => {
  it('aceita quando o servidor ainda não tem o registro', () => {
    expect(shouldApply('2026-01-01T00:00:00.000Z', undefined)).toBe(true)
  })

  it('aceita quando o que chegou é mais novo', () => {
    expect(shouldApply('2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(true)
  })

  it('recusa quando o que chegou é mais velho', () => {
    expect(shouldApply('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe(false)
  })

  it('recusa empate — na dúvida, o servidor mantém o que tem', () => {
    expect(shouldApply('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(false)
  })
})

describe('linhas do banco viram objetos de domínio', () => {
  it('livro', () => {
    const book = rowToBook({
      id: 'h1', title: 'Grande Sertão', author: null, format: 'epub', language: 'pt',
      cover_url: null, file_size: 42, spine_count: 3, status: 'reading', tags: '["Ficção"]',
      added_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
      synced_at: '2026-01-03T00:00:00.000Z', deleted_at: null,
    })
    expect(book).toEqual({
      id: 'h1', title: 'Grande Sertão', author: null, format: 'epub', language: 'pt',
      coverUrl: null, fileSize: 42, spineCount: 3, status: 'reading', tags: ['Ficção'], aliases: [],
      addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null,
    })
  })

  it('progresso, com o locator desserializado', () => {
    const progress = rowToProgress({
      book_id: 'h1', locator: '{"spineIndex":4,"progressInSpine":0.25}',
      percent: 0.3, updated_at: '2026-01-02T00:00:00.000Z', synced_at: '2026-01-03T00:00:00.000Z',
    })
    expect(progress.locator).toEqual({ spineIndex: 4, progressInSpine: 0.25 })
    expect(progress.bookId).toBe('h1')
  })

  it('anotação, com a âncora desserializada', () => {
    const annotation = rowToAnnotation({
      id: 'a1', book_id: 'h1', type: 'highlight', color: '#e8c468',
      anchor: '{"kind":"pdf","page":2,"rects":[]}', quoted_text: 'trecho', note_text: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
      synced_at: '2026-01-03T00:00:00.000Z', deleted_at: null,
    })
    expect(annotation.anchor).toEqual({ kind: 'pdf', page: 2, rects: [] })
    expect(annotation.quotedText).toBe('trecho')
  })
})

describe('parseChange', () => {
  const book = {
    id: 'h1', title: 'Livro', author: null, format: 'epub', language: null, coverUrl: null,
    fileSize: 1, spineCount: 1, status: 'unread', tags: [], addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
  }

  it('aceita uma mudança de livro bem formada', () => {
    expect(parseChange({ entity: 'book', data: book })).not.toBeNull()
  })

  it('recusa entidade desconhecida', () => {
    expect(parseChange({ entity: 'coisa', data: book })).toBeNull()
  })

  it('recusa livro sem id ou sem updatedAt', () => {
    expect(parseChange({ entity: 'book', data: { ...book, id: '' } })).toBeNull()
    expect(parseChange({ entity: 'book', data: { ...book, updatedAt: 123 } })).toBeNull()
  })

  it('recusa formato e status fora do conjunto permitido', () => {
    expect(parseChange({ entity: 'book', data: { ...book, format: 'mobi' } })).toBeNull()
    expect(parseChange({ entity: 'book', data: { ...book, status: 'lendo' } })).toBeNull()
  })

  it('recusa entrada que não é objeto', () => {
    expect(parseChange(null)).toBeNull()
    expect(parseChange('livro')).toBeNull()
    expect(parseChange({ entity: 'book' })).toBeNull()
  })

  it('recusa anotação com tipo inválido e aceita a válida', () => {
    const annotation = {
      id: 'a1', bookId: 'h1', type: 'highlight', color: null,
      anchor: { kind: 'pdf', page: 1, rects: [] }, quotedText: '', noteText: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
    }
    expect(parseChange({ entity: 'annotation', data: annotation })).not.toBeNull()
    expect(parseChange({ entity: 'annotation', data: { ...annotation, type: 'grifo' } })).toBeNull()
  })

  it('recusa progresso sem locator', () => {
    expect(
      parseChange({ entity: 'progress', data: { bookId: 'h1', percent: 0.1, updatedAt: '2026-01-01T00:00:00.000Z' } }),
    ).toBeNull()
  })
})

describe('etiquetas na sincronização', () => {
  const linhaBase = {
    id: 'h1', title: 'Livro', author: null, format: 'epub', language: null,
    cover_url: null, file_size: 1, spine_count: 1, status: 'unread',
    added_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    synced_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  }

  it('lê a lista guardada como JSON', () => {
    expect(rowToBook({ ...linhaBase, tags: '["Ficção","Brasil"]' }).tags).toEqual([
      'Ficção',
      'Brasil',
    ])
  })

  it('banco antigo sem a coluna vira lista vazia', () => {
    expect(rowToBook({ ...linhaBase, tags: null }).tags).toEqual([])
    expect(rowToBook(linhaBase).tags).toEqual([])
  })

  it('conteúdo estragado não derruba a leitura', () => {
    expect(rowToBook({ ...linhaBase, tags: 'não é json' }).tags).toEqual([])
    expect(rowToBook({ ...linhaBase, tags: '{"a":1}' }).tags).toEqual([])
    expect(rowToBook({ ...linhaBase, tags: '[1,"boa",null]' }).tags).toEqual(['boa'])
  })

  const livro = {
    id: 'h1', title: 'Livro', author: null, format: 'epub', language: null, coverUrl: null,
    fileSize: 1, spineCount: 1, status: 'unread', addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
  }

  it('aceita etiquetas bem formadas', () => {
    const change = parseChange({ entity: 'book', data: { ...livro, tags: ['Ficção'] } })
    expect(change?.entity === 'book' && change.data.tags).toEqual(['Ficção'])
  })

  it('livro sem o campo entra com lista vazia', () => {
    const change = parseChange({ entity: 'book', data: livro })
    expect(change?.entity === 'book' && change.data.tags).toEqual([])
  })

  it('recusa etiqueta que não é texto ou lista longa demais', () => {
    expect(parseChange({ entity: 'book', data: { ...livro, tags: 'ficção' } })).toBeNull()
    expect(parseChange({ entity: 'book', data: { ...livro, tags: [3] } })).toBeNull()
    expect(
      parseChange({ entity: 'book', data: { ...livro, tags: Array(100).fill('x') } }),
    ).toBeNull()
  })
})

describe('aliases na sincronização', () => {
  const linhaBase = {
    id: 'h1', title: 'Livro', author: null, format: 'epub', language: null,
    cover_url: null, file_size: 1, spine_count: 1, status: 'unread', tags: '[]',
    added_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    synced_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  }

  it('lê a lista de aliases guardada como JSON', () => {
    expect(rowToBook({ ...linhaBase, aliases: '["h2","h3"]' }).aliases).toEqual(['h2', 'h3'])
  })

  it('banco antigo sem a coluna vira lista vazia', () => {
    expect(rowToBook({ ...linhaBase, aliases: null }).aliases).toEqual([])
    expect(rowToBook(linhaBase).aliases).toEqual([])
  })

  const livro = {
    id: 'h1', title: 'Livro', author: null, format: 'epub', language: null, coverUrl: null,
    fileSize: 1, spineCount: 1, status: 'unread', tags: [], addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
  }

  it('aceita aliases bem formados', () => {
    const change = parseChange({ entity: 'book', data: { ...livro, aliases: ['h2'] } })
    expect(change?.entity === 'book' && change.data.aliases).toEqual(['h2'])
  })

  it('livro sem o campo entra com lista vazia', () => {
    const change = parseChange({ entity: 'book', data: livro })
    expect(change?.entity === 'book' && change.data.aliases).toEqual([])
  })

  it('recusa alias que não é texto, vazio, longo demais ou lista longa demais', () => {
    expect(parseChange({ entity: 'book', data: { ...livro, aliases: 'h2' } })).toBeNull()
    expect(parseChange({ entity: 'book', data: { ...livro, aliases: [3] } })).toBeNull()
    expect(parseChange({ entity: 'book', data: { ...livro, aliases: [''] } })).toBeNull()
    expect(
      parseChange({ entity: 'book', data: { ...livro, aliases: ['x'.repeat(201)] } }),
    ).toBeNull()
    expect(
      parseChange({ entity: 'book', data: { ...livro, aliases: Array(100).fill('h2') } }),
    ).toBeNull()
  })
})
