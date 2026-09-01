import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachPinch } from './pinch'

type Ponto = { clientX: number; clientY: number }

function toque(type: string, touches: Ponto[], changed: Ponto[] = []): TouchEvent {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'touches', { value: touches })
  Object.defineProperty(event, 'changedTouches', { value: changed })
  return event as TouchEvent
}

const par = (separacao: number): Ponto[] => [
  { clientX: 200 - separacao / 2, clientY: 300 },
  { clientX: 200 + separacao / 2, clientY: 300 },
]

const criarEspiaEscala = () => vi.fn((_relative: number) => {})
const criarEspiaVazio = () => vi.fn(() => {})

describe('attachPinch', () => {
  let onPreview: ReturnType<typeof criarEspiaEscala>
  let onCommit: ReturnType<typeof criarEspiaEscala>
  let onDoubleTap: ReturnType<typeof criarEspiaVazio>
  let soltar: () => void

  beforeEach(() => {
    onPreview = criarEspiaEscala()
    onCommit = criarEspiaEscala()
    onDoubleTap = criarEspiaVazio()
    soltar = attachPinch(document, { onPreview, onCommit, onDoubleTap })
  })

  it('afastar os dedos amplia', () => {
    document.dispatchEvent(toque('touchstart', par(100)))
    document.dispatchEvent(toque('touchmove', par(200)))

    expect(onPreview).toHaveBeenLastCalledWith(2)
    soltar()
  })

  it('aproximar os dedos reduz', () => {
    document.dispatchEvent(toque('touchstart', par(200)))
    document.dispatchEvent(toque('touchmove', par(100)))

    expect(onPreview).toHaveBeenLastCalledWith(0.5)
    soltar()
  })

  it('a escala final só é confirmada quando os dois dedos saem', () => {
    document.dispatchEvent(toque('touchstart', par(100)))
    document.dispatchEvent(toque('touchmove', par(250)))
    document.dispatchEvent(toque('touchend', par(1), par(250)))

    expect(onCommit).not.toHaveBeenCalled()

    document.dispatchEvent(toque('touchend', [], par(250)))
    expect(onCommit).toHaveBeenCalledWith(2.5)
    soltar()
  })

  it('um dedo só não amplia nada', () => {
    document.dispatchEvent(toque('touchstart', [{ clientX: 100, clientY: 100 }]))
    document.dispatchEvent(toque('touchmove', [{ clientX: 300, clientY: 100 }]))

    expect(onPreview).not.toHaveBeenCalled()
    soltar()
  })

  it('duplo toque no mesmo ponto alterna a ampliação', () => {
    const ponto = [{ clientX: 150, clientY: 400 }]
    document.dispatchEvent(toque('touchstart', ponto))
    document.dispatchEvent(toque('touchstart', ponto))

    expect(onDoubleTap).toHaveBeenCalledTimes(1)
    soltar()
  })

  it('dois toques longe um do outro não são duplo toque', () => {
    document.dispatchEvent(toque('touchstart', [{ clientX: 40, clientY: 100 }]))
    document.dispatchEvent(toque('touchstart', [{ clientX: 320, clientY: 700 }]))

    expect(onDoubleTap).not.toHaveBeenCalled()
    soltar()
  })

  it('dois toques distantes no tempo não são duplo toque', () => {
    vi.useFakeTimers()
    const ponto = [{ clientX: 150, clientY: 400 }]
    document.dispatchEvent(toque('touchstart', ponto))
    vi.advanceTimersByTime(800)
    vi.setSystemTime(Date.now() + 800)
    document.dispatchEvent(toque('touchstart', ponto))

    expect(onDoubleTap).not.toHaveBeenCalled()
    vi.useRealTimers()
    soltar()
  })

  it('soltar encerra os gestos', () => {
    soltar()
    document.dispatchEvent(toque('touchstart', par(100)))
    document.dispatchEvent(toque('touchmove', par(200)))

    expect(onPreview).not.toHaveBeenCalled()
  })
})
