import { beforeEach, describe, expect, it } from 'vitest'
import { paintHighlights } from './highlightLayer'

let root: HTMLElement

function rangeFor(needle: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const at = node.textContent?.indexOf(needle) ?? -1
    if (at >= 0) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      return range
    }
  }
  throw new Error(`não achei: ${needle}`)
}

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = '<p>Era uma vez um começo.</p><p>E depois um fim.</p>'
  document.body.append(root)
})

describe('camada de destaques', () => {
  it('envolve o trecho destacado', () => {
    paintHighlights(root, [{ id: 'a', color: '#e8c468', range: rangeFor('um começo') }])

    const mark = root.querySelector('mark[data-quire-highlight="a"]')
    expect(mark?.textContent).toBe('um começo')
  })

  it('leva a cor do destaque para a marcação', () => {
    paintHighlights(root, [{ id: 'a', color: '#7fc4a2', range: rangeFor('começo') }])

    const mark = root.querySelector('mark') as HTMLElement
    expect(mark.style.backgroundColor).toBeTruthy()
    expect(mark.dataset.quireColor).toBe('#7fc4a2')
  })

  it('destaque que atravessa dois parágrafos vira uma marca em cada', () => {
    const range = document.createRange()
    const [first, second] = Array.from(root.querySelectorAll('p'))
    range.setStart(first.firstChild!, 8)
    range.setEnd(second.firstChild!, 8)

    paintHighlights(root, [{ id: 'a', color: '#e8c468', range }])

    const marks = root.querySelectorAll('mark[data-quire-highlight="a"]')
    expect(marks).toHaveLength(2)
    expect([...marks].map((m) => m.textContent).join('')).toBe('vez um começo.E depois')
  })

  it('a limpeza devolve o conteúdo exatamente como estava', () => {
    const antes = root.innerHTML

    const clear = paintHighlights(root, [
      { id: 'a', color: '#e8c468', range: rangeFor('um começo') },
      { id: 'b', color: '#8ab4e8', range: rangeFor('um fim') },
    ])
    clear()

    expect(root.innerHTML).toBe(antes)
  })

  it('pinta vários destaques de uma vez sem se atrapalhar', () => {
    paintHighlights(root, [
      { id: 'a', color: '#e8c468', range: rangeFor('Era uma') },
      { id: 'b', color: '#8ab4e8', range: rangeFor('um fim') },
    ])

    expect(root.querySelectorAll('mark')).toHaveLength(2)
  })

  it('ignora entradas sem trecho para pintar', () => {
    const clear = paintHighlights(root, [])
    expect(root.querySelectorAll('mark')).toHaveLength(0)
    expect(() => clear()).not.toThrow()
  })
})
