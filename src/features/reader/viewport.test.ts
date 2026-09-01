import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeViewport, readSafeInsets } from './viewport'

describe('observeViewport', () => {
  let alvo: HTMLElement
  let observers: Array<{ callback: () => void; disconnected: boolean }>

  beforeEach(() => {
    observers = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private entry: { callback: () => void; disconnected: boolean }
        constructor(callback: () => void) {
          this.entry = { callback, disconnected: false }
          observers.push(this.entry)
        }
        observe() {}
        disconnect() {
          this.entry.disconnected = true
        }
      },
    )
    alvo = document.createElement('div')
    document.body.append(alvo)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('avisa quando o elemento muda de tamanho', () => {
    const aviso = vi.fn()
    observeViewport(alvo, aviso, { debounceMs: 100 })

    observers[0].callback()
    expect(aviso).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('junta uma rajada de mudanças num aviso só', () => {
    const aviso = vi.fn()
    observeViewport(alvo, aviso, { debounceMs: 100 })

    // É o que a barra de endereço do celular faz ao animar.
    for (let i = 0; i < 12; i++) {
      observers[0].callback()
      vi.advanceTimersByTime(10)
    }
    vi.advanceTimersByTime(100)

    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('avisa quando o aparelho gira', () => {
    const aviso = vi.fn()
    observeViewport(alvo, aviso, { debounceMs: 50 })

    window.dispatchEvent(new Event('orientationchange'))
    vi.advanceTimersByTime(50)

    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('parar de observar cancela o aviso pendente', () => {
    const aviso = vi.fn()
    const parar = observeViewport(alvo, aviso, { debounceMs: 100 })

    observers[0].callback()
    parar()
    vi.advanceTimersByTime(500)

    expect(aviso).not.toHaveBeenCalled()
    expect(observers[0].disconnected).toBe(true)
  })

  it('funciona em navegador sem ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const aviso = vi.fn()

    observeViewport(alvo, aviso, { debounceMs: 50 })
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(50)

    expect(aviso).toHaveBeenCalledTimes(1)
  })
})

describe('readSafeInsets', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lê os recortes da tela declarados no CSS', () => {
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) =>
        ({
          '--quire-safe-top': '47px',
          '--quire-safe-right': '0px',
          '--quire-safe-bottom': '34px',
          '--quire-safe-left': '0px',
        })[name] ?? '',
    }))

    expect(readSafeInsets(document.createElement('div'))).toEqual({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    })
  })

  it('devolve zeros quando não há elemento ou valor', () => {
    expect(readSafeInsets(null)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })

    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    expect(readSafeInsets(document.createElement('div'))).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })
})
