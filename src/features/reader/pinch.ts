export interface PinchHandlers {
  /** Escala relativa durante o gesto, para dar retorno imediato na tela. */
  onPreview: (relative: number) => void
  /** Escala final, quando os dedos saem — é aqui que vale redesenhar. */
  onCommit: (relative: number) => void
  /** Duplo toque: alterna entre encaixado e ampliado. */
  onDoubleTap?: () => void
}

const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 40

/**
 * Pinça para ampliar e duplo toque para alternar.
 *
 * A página de um PDF tem largura fixa; numa tela de celular, ampliar não é
 * luxo, é o que torna a letra legível. E como o app trava o zoom do navegador
 * para a interface não escorregar, esse gesto precisa existir aqui dentro.
 *
 * Durante o gesto só se avisa a escala relativa: redesenhar um PDF a cada
 * milímetro de dedo trava o aparelho. O desenho de verdade acontece no fim.
 */
export function attachPinch(doc: Document, handlers: PinchHandlers): () => void {
  const { onPreview, onCommit, onDoubleTap } = handlers
  let startDistance = 0
  let pinching = false
  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0

  const distance = (touches: TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    )

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      startDistance = distance(event.touches)
      pinching = startDistance > 0
      return
    }

    if (event.touches.length === 1 && onDoubleTap) {
      const touch = event.touches[0]
      const now = Date.now()
      const perto =
        Math.abs(touch.clientX - lastTapX) < DOUBLE_TAP_SLOP &&
        Math.abs(touch.clientY - lastTapY) < DOUBLE_TAP_SLOP
      if (now - lastTapAt < DOUBLE_TAP_MS && perto) {
        lastTapAt = 0
        onDoubleTap()
        return
      }
      lastTapAt = now
      lastTapX = touch.clientX
      lastTapY = touch.clientY
    }
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!pinching || event.touches.length !== 2) return
    const current = distance(event.touches)
    if (current > 0) onPreview(current / startDistance)
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!pinching) return
    // Só encerra quando o segundo dedo sai; um dedo levantado ainda é o gesto.
    if (event.touches.length > 0) return
    pinching = false
    const final = event.changedTouches.length === 2 ? distance(event.changedTouches) : 0
    onCommit(final > 0 ? final / startDistance : 1)
  }

  doc.addEventListener('touchstart', onTouchStart, { passive: true })
  doc.addEventListener('touchmove', onTouchMove, { passive: true })
  doc.addEventListener('touchend', onTouchEnd, { passive: true })

  return () => {
    doc.removeEventListener('touchstart', onTouchStart)
    doc.removeEventListener('touchmove', onTouchMove)
    doc.removeEventListener('touchend', onTouchEnd)
  }
}
