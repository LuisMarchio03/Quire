const MAX_SIDE = 400
const QUALITY = 0.78

/**
 * Miniatura da capa em webp, guardada como data URL.
 *
 * A capa é o único pedaço visual do livro que sincroniza: no celular a estante
 * mostra a capa e as anotações mesmo quando o arquivo ficou no computador.
 * Por isso precisa ser pequena — algo em torno de 40 KB.
 */
export async function makeCoverThumbnail(source: Blob | HTMLCanvasElement): Promise<string | null> {
  try {
    const canvas =
      source instanceof HTMLCanvasElement ? source : await drawToCanvas(source)
    if (!canvas) return null

    const scale = Math.min(1, MAX_SIDE / Math.max(canvas.width, canvas.height))
    const target = document.createElement('canvas')
    target.width = Math.max(1, Math.round(canvas.width * scale))
    target.height = Math.max(1, Math.round(canvas.height * scale))

    const context = target.getContext('2d')
    if (!context) return null
    context.drawImage(canvas, 0, 0, target.width, target.height)

    const webp = target.toDataURL('image/webp', QUALITY)
    // Navegador sem webp devolve png silenciosamente; melhor um png do que capa nenhuma.
    return webp.startsWith('data:image/') ? webp : null
  } catch {
    return null
  }
}

async function drawToCanvas(blob: Blob): Promise<HTMLCanvasElement | null> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return canvas
}
