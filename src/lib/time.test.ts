import { describe, expect, it } from 'vitest'
import { isoPlus, nowIso } from './time'

describe('time', () => {
  it('nowIso devolve ISO-8601 em UTC', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('isoPlus soma segundos a partir de uma base', () => {
    expect(isoPlus(600, new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:10:00.000Z')
  })

  it('isoPlus aceita segundos negativos', () => {
    expect(isoPlus(-60, new Date('2026-01-01T00:01:00.000Z'))).toBe('2026-01-01T00:00:00.000Z')
  })
})
