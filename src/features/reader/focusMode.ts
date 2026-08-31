const STYLE_ID = 'quire-focus-style'
const INDEX_ATTR = 'data-quire-focus-index'
const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, dd, dt'

export interface FocusOptions {
  enabled: boolean
  ruler: boolean
  /** Opacidade do que está fora do bloco em leitura. */
  dimOpacity: number
}

/**
 * Modo foco: escurece tudo menos o bloco que está sendo lido.
 *
 * A marcação é feita com atributos de dado mais uma folha injetada, e nunca com
 * estilo em linha — o conteúdo do livro sai daqui exatamente como entrou, e
 * desligar o modo não deixa resíduo no DOM do capítulo.
 */
export function applyFocusMode(root: Element, options: FocusOptions): void {
  if (!options.enabled) {
    clearFocusMode(root)
    return
  }

  const blocks = textBlocks(root)
  if (blocks.length === 0) {
    clearFocusMode(root)
    return
  }

  installStyle(root, options.dimOpacity)

  const current = Math.min(readIndex(root), blocks.length - 1)
  root.setAttribute(INDEX_ATTR, String(current))
  paint(blocks, current)
  setRuler(root, options.ruler)
}

export function focusedBlock(root: Element): Element | null {
  return root.querySelector('[data-quire-focus="on"]')
}

export function focusNext(root: Element): void {
  step(root, 1)
}

export function focusPrev(root: Element): void {
  step(root, -1)
}

export function clearFocusMode(root: Element): void {
  for (const marked of Array.from(root.querySelectorAll('[data-quire-focus]'))) {
    marked.removeAttribute('data-quire-focus')
  }
  root.removeAttribute(INDEX_ATTR)
  setRuler(root, false)
  root.ownerDocument?.getElementById(STYLE_ID)?.remove()
}

function textBlocks(root: Element): Element[] {
  return Array.from(root.querySelectorAll(BLOCK_SELECTOR)).filter(
    (element) => (element.textContent ?? '').trim().length > 0,
  )
}

function readIndex(root: Element): number {
  const raw = Number(root.getAttribute(INDEX_ATTR))
  return Number.isInteger(raw) && raw >= 0 ? raw : 0
}

function paint(blocks: Element[], current: number): void {
  blocks.forEach((block, index) => {
    block.setAttribute('data-quire-focus', index === current ? 'on' : 'dim')
  })
}

function step(root: Element, delta: number): void {
  const blocks = textBlocks(root)
  if (blocks.length === 0) return
  const next = Math.min(Math.max(readIndex(root) + delta, 0), blocks.length - 1)
  root.setAttribute(INDEX_ATTR, String(next))
  paint(blocks, next)
}

function setRuler(root: Element, enabled: boolean): void {
  if (enabled) root.setAttribute('data-quire-ruler', '')
  else root.removeAttribute('data-quire-ruler')
}

function installStyle(root: Element, dimOpacity: number): void {
  const doc = root.ownerDocument
  if (!doc) return

  const css = `
[data-quire-focus] { transition: opacity 150ms ease; }
[data-quire-focus="dim"] { opacity: ${dimOpacity}; }
[data-quire-focus="on"] { opacity: 1; }
/* A régua é a linha sob o bloco em leitura. Como sublinhado ela acompanha a
   repaginação sozinha — um elemento posicionado teria de ser remedido a cada
   troca de fonte, de tela e de coluna. */
[data-quire-ruler] [data-quire-focus="on"] {
  box-shadow: 0 2px 0 -1px currentColor;
}`

  const existing = doc.getElementById(STYLE_ID)
  if (existing) {
    existing.textContent = css
    return
  }
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  ;(doc.head ?? doc.documentElement)?.append(style)
}
