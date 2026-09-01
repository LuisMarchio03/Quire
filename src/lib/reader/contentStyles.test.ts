import { describe, expect, it } from 'vitest'
import { buildContentCss, PALETTES } from './contentStyles'
import { DEFAULT_THEME } from './types'

/** Luminância relativa, conforme a WCAG. */
function luminancia(cor: string): number {
  const canal = (inicio: number) => {
    const v = Number.parseInt(cor.slice(inicio, inicio + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('paletas de leitura', () => {
  /**
   * A faixa não é capricho: abaixo de 7 o olho força para separar letra do
   * fundo; acima de 12, em tema escuro, a letra clara espalha sobre o fundo
   * escuro e embaça a linha. Papel impresso bom fica perto de 10.
   */
  it.each(Object.entries(PALETTES))(
    'a paleta %s fica na faixa confortável de leitura longa',
    (_nome, palette) => {
      const razao = contraste(palette.bg, palette.fg)
      expect(razao).toBeGreaterThanOrEqual(7)
      expect(razao).toBeLessThanOrEqual(12.5)
    },
  )

  it.each(Object.entries(PALETTES))(
    'o tom secundário da paleta %s continua legível',
    (_nome, palette) => {
      expect(contraste(palette.bg, palette.muted)).toBeGreaterThanOrEqual(3.5)
    },
  )

  it('nenhuma paleta usa preto ou branco puro contra o texto', () => {
    for (const [nome, palette] of Object.entries(PALETTES)) {
      if (nome === 'oled') continue // o preto puro é o motivo de existir dessa
      expect(palette.bg).not.toBe('#000000')
      expect(palette.fg).not.toBe('#ffffff')
    }
  })

  it('a folha injetada leva a cor de fundo da paleta escolhida', () => {
    const css = buildContentCss({ ...DEFAULT_THEME, palette: 'sepia' }, { width: 800, height: 1000 })
    expect(css).toContain(PALETTES.sepia.bg)
    expect(css).toContain(PALETTES.sepia.fg)
  })
})
