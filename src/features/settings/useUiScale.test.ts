import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { attachScaleShortcuts, clampScale, useUiScale, UI_SCALE_BASE_PX } from './useUiScale'

const raizPx = () => document.documentElement.style.fontSize

describe('clampScale', () => {
  it('prende dentro dos limites úteis', () => {
    expect(clampScale(0.1)).toBe(0.8)
    expect(clampScale(9)).toBe(1.6)
  })

  it('arredonda em passos de 5%', () => {
    expect(clampScale(1.234)).toBe(1.25)
    expect(clampScale(1.21)).toBe(1.2)
  })

  it('valor inválido volta a 100%, e infinito conta como inválido', () => {
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('useUiScale', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.fontSize = ''
  })

  it('começa em 100% e não mexe na raiz', () => {
    const { result } = renderHook(() => useUiScale())
    expect(result.current.scale).toBe(1)
    expect(raizPx()).toBe('')
  })

  it('aumentar escala a raiz, que é o que leva a interface junto', () => {
    const { result } = renderHook(() => useUiScale())

    act(() => result.current.increase())

    expect(result.current.scale).toBeCloseTo(1.1)
    expect(raizPx()).toBe(`${UI_SCALE_BASE_PX * 1.1}px`)
  })

  it('diminuir também', () => {
    const { result } = renderHook(() => useUiScale())
    act(() => result.current.decrease())
    expect(result.current.scale).toBeCloseTo(0.9)
  })

  it('não passa dos limites, e avisa quando chegou neles', () => {
    const { result } = renderHook(() => useUiScale())

    act(() => result.current.setScale(5))
    expect(result.current.scale).toBe(1.6)
    expect(result.current.atMax).toBe(true)

    act(() => result.current.setScale(0))
    expect(result.current.scale).toBe(0.8)
    expect(result.current.atMin).toBe(true)
  })

  it('a escolha sobrevive a reabrir o app', () => {
    const primeiro = renderHook(() => useUiScale())
    act(() => primeiro.result.current.setScale(1.3))

    const segundo = renderHook(() => useUiScale())
    expect(segundo.result.current.scale).toBe(1.3)
    expect(raizPx()).toBe(`${UI_SCALE_BASE_PX * 1.3}px`)
  })

  it('voltar ao padrão limpa a raiz em vez de fixá-la em 16px', () => {
    const { result } = renderHook(() => useUiScale())
    act(() => result.current.setScale(1.4))

    act(() => result.current.reset())

    // Deixar a raiz vazia devolve o controle à preferência de fonte do navegador,
    // que é o que uma pessoa com baixa visão costuma já ter configurada.
    expect(raizPx()).toBe('')
    expect(localStorage.getItem('quire.uiScale')).toBeNull()
  })

  it('preferência guardada corrompida não quebra a abertura', () => {
    localStorage.setItem('quire.uiScale', 'não é número')
    const { result } = renderHook(() => useUiScale())
    expect(result.current.scale).toBe(1)
  })
})

describe('attachScaleShortcuts', () => {
  const tecla = (key: string, ctrl = true) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, cancelable: true }))

  it('Ctrl + aumenta, Ctrl − diminui, Ctrl 0 volta ao padrão', () => {
    const chamadas: string[] = []
    const soltar = attachScaleShortcuts(document, {
      increase: () => chamadas.push('mais'),
      decrease: () => chamadas.push('menos'),
      reset: () => chamadas.push('padrão'),
    })

    tecla('=')
    tecla('+')
    tecla('-')
    tecla('0')

    expect(chamadas).toEqual(['mais', 'mais', 'menos', 'padrão'])
    soltar()
  })

  it('impede o zoom do navegador de agir por cima', () => {
    const soltar = attachScaleShortcuts(document, {
      increase: () => {},
      decrease: () => {},
      reset: () => {},
    })

    const evento = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true })
    document.dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
    soltar()
  })

  it('tecla sem Ctrl não mexe na escala', () => {
    const chamadas: string[] = []
    const soltar = attachScaleShortcuts(document, {
      increase: () => chamadas.push('mais'),
      decrease: () => chamadas.push('menos'),
      reset: () => chamadas.push('padrão'),
    })

    tecla('+', false)
    tecla('0', false)

    expect(chamadas).toEqual([])
    soltar()
  })

  it('soltar encerra os atalhos', () => {
    const chamadas: string[] = []
    const soltar = attachScaleShortcuts(document, {
      increase: () => chamadas.push('mais'),
      decrease: () => {},
      reset: () => {},
    })
    soltar()

    tecla('+')

    expect(chamadas).toEqual([])
  })
})
