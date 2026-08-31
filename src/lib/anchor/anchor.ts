import type { Anchor } from '../types'

/**
 * Onde um destaque mora dentro do capítulo.
 *
 * O caminho é a sequência de índices de filho da raiz do conteúdo até o nó —
 * nenhum pixel entra na conta. Assim a anotação sobrevive a trocar a fonte,
 * aumentar o corpo do texto, girar o celular ou repaginar o capítulo inteiro.
 * O que ela não sobrevive é a uma edição diferente do livro: para esse caso
 * existe a reancoragem pelo texto citado.
 */

function pathTo(node: Node, root: Element): number[] | null {
  const path: number[] = []
  let current: Node | null = node

  while (current && current !== root) {
    const parent: Node | null = current.parentNode
    if (!parent) return null
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current))
    current = parent
  }

  return current === root ? path : null
}

function nodeAt(root: Element, path: number[]): Node | null {
  let current: Node = root
  for (const index of path) {
    const next: Node | undefined = current.childNodes[index]
    if (!next) return null
    current = next
  }
  return current
}

export function rangeToAnchor(range: Range, root: Element, spineIndex: number): Anchor {
  const startPath = pathTo(range.startContainer, root)
  const endPath = pathTo(range.endContainer, root)
  if (!startPath || !endPath) {
    throw new Error('a seleção está fora do conteúdo do capítulo')
  }
  return {
    kind: 'epub',
    spineIndex,
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
  }
}

export function anchorToRange(anchor: Anchor, root: Element): Range | null {
  if (anchor.kind !== 'epub') return null

  const start = nodeAt(root, anchor.startPath)
  const end = nodeAt(root, anchor.endPath)
  if (!start || !end) return null

  const maxOffset = (node: Node) =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length
  if (anchor.startOffset > maxOffset(start) || anchor.endOffset > maxOffset(end)) return null

  try {
    const range = document.createRange()
    range.setStart(start, anchor.startOffset)
    range.setEnd(end, anchor.endOffset)
    return range.collapsed && anchor.startOffset !== anchor.endOffset ? null : range
  } catch {
    return null
  }
}

interface TextPiece {
  node: Text
  start: number
}

/** Concatena o texto do capítulo guardando onde cada nó começa. */
function flattenText(root: Element): { text: string; pieces: TextPiece[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const pieces: TextPiece[] = []
  let text = ''
  let node: Node | null

  while ((node = walker.nextNode())) {
    const textNode = node as Text
    pieces.push({ node: textNode, start: text.length })
    text += textNode.data
  }

  return { text, pieces }
}

function locate(pieces: TextPiece[], offset: number): { node: Text; offset: number } | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i]
    if (offset >= piece.start) return { node: piece.node, offset: offset - piece.start }
  }
  return null
}

/**
 * Procura o texto citado no capítulo e devolve uma âncora nova. É o plano B
 * quando o caminho envelheceu — e é o que impede um destaque de sumir só
 * porque o livro ganhou um parágrafo antes dele.
 */
export function reanchorByText(quoted: string, root: Element, spineIndex: number): Anchor | null {
  if (!quoted) return null

  const { text, pieces } = flattenText(root)
  const index = text.indexOf(quoted)
  if (index === -1) return null

  const start = locate(pieces, index)
  const end = locate(pieces, index + quoted.length)
  if (!start || !end) return null

  const startPath = pathTo(start.node, root)
  const endPath = pathTo(end.node, root)
  if (!startPath || !endPath) return null

  return {
    kind: 'epub',
    spineIndex,
    startPath,
    startOffset: start.offset,
    endPath,
    endOffset: end.offset,
  }
}

/**
 * Posição da seleção em caracteres, contando o texto do capítulo do começo.
 *
 * Serve para um caso específico e importante: quando os destaques já estão
 * pintados, o texto continua idêntico mas a árvore de nós mudou. O
 * deslocamento em caracteres atravessa essa diferença — mede-se com as marcas
 * no ar e resolve-se depois de limpá-las.
 */
export function selectionOffsets(range: Range, root: Element): { start: number; end: number } | null {
  const { pieces } = flattenText(root)

  const offsetOf = (node: Node, offset: number): number | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const piece = pieces.find((p) => p.node === node)
      return piece ? piece.start + offset : null
    }
    // Contêiner de elemento: o limite é o começo do filho apontado.
    const child = node.childNodes[offset]
    if (child) {
      const piece = pieces.find((p) => p.node === child || child.contains(p.node))
      if (piece) return piece.start
    }
    const last = [...pieces].reverse().find((p) => node.contains(p.node))
    return last ? last.start + last.node.data.length : null
  }

  const start = offsetOf(range.startContainer, range.startOffset)
  const end = offsetOf(range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null
  return { start, end }
}

/** O caminho de volta: deslocamento em caracteres vira âncora de nó e offset. */
export function anchorFromOffsets(
  root: Element,
  start: number,
  end: number,
  spineIndex: number,
): Anchor | null {
  const { pieces } = flattenText(root)
  const from = locate(pieces, start)
  const to = locate(pieces, end)
  if (!from || !to) return null

  const startPath = pathTo(from.node, root)
  const endPath = pathTo(to.node, root)
  if (!startPath || !endPath) return null

  return {
    kind: 'epub',
    spineIndex,
    startPath,
    startOffset: from.offset,
    endPath,
    endOffset: to.offset,
  }
}

export interface ResolvedAnchor {
  range: Range | null
  /** Verdadeiro quando nem o caminho nem o texto citado foram encontrados. */
  orphan: boolean
  /** A âncora em vigor — corrigida, se houve reancoragem. */
  anchor: Anchor
}

export function resolveAnchor(anchor: Anchor, quoted: string, root: Element): ResolvedAnchor {
  // No PDF a posição é fixa: os retângulos bastam, não há DOM a consultar.
  if (anchor.kind === 'pdf') return { range: null, orphan: false, anchor }

  const direct = anchorToRange(anchor, root)
  if (direct && direct.toString() === quoted) return { range: direct, orphan: false, anchor }

  const repaired = reanchorByText(quoted, root, anchor.spineIndex)
  if (repaired) {
    const range = anchorToRange(repaired, root)
    if (range) return { range, orphan: false, anchor: repaired }
  }

  // Sem texto citado não há como reancorar; o caminho sozinho ainda serve.
  if (direct && !quoted) return { range: direct, orphan: false, anchor }

  return { range: null, orphan: true, anchor }
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Âncora de PDF a partir dos retângulos da seleção.
 *
 * As coordenadas são normalizadas pela caixa da página: o mesmo destaque vale
 * em qualquer zoom e em qualquer tela, porque o layout do PDF é fixo e só a
 * escala muda.
 */
export function rectsToPdfAnchor(rects: Box[], box: Box, page: number): Anchor {
  const width = box.width || 1
  const height = box.height || 1
  return {
    kind: 'pdf',
    page,
    rects: rects
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: (rect.x - box.x) / width,
        y: (rect.y - box.y) / height,
        w: rect.width / width,
        h: rect.height / height,
      })),
  }
}
