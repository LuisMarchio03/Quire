export interface SwipeHandlers {
  onNext: () => void
  onPrev: () => void
  /** Distância mínima, em px, para o gesto contar como virada de página. */
  threshold?: number
}

/**
 * Deslizar para virar página.
 *
 * É o gesto que todo mundo espera num leitor de celular, e sem ele só restam as
 * zonas de toque. Um gesto vertical é ignorado de propósito — no PDF ampliado é
 * assim que se rola a página — e uma seleção de texto em curso também cancela,
 * para arrastar a alça da seleção não virar página.
 */
export function attachSwipe(doc: Document, handlers: SwipeHandlers): () => void {
  const { onNext, onPrev, threshold = 60 } = handlers
  let startX = 0
  let startY = 0
  let tracking = false

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      tracking = false
      return
    }
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
    tracking = true
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!tracking) return
    tracking = false

    const touch = event.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return
    if (!doc.getSelection()?.isCollapsed) return

    if (dx < 0) onNext()
    else onPrev()
  }

  const cancel = () => {
    tracking = false
  }

  doc.addEventListener('touchstart', onTouchStart, { passive: true })
  doc.addEventListener('touchend', onTouchEnd, { passive: true })
  doc.addEventListener('touchcancel', cancel, { passive: true })

  return () => {
    doc.removeEventListener('touchstart', onTouchStart)
    doc.removeEventListener('touchend', onTouchEnd)
    doc.removeEventListener('touchcancel', cancel)
  }
}
