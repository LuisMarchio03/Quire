import { useCallback, useEffect, useState } from 'react'

const KEY = 'quire.uiScale'

export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 1.6
export const UI_SCALE_STEP = 0.1
/** Tamanho de fonte da raiz a que 100% corresponde. */
export const UI_SCALE_BASE_PX = 16

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  const bounded = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value))
  // Passos de 5% evitam meio pixel de diferença acumulada entre um ajuste e outro.
  return Math.round(bounded * 20) / 20
}

function read(): number {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    return raw ? clampScale(Number(raw)) : 1
  } catch {
    return 1
  }
}

/**
 * Escala da interface inteira.
 *
 * Funciona mudando o tamanho de fonte da raiz, e não com `transform: scale()`.
 * A diferença importa: como toda a interface é dimensionada em `rem`, mexer na
 * raiz faz margem, espaçamento, ícone, raio de borda e coluna da grade
 * crescerem na mesma proporção — o desenho continua exatamente alinhado, e o
 * texto continua nítido. Um `transform` borraria as letras, desalinharia os
 * elementos fixos e faria a conta de rolagem e de toque mentir.
 *
 * O conteúdo do livro fica de fora de propósito: ele tem controles próprios, e
 * quem lê costuma querer interface pequena com letra grande.
 */
export function useUiScale() {
  const [scale, setScaleState] = useState<number>(read)

  useEffect(() => {
    const root = globalThis.document?.documentElement
    if (!root) return
    root.style.fontSize = scale === 1 ? '' : `${UI_SCALE_BASE_PX * scale}px`
    try {
      if (scale === 1) globalThis.localStorage?.removeItem(KEY)
      else globalThis.localStorage?.setItem(KEY, String(scale))
    } catch {
      /* navegação privada pode recusar; a escala vale para esta sessão */
    }
  }, [scale])

  const setScale = useCallback((value: number) => setScaleState(clampScale(value)), [])

  return {
    scale,
    setScale,
    increase: useCallback(() => setScaleState((s) => clampScale(s + UI_SCALE_STEP)), []),
    decrease: useCallback(() => setScaleState((s) => clampScale(s - UI_SCALE_STEP)), []),
    reset: useCallback(() => setScaleState(1), []),
    atMin: scale <= UI_SCALE_MIN,
    atMax: scale >= UI_SCALE_MAX,
  }
}

export interface ScaleShortcutHandlers {
  increase: () => void
  decrease: () => void
  reset: () => void
}

/**
 * `Ctrl +`, `Ctrl −` e `Ctrl 0`, como no navegador.
 *
 * O atalho é interceptado de propósito: o zoom nativo do navegador ampliaria a
 * janela inteira por cima de um layout de tela cheia, deslocando as barras
 * fixas. Escalar a raiz faz a mesma coisa mantendo tudo alinhado, então é ele
 * que deve responder à tecla que a pessoa já conhece.
 */
export function attachScaleShortcuts(
  target: Document | Window,
  { increase, decrease, reset }: ScaleShortcutHandlers,
): () => void {
  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent
    if (!key.ctrlKey && !key.metaKey) return

    if (key.key === '+' || key.key === '=') {
      key.preventDefault()
      increase()
    } else if (key.key === '-' || key.key === '_') {
      key.preventDefault()
      decrease()
    } else if (key.key === '0') {
      key.preventDefault()
      reset()
    }
  }

  target.addEventListener('keydown', onKeyDown)
  return () => target.removeEventListener('keydown', onKeyDown)
}
