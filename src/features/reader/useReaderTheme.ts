import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, type ReaderTheme } from '../../lib/reader/types'
import type { FocusOptions } from './focusMode'

const THEME_KEY = 'quire.theme'
const FOCUS_KEY = 'quire.focus'

export const DEFAULT_FOCUS: FocusOptions = { enabled: false, ruler: false, dimOpacity: 0.22 }

function read<T extends object>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return fallback
    // Mescla com o padrão para que uma versão nova do app ganhe campos novos
    // sem que a preferência guardada volte tudo à estaca zero.
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    /* navegação privada pode recusar; a leitura continua funcionando */
  }
}

export function useReaderTheme() {
  const [theme, setTheme] = useState<ReaderTheme>(() => read(THEME_KEY, DEFAULT_THEME))
  const [focus, setFocus] = useState<FocusOptions>(() => read(FOCUS_KEY, DEFAULT_FOCUS))

  useEffect(() => write(THEME_KEY, theme), [theme])
  useEffect(() => write(FOCUS_KEY, focus), [focus])

  return {
    theme,
    focus,
    updateTheme: useCallback(
      (patch: Partial<ReaderTheme>) => setTheme((current) => ({ ...current, ...patch })),
      [],
    ),
    updateFocus: useCallback(
      (patch: Partial<FocusOptions>) => setFocus((current) => ({ ...current, ...patch })),
      [],
    ),
    resetTheme: useCallback(() => setTheme(DEFAULT_THEME), []),
  }
}
