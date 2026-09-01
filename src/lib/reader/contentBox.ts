/** Caixa normalizada (0..1) dentro da página. */
export interface ContentBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ContentBoxOptions {
  /** Quanto um pixel precisa fugir do fundo para contar como tinta. */
  threshold?: number
  /**
   * Fração mínima de pixels com tinta para a linha ou coluna contar. Precisa
   * ser alta o bastante para que respingo de digitalização não alargue a
   * caixa até a margem.
   */
  minInkRatio?: number
  /** Folga acrescentada em volta, em fração da página. */
  padding?: number
}

/**
 * Onde está o texto dentro da página de um PDF.
 *
 * Página de PDF tem margem generosa, pensada para papel. Num celular, encaixar
 * a folha inteira na largura da tela é o que faz a letra ficar minúscula.
 * Descobrindo a caixa do conteúdo, dá para encaixar só ela — o texto cresce sem
 * que ninguém precise ampliar e arrastar a cada página.
 *
 * Devolve `null` quando não vale a pena cortar: página em branco, ou conteúdo
 * que já ocupa quase tudo. Também desiste quando a caixa sai pequena demais,
 * porque aí o mais provável é ser sujeira de digitalização, não o texto.
 */
export function findContentBox(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ContentBoxOptions = {},
): ContentBox | null {
  const { threshold = 24, minInkRatio = 0.02, padding = 0.012 } = options
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return null

  // O fundo é a mediana dos quatro cantos: serve tanto para papel branco quanto
  // para digitalização amarelada ou página já invertida para leitura noturna.
  const corners = [
    luminance(pixels, 0),
    luminance(pixels, (width - 1) * 4),
    luminance(pixels, (height - 1) * width * 4),
    luminance(pixels, ((height - 1) * width + width - 1) * 4),
  ].sort((a, b) => a - b)
  const background = (corners[1] + corners[2]) / 2

  const rowInk = new Uint32Array(height)
  const columnInk = new Uint32Array(width)

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      if (Math.abs(luminance(pixels, rowStart + x * 4) - background) > threshold) {
        rowInk[y]++
        columnInk[x]++
      }
    }
  }

  const top = firstAbove(rowInk, width * minInkRatio)
  const bottom = lastAbove(rowInk, width * minInkRatio)
  const left = firstAbove(columnInk, height * minInkRatio)
  const right = lastAbove(columnInk, height * minInkRatio)
  if (top === -1 || left === -1) return null

  const box = {
    x: Math.max(0, left / width - padding),
    y: Math.max(0, top / height - padding),
    w: Math.min(1, (right - left + 1) / width + padding * 2),
    h: Math.min(1, (bottom - top + 1) / height + padding * 2),
  }
  box.w = Math.min(box.w, 1 - box.x)
  box.h = Math.min(box.h, 1 - box.y)

  // Cortar 4% não muda nada e custa uma reconstrução; e caixa estreita demais
  // costuma ser mancha de digitalização, não coluna de texto.
  if (box.w > 0.96 && box.h > 0.96) return null
  if (box.w < 0.35 || box.h < 0.2) return null

  return box
}

function luminance(pixels: Uint8ClampedArray, index: number): number {
  return 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]
}

function firstAbove(counts: Uint32Array, minimum: number): number {
  for (let i = 0; i < counts.length; i++) if (counts[i] > minimum) return i
  return -1
}

function lastAbove(counts: Uint32Array, minimum: number): number {
  for (let i = counts.length - 1; i >= 0; i--) if (counts[i] > minimum) return i
  return -1
}
