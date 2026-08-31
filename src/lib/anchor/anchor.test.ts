import { beforeEach, describe, expect, it } from 'vitest'
import {
  anchorFromOffsets,
  anchorToRange,
  rangeToAnchor,
  reanchorByText,
  rectsToPdfAnchor,
  resolveAnchor,
  selectionOffsets,
} from './anchor'
import type { Anchor } from '../types'

let root: HTMLElement

function mount(html: string) {
  root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}

function selectText(needle: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const index = node.textContent?.indexOf(needle) ?? -1
    if (index >= 0) {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + needle.length)
      return range
    }
  }
  throw new Error(`texto não encontrado: ${needle}`)
}

describe('âncoras', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('ida e volta preserva o trecho selecionado', () => {
    mount('<p>Era uma vez um começo de história.</p>')
    const anchor = rangeToAnchor(selectText('um começo'), root, 3)

    expect(anchorToRange(anchor, root)?.toString()).toBe('um começo')
  })

  it('guarda o capítulo a que a âncora pertence', () => {
    mount('<p>Texto qualquer.</p>')
    const anchor = rangeToAnchor(selectText('Texto'), root, 7)
    expect(anchor.kind === 'epub' && anchor.spineIndex).toBe(7)
  })

  it('funciona com seleção que atravessa dois parágrafos', () => {
    mount('<p>Primeiro trecho.</p><p>Segundo trecho.</p>')
    const range = document.createRange()
    const first = root.querySelectorAll('p')[0].firstChild!
    const second = root.querySelectorAll('p')[1].firstChild!
    range.setStart(first, 9)
    range.setEnd(second, 7)

    const anchor = rangeToAnchor(range, root, 0)

    expect(anchorToRange(anchor, root)?.toString()).toBe('trecho.Segundo')
  })

  it('anchorToRange devolve null quando o caminho não existe mais', () => {
    mount('<p>Um texto.</p>')
    const anchor = rangeToAnchor(selectText('texto'), root, 0)
    root.innerHTML = ''

    expect(anchorToRange(anchor, root)).toBeNull()
  })

  it('reanchorByText reencontra o trecho quando o documento mudou', () => {
    mount('<p>Era uma vez um começo.</p>')
    root.innerHTML = '<p>Nota do editor.</p><p>Era uma vez um começo.</p>'

    const anchor = reanchorByText('um começo', root, 0)

    expect(anchor).not.toBeNull()
    expect(anchorToRange(anchor!, root)?.toString()).toBe('um começo')
  })

  it('reanchorByText encontra trecho que atravessa marcação', () => {
    mount('<p>Era uma <em>vez</em> um começo.</p>')
    const anchor = reanchorByText('uma vez um', root, 0)
    expect(anchorToRange(anchor!, root)?.toString()).toBe('uma vez um')
  })

  it('reanchorByText devolve null quando o trecho sumiu', () => {
    mount('<p>Outro conteúdo.</p>')
    expect(reanchorByText('um começo', root, 0)).toBeNull()
  })

  it('resolveAnchor usa o caminho quando ele ainda vale', () => {
    mount('<p>Era uma vez um começo.</p>')
    const anchor = rangeToAnchor(selectText('um começo'), root, 0)

    const resolved = resolveAnchor(anchor, 'um começo', root)

    expect(resolved.orphan).toBe(false)
    expect(resolved.range?.toString()).toBe('um começo')
    expect(resolved.anchor).toEqual(anchor)
  })

  it('resolveAnchor reancora e devolve a âncora corrigida quando o caminho envelheceu', () => {
    mount('<p>Era uma vez um começo.</p>')
    const anchor = rangeToAnchor(selectText('um começo'), root, 0)
    root.innerHTML = '<p>Nota do editor.</p><p>Era uma vez um começo.</p>'

    const resolved = resolveAnchor(anchor, 'um começo', root)

    expect(resolved.orphan).toBe(false)
    expect(resolved.range?.toString()).toBe('um começo')
    expect(resolved.anchor).not.toEqual(anchor)
  })

  it('resolveAnchor marca como órfã quando o trecho não existe mais', () => {
    mount('<p>Era uma vez um começo.</p>')
    const anchor = rangeToAnchor(selectText('um começo'), root, 0)
    root.innerHTML = '<p>Texto completamente diferente.</p>'

    const resolved = resolveAnchor(anchor, 'um começo', root)

    expect(resolved.orphan).toBe(true)
    expect(resolved.range).toBeNull()
  })

  it('âncora de PDF passa direto, sem depender do DOM', () => {
    mount('<p>irrelevante</p>')
    const anchor: Anchor = { kind: 'pdf', page: 4, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }] }

    const resolved = resolveAnchor(anchor, 'trecho', root)

    expect(resolved).toEqual({ range: null, orphan: false, anchor })
  })

  it('rectsToPdfAnchor normaliza os retângulos pela caixa da página', () => {
    const box = { x: 100, y: 50, width: 400, height: 800 }
    const anchor = rectsToPdfAnchor(
      [{ x: 140, y: 130, width: 200, height: 16 }],
      box,
      4,
    )

    expect(anchor).toEqual({
      kind: 'pdf',
      page: 4,
      rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.02 }],
    })
  })

  it('rectsToPdfAnchor descarta retângulos vazios da seleção', () => {
    const anchor = rectsToPdfAnchor(
      [
        { x: 0, y: 0, width: 0, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
      ],
      { x: 0, y: 0, width: 100, height: 100 },
      0,
    )

    expect(anchor.kind === 'pdf' && anchor.rects).toHaveLength(1)
  })

  it('mede a seleção em caracteres e volta dela para uma âncora', () => {
    mount('<p>Era uma vez um começo.</p>')
    const offsets = selectionOffsets(selectText('um começo'), root)!

    expect(offsets).toEqual({ start: 12, end: 21 })
    const anchor = anchorFromOffsets(root, offsets.start, offsets.end, 0)
    expect(anchorToRange(anchor!, root)?.toString()).toBe('um começo')
  })

  it('o deslocamento não muda quando o texto ganha marcação por dentro', () => {
    mount('<p>Era uma vez um começo.</p>')
    const antes = selectionOffsets(selectText('um começo'), root)!

    // Simula a camada de destaques envolvendo um trecho anterior.
    root.innerHTML = '<p>Era <mark>uma vez</mark> um começo.</p>'
    const anchor = anchorFromOffsets(root, antes.start, antes.end, 0)

    expect(anchorToRange(anchor!, root)?.toString()).toBe('um começo')
  })

  it('mede seleção que começa num contêiner de elemento', () => {
    mount('<p>Primeiro.</p><p>Segundo.</p>')
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(root.querySelectorAll('p')[1].firstChild!, 7)

    expect(selectionOffsets(range, root)).toEqual({ start: 0, end: 16 })
  })

  it('recusa seleção vazia', () => {
    mount('<p>Texto.</p>')
    const range = document.createRange()
    const node = root.querySelector('p')!.firstChild!
    range.setStart(node, 2)
    range.setEnd(node, 2)

    expect(selectionOffsets(range, root)).toBeNull()
  })
})
