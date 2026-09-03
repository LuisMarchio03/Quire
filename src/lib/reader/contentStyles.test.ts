import { describe, expect, it } from 'vitest'
import { buildContentCss, PALETTES, pdfPagePaint } from './contentStyles'
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

describe('pintura da página do PDF', () => {
  it('nas paletas escuras inverte a folha e a funde por screen: o branco vira exatamente o fundo', () => {
    for (const palette of ['dark', 'oled', 'gray'] as const) {
      const paint = pdfPagePaint(palette)
      expect(paint.filter).toContain('invert(1)')
      expect(paint.blend).toBe('screen')
      expect(paint.opacity).toBeGreaterThan(0.3)
      expect(paint.opacity).toBeLessThanOrEqual(1)
    }
  })

  it('nas paletas claras funde por multiply, sem inverter', () => {
    for (const palette of ['light', 'sepia'] as const) {
      const paint = pdfPagePaint(palette)
      expect(paint.filter).toBe('')
      expect(paint.blend).toBe('multiply')
      expect(paint.opacity).toBeGreaterThan(0.5)
      expect(paint.opacity).toBeLessThan(1)
    }
  })

  it('a opacidade leva a letra à luminância da tinta da paleta', () => {
    // No escuro: texto = α·1 + (1−α)·fundo; no claro: texto = (1−α)·fundo.
    const lum = (hex: string) => {
      const c = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
      return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5)
    }
    const dark = pdfPagePaint('dark')
    const bgDark = lum(PALETTES.dark.bg)
    expect(dark.opacity + (1 - dark.opacity) * bgDark).toBeCloseTo(lum(PALETTES.dark.fg), 1)

    const sepia = pdfPagePaint('sepia')
    expect((1 - sepia.opacity) * lum(PALETTES.sepia.bg)).toBeCloseTo(lum(PALETTES.sepia.fg), 1)
  })
})

describe('fonte de leitura embutida', () => {
  it('a folha do capítulo declara a Literata, porque o iframe não enxerga as fontes do app', () => {
    const css = buildContentCss(DEFAULT_THEME, { width: 800, height: 1000 })
    expect(css).toContain("@font-face")
    expect(css).toContain("font-family: 'Literata Variable'")
    expect(css).toMatch(/#quire-content \{[^}]*font-family: 'Literata Variable'/)
  })
})
