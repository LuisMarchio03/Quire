import { describe, expect, it } from 'vitest'
import { findContentBox } from './contentBox'

const W = 100
const H = 140

/** Monta uma página com fundo claro e um bloco escuro onde o texto estaria. */
function page(
  ink: { x0: number; y0: number; x1: number; y1: number } | null,
  background = 255,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(W * H * 4).fill(background)
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
  if (ink) {
    for (let y = ink.y0; y <= ink.y1; y++) {
      for (let x = ink.x0; x <= ink.x1; x++) {
        const i = (y * W + x) * 4
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 10
      }
    }
  }
  return pixels
}

describe('findContentBox', () => {
  it('acha o bloco de texto e ignora as margens', () => {
    const box = findContentBox(page({ x0: 20, y0: 28, x1: 79, y1: 111 }), W, H)

    expect(box).not.toBeNull()
    expect(box!.x).toBeCloseTo(0.19, 1)
    expect(box!.w).toBeCloseTo(0.62, 1)
    expect(box!.y).toBeCloseTo(0.19, 1)
    expect(box!.h).toBeCloseTo(0.62, 1)
  })

  it('não corta página em branco', () => {
    expect(findContentBox(page(null), W, H)).toBeNull()
  })

  it('não corta quando o conteúdo já ocupa a página toda', () => {
    expect(findContentBox(page({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 }), W, H)).toBeNull()
  })

  it('desiste quando a caixa sai estreita demais para ser texto', () => {
    expect(findContentBox(page({ x0: 48, y0: 60, x1: 51, y1: 64 }), W, H)).toBeNull()
  })

  it('funciona com papel amarelado de digitalização', () => {
    const box = findContentBox(page({ x0: 15, y0: 20, x1: 84, y1: 119 }, 232), W, H)
    expect(box).not.toBeNull()
    expect(box!.w).toBeCloseTo(0.72, 1)
  })

  it('funciona com a página já invertida para leitura noturna', () => {
    const pixels = new Uint8ClampedArray(W * H * 4).fill(12)
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
    for (let y = 30; y <= 110; y++) {
      for (let x = 25; x <= 74; x++) {
        const i = (y * W + x) * 4
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 240
      }
    }

    const box = findContentBox(pixels, W, H)
    expect(box).not.toBeNull()
    expect(box!.w).toBeCloseTo(0.52, 1)
  })

  it('ignora sujeira isolada na borda', () => {
    const pixels = page({ x0: 30, y0: 40, x1: 69, y1: 99 })
    // Um respingo de dois pixels na margem esquerda não pode alargar a caixa.
    for (const [x, y] of [[2, 70], [3, 70]] as const) {
      const i = (y * W + x) * 4
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
    }

    const box = findContentBox(pixels, W, H)
    expect(box!.x).toBeGreaterThan(0.2)
  })

  it('recusa entrada incoerente sem lançar', () => {
    expect(findContentBox(new Uint8ClampedArray(8), 100, 100)).toBeNull()
    expect(findContentBox(new Uint8ClampedArray(0), 0, 0)).toBeNull()
  })
})
