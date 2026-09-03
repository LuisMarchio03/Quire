import { describe, expect, it } from 'vitest'
import { installReaderFonts, READER_FONT_FACES } from './fonts'

describe('fontes de leitura', () => {
  it('declara normal e itálico, nos subconjuntos latinos', () => {
    expect(READER_FONT_FACES.match(/@font-face/g)).toHaveLength(4)
    expect(READER_FONT_FACES).toContain('font-style: italic')
    expect(READER_FONT_FACES).toContain('U+0000-00FF')
    expect(READER_FONT_FACES).toContain('U+0100-02BA')
    expect(READER_FONT_FACES).toMatch(/src: url\(\S+\.woff2\)/)
  })

  it('instala uma vez só no documento do app', () => {
    installReaderFonts(document)
    installReaderFonts(document)
    expect(document.querySelectorAll('#quire-fonts')).toHaveLength(1)
  })
})
