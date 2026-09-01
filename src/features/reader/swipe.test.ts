import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachSwipe } from './swipe'

function touchEvent(
  type: string,
  x: number,
  y: number,
  list: 'touches' | 'changedTouches',
): TouchEvent {
  const event = new Event(type, { bubbles: true })
  const outra = list === 'touches' ? 'changedTouches' : 'touches'
  Object.defineProperty(event, list, { value: [{ clientX: x, clientY: y }] })
  Object.defineProperty(event, outra, { value: [] })
  return event as TouchEvent
}

const deslizar = (de: number, para: number, y = 200, yFim = y) => {
  document.dispatchEvent(touchEvent('touchstart', de, y, 'touches'))
  document.dispatchEvent(touchEvent('touchend', para, yFim, 'changedTouches'))
}

const espia = () => vi.fn(() => {})

describe('attachSwipe', () => {
  let onNext: ReturnType<typeof espia>
  let onPrev: ReturnType<typeof espia>
  let soltar: () => void

  beforeEach(() => {
    onNext = espia()
    onPrev = espia()
    document.getSelection()?.removeAllRanges()
    soltar = attachSwipe(document, { onNext, onPrev, threshold: 60 })
  })

  it('deslizar para a esquerda avança', () => {
    deslizar(300, 100)
    expect(onNext).toHaveBeenCalledTimes(1)
    soltar()
  })

  it('deslizar para a direita volta', () => {
    deslizar(100, 300)
    expect(onPrev).toHaveBeenCalledTimes(1)
    soltar()
  })

  it('gesto curto demais não vira página', () => {
    deslizar(200, 170)
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
    soltar()
  })

  it('gesto vertical é ignorado — é assim que se rola o PDF ampliado', () => {
    deslizar(200, 140, 100, 500)
    expect(onNext).not.toHaveBeenCalled()
    soltar()
  })

  it('não vira página enquanto há texto selecionado', () => {
    const p = document.createElement('p')
    p.textContent = 'um trecho qualquer'
    document.body.append(p)
    const range = document.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.firstChild!, 8)
    document.getSelection()!.addRange(range)

    deslizar(300, 100)

    expect(onNext).not.toHaveBeenCalled()
    document.getSelection()!.removeAllRanges()
    document.body.innerHTML = ''
    soltar()
  })

  it('soltar o ouvinte encerra os gestos', () => {
    soltar()
    deslizar(300, 100)
    expect(onNext).not.toHaveBeenCalled()
  })
})
