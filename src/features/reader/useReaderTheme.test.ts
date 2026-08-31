import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useReaderTheme } from './useReaderTheme'
import { DEFAULT_THEME } from '../../lib/reader/types'

describe('useReaderTheme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('começa com o tema padrão', () => {
    const { result } = renderHook(() => useReaderTheme())
    expect(result.current.theme).toEqual(DEFAULT_THEME)
  })

  it('guarda a mudança e a devolve depois de remontar', () => {
    const primeiro = renderHook(() => useReaderTheme())
    act(() => primeiro.result.current.updateTheme({ fontSize: 26, palette: 'sepia' }))

    const segundo = renderHook(() => useReaderTheme())

    expect(segundo.result.current.theme.fontSize).toBe(26)
    expect(segundo.result.current.theme.palette).toBe('sepia')
  })

  it('completa com o padrão o que a preferência guardada não tem', () => {
    localStorage.setItem('quire.theme', JSON.stringify({ fontSize: 30 }))

    const { result } = renderHook(() => useReaderTheme())

    expect(result.current.theme.fontSize).toBe(30)
    expect(result.current.theme.font).toBe(DEFAULT_THEME.font)
  })

  it('sobrevive a preferência corrompida', () => {
    localStorage.setItem('quire.theme', '{isso não é json')

    const { result } = renderHook(() => useReaderTheme())

    expect(result.current.theme).toEqual(DEFAULT_THEME)
  })

  it('guarda também as opções do modo foco', () => {
    const primeiro = renderHook(() => useReaderTheme())
    act(() => primeiro.result.current.updateFocus({ enabled: true, ruler: true }))

    const segundo = renderHook(() => useReaderTheme())

    expect(segundo.result.current.focus).toMatchObject({ enabled: true, ruler: true })
  })

  it('resetTheme volta tudo ao padrão', () => {
    const { result } = renderHook(() => useReaderTheme())
    act(() => result.current.updateTheme({ fontSize: 40 }))
    act(() => result.current.resetTheme())

    expect(result.current.theme).toEqual(DEFAULT_THEME)
  })
})
