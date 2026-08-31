/**
 * Credenciais do Quire. Um usuário só, senha única, e aparelhos que entram por
 * pareamento. Tudo aqui é função pura sobre Web Crypto — o que toca o banco
 * está em `session.ts`.
 */

const ITERATIONS = 210_000
const SESSION_COOKIE = 'quire_session'
const SESSION_DAYS = 180

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** Comparação sem atalho: o tempo não pode revelar quantos bytes bateram. */
function equalsConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Formato: `pbkdf2$<iterações>$<sal>$<derivado>`, os dois últimos em base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1000) return false
  try {
    const salt = fromBase64Url(parts[2])
    const expected = fromBase64Url(parts[3])
    return equalsConstantTime(await derive(password, salt, iterations), expected)
  } catch {
    return false
  }
}

export function newToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** O banco guarda só o hash do token: vazamento de tabela não vira sessão. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Seis dígitos sem viés de módulo — descarta os sorteios fora da faixa. */
export function newPairingCode(): string {
  const buffer = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return String(value % 1_000_000).padStart(6, '0')
}

export function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export { SESSION_COOKIE, SESSION_DAYS }
