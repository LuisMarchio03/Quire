import latinNormal from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import latinItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import latinExtNormal from '@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2?url'
import latinExtItalic from '@fontsource-variable/literata/files/literata-latin-ext-wght-italic.woff2?url'

/**
 * A serifa de leitura, embutida no app. Só os subconjuntos latinos: é o que
 * português, espanhol, inglês e francês usam, e cabe em ~190 KB. Quem lê em
 * cirílico ou grego cai na serifa do aparelho, como antes.
 *
 * A declaração vive aqui, em texto, porque precisa entrar em dois documentos:
 * o do app e o `iframe` do EPUB, que não enxerga as fontes do pai.
 */
export const READER_FONT_FAMILY = 'Literata Variable'

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,' +
  'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,' +
  'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

function face(url: string, style: 'normal' | 'italic', range: string): string {
  return `@font-face {
  font-family: '${READER_FONT_FAMILY}';
  font-style: ${style};
  font-weight: 200 900;
  font-display: swap;
  src: url(${url}) format('woff2-variations');
  unicode-range: ${range};
}`
}

export const READER_FONT_FACES = [
  face(latinNormal, 'normal', LATIN),
  face(latinItalic, 'italic', LATIN),
  face(latinExtNormal, 'normal', LATIN_EXT),
  face(latinExtItalic, 'italic', LATIN_EXT),
].join('\n')

/** Pilha da serifa: a embutida primeiro, depois o que o aparelho tiver. */
export const SERIF_STACK = `'${READER_FONT_FAMILY}', 'Literata', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif`

/** Instala a fonte no documento do app. Idempotente. */
export function installReaderFonts(doc: Document = document): void {
  if (doc.getElementById('quire-fonts')) return
  const style = doc.createElement('style')
  style.id = 'quire-fonts'
  style.textContent = READER_FONT_FACES
  doc.head.append(style)
}
