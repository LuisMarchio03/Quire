import { beforeEach, describe, expect, it } from 'vitest'
import { applyFocusMode, clearFocusMode, focusNext, focusPrev, focusedBlock } from './focusMode'

let root: HTMLElement

const ON = '[data-quire-focus="on"]'
const DIM = '[data-quire-focus="dim"]'

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = `
    <h1>Título</h1>
    <p>Primeiro parágrafo.</p>
    <p>   </p>
    <p>Segundo parágrafo.</p>
    <blockquote>Uma citação.</blockquote>`
  document.body.append(root)
})

describe('modo foco', () => {
  it('destaca o primeiro bloco e escurece os demais', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })

    expect(root.querySelector(ON)?.textContent).toBe('Título')
    expect(root.querySelectorAll(DIM)).toHaveLength(3)
  })

  it('pula blocos vazios', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })
    focusNext(root)
    focusNext(root)

    expect(focusedBlock(root)?.textContent).toBe('Segundo parágrafo.')
  })

  it('focusNext anda para frente e para no último bloco', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })
    for (let i = 0; i < 10; i++) focusNext(root)

    expect(focusedBlock(root)?.textContent).toBe('Uma citação.')
  })

  it('focusPrev volta e para no primeiro bloco', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })
    focusNext(root)
    focusPrev(root)
    focusPrev(root)

    expect(focusedBlock(root)?.textContent).toBe('Título')
  })

  it('a régua só existe quando pedida', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })
    expect(root.hasAttribute('data-quire-ruler')).toBe(false)

    applyFocusMode(root, { enabled: true, ruler: true, dimOpacity: 0.25 })
    expect(root.hasAttribute('data-quire-ruler')).toBe(true)
    const css = root.ownerDocument.getElementById('quire-focus-style')!.textContent!
    expect(css).toContain('[data-quire-ruler] [data-quire-focus="on"]')
  })

  it('desligar não deixa atributo, régua nem estilo para trás', () => {
    applyFocusMode(root, { enabled: true, ruler: true, dimOpacity: 0.25 })

    applyFocusMode(root, { enabled: false, ruler: true, dimOpacity: 0.25 })

    expect(root.querySelectorAll('[data-quire-focus]')).toHaveLength(0)
    expect(root.hasAttribute('data-quire-ruler')).toBe(false)
    expect(root.ownerDocument.getElementById('quire-focus-style')).toBeNull()
    expect(root.hasAttribute('data-quire-focus-index')).toBe(false)
  })

  it('clearFocusMode devolve o conteúdo ao estado original', () => {
    const antes = root.innerHTML
    applyFocusMode(root, { enabled: true, ruler: true, dimOpacity: 0.25 })
    clearFocusMode(root)

    expect(root.innerHTML).toBe(antes)
  })

  it('a opacidade pedida vai para a folha de estilo injetada', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.15 })

    const style = root.ownerDocument.getElementById('quire-focus-style')
    expect(style?.textContent).toContain('opacity: 0.15')
  })

  it('reaplicar mantém o bloco em que a leitura estava', () => {
    applyFocusMode(root, { enabled: true, ruler: false, dimOpacity: 0.25 })
    focusNext(root)

    applyFocusMode(root, { enabled: true, ruler: true, dimOpacity: 0.3 })

    expect(focusedBlock(root)?.textContent).toBe('Primeiro parágrafo.')
  })

  it('não faz nada quando o conteúdo não tem blocos de texto', () => {
    const vazio = document.createElement('div')
    document.body.append(vazio)

    expect(() => applyFocusMode(vazio, { enabled: true, ruler: true, dimOpacity: 0.2 })).not.toThrow()
    expect(focusedBlock(vazio)).toBeNull()
  })
})
