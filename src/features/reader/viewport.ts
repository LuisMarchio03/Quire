import type { SafeInsets } from '../../lib/reader/types'

/**
 * Avisa quando a área de leitura muda de tamanho.
 *
 * No celular isso é constante, e por três motivos diferentes: a barra de
 * endereço encolhe ao rolar, o aparelho gira, o teclado abre. Cada um deles
 * muda a altura ou a largura útil — e o leitor precisa refazer as colunas, ou a
 * paginação passa a mentir.
 *
 * O atraso existe porque a barra de endereço anima: sem ele, o layout seria
 * refeito dezenas de vezes durante um único gesto de rolagem.
 */
export function observeViewport(
  target: Element,
  onChange: () => void,
  { debounceMs = 150 }: { debounceMs?: number } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, debounceMs)
  }

  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
  observer?.observe(target)

  const viewport = globalThis.visualViewport
  viewport?.addEventListener('resize', schedule)
  globalThis.addEventListener?.('orientationchange', schedule)
  // Fallback para navegador sem ResizeObserver nem visualViewport.
  if (!observer && !viewport) globalThis.addEventListener?.('resize', schedule)

  return () => {
    if (timer) clearTimeout(timer)
    observer?.disconnect()
    viewport?.removeEventListener('resize', schedule)
    globalThis.removeEventListener?.('orientationchange', schedule)
    globalThis.removeEventListener?.('resize', schedule)
  }
}

/**
 * Faixas da tela que o conteúdo não pode ocupar — notch, barra de gestos.
 *
 * O valor vem do CSS (`env(safe-area-inset-*)`) porque só o navegador conhece o
 * recorte do aparelho. O elemento sonda carrega essas variáveis para que aqui se
 * leia um número.
 */
export function readSafeInsets(element: Element | null): SafeInsets {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!element || typeof getComputedStyle !== 'function') return zero

  const style = getComputedStyle(element)
  const read = (property: string) => {
    const value = Number.parseFloat(style.getPropertyValue(property))
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  return {
    top: read('--quire-safe-top'),
    right: read('--quire-safe-right'),
    bottom: read('--quire-safe-bottom'),
    left: read('--quire-safe-left'),
  }
}
