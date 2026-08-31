import { describe, expect, it } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('mostra bytes inteiros', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('usa uma casa decimal abaixo de dez', () => {
    expect(formatBytes(2_500_000)).toBe('2.4 MB')
  })

  it('arredonda a partir de dez', () => {
    expect(formatBytes(52_428_800)).toBe('50 MB')
  })

  it('chega a gigabytes', () => {
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })

  it('trata zero e valores inválidos', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
  })
})
