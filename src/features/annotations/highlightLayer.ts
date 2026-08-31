export interface PaintItem {
  id: string
  color: string
  range: Range
}

/**
 * Pinta os destaques sobre o texto do capítulo e devolve a função que desfaz.
 *
 * O caminho preferido é a CSS Custom Highlight API, que desenha sem tocar no
 * DOM. Onde ela não existe, a alternativa é envolver os trechos em <mark> — e
 * aí a limpeza importa muito: enquanto as marcas estão no ar, os caminhos das
 * âncoras mudam, então quem for criar uma anotação nova precisa limpar antes,
 * calcular, e mandar pintar de novo.
 */
export function paintHighlights(root: Element, items: PaintItem[]): () => void {
  const doc = root.ownerDocument
  if (!doc) return () => {}

  const highlights = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights
  if (highlights && typeof Highlight !== 'undefined') {
    return paintWithHighlightApi(root, items, highlights)
  }
  return paintWithMarks(doc, items)
}

function paintWithHighlightApi(
  root: Element,
  items: PaintItem[],
  registry: Map<string, unknown>,
): () => void {
  const byColor = new Map<string, Range[]>()
  for (const item of items) {
    const list = byColor.get(item.color) ?? []
    list.push(item.range)
    byColor.set(item.color, list)
  }

  const names: string[] = []
  const style = root.ownerDocument!.createElement('style')
  const rules: string[] = []

  let index = 0
  for (const [color, ranges] of byColor) {
    const name = `quire-hl-${index++}`
    registry.set(name, new Highlight(...ranges))
    names.push(name)
    rules.push(`::highlight(${name}) { background-color: ${withAlpha(color)}; }`)
  }

  style.textContent = rules.join('\n')
  ;(root.ownerDocument!.head ?? root).append(style)

  return () => {
    for (const name of names) registry.delete(name)
    style.remove()
  }
}

function paintWithMarks(doc: Document, items: PaintItem[]): () => void {
  const marks: HTMLElement[] = []

  for (const item of items) {
    for (const piece of splitRange(item.range)) {
      const mark = doc.createElement('mark')
      mark.dataset.quireHighlight = item.id
      mark.dataset.quireColor = item.color
      mark.style.backgroundColor = withAlpha(item.color)
      mark.style.color = 'inherit'
      try {
        piece.surroundContents(mark)
        marks.push(mark)
      } catch {
        /* trecho impossível de envolver: melhor não pintar do que corromper o texto */
      }
    }
  }

  return () => {
    for (const mark of marks) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
      // Junta de volta os nós de texto partidos pela pintura.
      ;(parent as Element).normalize?.()
    }
    marks.length = 0
  }
}

/**
 * Quebra o intervalo em pedaços que cabem dentro de um nó de texto cada — é o
 * que permite envolver uma seleção que atravessa parágrafos.
 */
function splitRange(range: Range): Range[] {
  const doc = range.startContainer.ownerDocument
  if (!doc || range.collapsed) return []

  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode!
      : range.commonAncestorContainer

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const pieces: Range[] = []
  let node: Node | null

  while ((node = walker.nextNode())) {
    const text = node as Text
    if (!range.intersectsNode(text)) continue

    const start = text === range.startContainer ? range.startOffset : 0
    const end = text === range.endContainer ? range.endOffset : text.length
    if (end <= start) continue

    const piece = doc.createRange()
    piece.setStart(text, start)
    piece.setEnd(text, end)
    pieces.push(piece)
  }

  return pieces
}

function withAlpha(color: string): string {
  if (!color.startsWith('#') || color.length !== 7) return color
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, 0.38)`
}
