import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie,
  hashPassword,
  hashToken,
  newPairingCode,
  newToken,
  readCookie,
  sessionCookie,
  verifyPassword,
} from './auth.js'

describe('senha', () => {
  it('verifica a senha correta', async () => {
    const stored = await hashPassword('livros abertos')
    expect(await verifyPassword('livros abertos', stored)).toBe(true)
  })

  it('rejeita a senha errada', async () => {
    const stored = await hashPassword('livros abertos')
    expect(await verifyPassword('livros fechados', stored)).toBe(false)
  })

  it('gera sal diferente a cada chamada', async () => {
    expect(await hashPassword('mesma senha')).not.toBe(await hashPassword('mesma senha'))
  })

  it('rejeita formato de hash desconhecido sem lançar', async () => {
    expect(await verifyPassword('x', 'lixo')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })
})

describe('token', () => {
  it('newToken gera valor único e seguro para URL', () => {
    const a = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(newToken())
  })

  it('hashToken é estável e não devolve o token', async () => {
    const token = newToken()
    expect(await hashToken(token)).toBe(await hashToken(token))
    expect(await hashToken(token)).not.toContain(token)
    expect(await hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('código de pareamento', () => {
  it('tem seis dígitos', () => {
    for (let i = 0; i < 50; i++) expect(newPairingCode()).toMatch(/^\d{6}$/)
  })

  it('varia entre chamadas', () => {
    const codes = new Set(Array.from({ length: 30 }, () => newPairingCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('cookie', () => {
  it('marca HttpOnly, Secure, SameSite e caminho raiz', () => {
    const cookie = sessionCookie('abc')
    expect(cookie).toContain('quire_session=abc')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toMatch(/Max-Age=\d+/)
  })

  it('o cookie de saída expira imediatamente', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })

  it('lê o cookie pelo nome, entre vários', () => {
    expect(readCookie('a=1; quire_session=xyz; b=2', 'quire_session')).toBe('xyz')
    expect(readCookie('a=1', 'quire_session')).toBeNull()
    expect(readCookie(undefined, 'quire_session')).toBeNull()
  })
})
