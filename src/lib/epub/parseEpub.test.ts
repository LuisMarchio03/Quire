import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { parseEpub, UnsupportedEpubError } from './parseEpub'
import { makeEpub } from './fixtures/makeEpub'

describe('parseEpub', () => {
  it('extrai título, autor e idioma', async () => {
    const book = await parseEpub(makeEpub({ title: 'Memórias Póstumas', author: 'Machado' }))
    expect(book.metadata).toEqual({
      title: 'Memórias Póstumas',
      author: 'Machado',
      language: 'pt-BR',
    })
  })

  it('aceita livro sem autor', async () => {
    const book = await parseEpub(makeEpub({ author: null }))
    expect(book.metadata.author).toBeNull()
  })

  it('monta o spine na ordem declarada, com href resolvido a partir do OPF', async () => {
    const book = await parseEpub(makeEpub())
    expect(book.spine.map((i) => i.href)).toEqual(['OEBPS/text/c1.xhtml', 'OEBPS/text/c2.xhtml'])
  })

  it('resolve href quando o OPF está na raiz do zip', async () => {
    const book = await parseEpub(makeEpub({ opfPath: 'content.opf' }))
    expect(book.spine[0].href).toBe('text/c1.xhtml')
  })

  it('acha a capa declarada por properties="cover-image"', async () => {
    const book = await parseEpub(makeEpub({ cover: 'properties' }))
    expect(book.coverPath).toBe('OEBPS/images/cover.png')
  })

  it('acha a capa declarada por <meta name="cover">', async () => {
    const book = await parseEpub(makeEpub({ cover: 'meta' }))
    expect(book.coverPath).toBe('OEBPS/images/cover.png')
  })

  it('devolve capa nula quando o livro não declara nenhuma', async () => {
    const book = await parseEpub(makeEpub({ cover: 'none' }))
    expect(book.coverPath).toBeNull()
  })

  it('lê o sumário do nav.xhtml de um EPUB 3', async () => {
    const book = await parseEpub(makeEpub({ version: 3 }))
    expect(book.toc.map((e) => e.label)).toEqual(['Capítulo um', 'Capítulo dois'])
    expect(book.toc[0].href).toBe('OEBPS/text/c1.xhtml')
  })

  it('lê o sumário do toc.ncx de um EPUB 2', async () => {
    const book = await parseEpub(makeEpub({ version: 2 }))
    expect(book.toc.map((e) => e.label)).toEqual(['Capítulo um', 'Capítulo dois'])
  })

  it('devolve os bytes de um recurso pelo caminho resolvido', async () => {
    const book = await parseEpub(makeEpub())
    const chapter = book.resource('OEBPS/text/c1.xhtml')
    expect(chapter?.mediaType).toBe('application/xhtml+xml')
    expect(new TextDecoder().decode(chapter!.bytes)).toContain('Era uma vez')
  })

  it('resolve recurso com caminho relativo a partir de outro documento', async () => {
    const book = await parseEpub(makeEpub())
    expect(book.resolveFrom('OEBPS/text/c1.xhtml', '../images/cover.png')).toBe(
      'OEBPS/images/cover.png',
    )
    expect(book.resolveFrom('OEBPS/text/c1.xhtml', 'c2.xhtml')).toBe('OEBPS/text/c2.xhtml')
  })

  it('decodifica href com escape de URL', async () => {
    const book = await parseEpub(
      makeEpub({ chapters: [{ href: 'text/cap%20um.xhtml', title: 'Um', body: '<p>a</p>' }] }),
    )
    expect(book.spine[0].href).toBe('OEBPS/text/cap um.xhtml')
    expect(book.resource(book.spine[0].href)).toBeDefined()
  })

  it('recusa arquivo sem container.xml', async () => {
    await expect(parseEpub(makeEpub({ containerXml: null }))).rejects.toBeInstanceOf(
      UnsupportedEpubError,
    )
  })

  it('recusa container.xml sem rootfile', async () => {
    const bad = makeEpub({ containerXml: '<?xml version="1.0"?><container/>' })
    await expect(parseEpub(bad)).rejects.toBeInstanceOf(UnsupportedEpubError)
  })

  it('recusa zip que não é um EPUB', async () => {
    const notEpub = zipSync({ 'leia.txt': new TextEncoder().encode('oi') })
    await expect(parseEpub(notEpub)).rejects.toBeInstanceOf(UnsupportedEpubError)
  })

  it('recusa bytes que não são zip', async () => {
    await expect(parseEpub(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(
      UnsupportedEpubError,
    )
  })

  it('recusa spine vazio — não há o que ler', async () => {
    await expect(parseEpub(makeEpub({ chapters: [] }))).rejects.toBeInstanceOf(UnsupportedEpubError)
  })
})
