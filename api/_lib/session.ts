import type { VercelRequest } from '@vercel/node'
import { hashToken, newToken, readCookie, SESSION_COOKIE, SESSION_DAYS } from './auth.js'
import { db } from './turso.js'

export interface SessionInfo {
  deviceId: string
  deviceName: string
}

const iso = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString()

/** Cria o aparelho e a sessão dele, devolvendo o token que vai no cookie. */
export async function createSession(deviceName: string, userAgent: string | undefined) {
  const client = db()
  const deviceId = crypto.randomUUID()
  const token = newToken()
  const now = iso()

  await client.batch(
    [
      {
        sql: 'INSERT INTO devices (id, name, user_agent, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
        args: [deviceId, deviceName.slice(0, 80) || 'Aparelho', userAgent?.slice(0, 300) ?? null, now, now],
      },
      {
        sql: 'INSERT INTO sessions (token_hash, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        args: [await hashToken(token), deviceId, now, iso(SESSION_DAYS)],
      },
    ],
    'write',
  )

  return { token, deviceId }
}

/** Devolve a sessão válida da requisição, ou null. Atualiza o último acesso. */
export async function readSession(req: VercelRequest): Promise<SessionInfo | null> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (!token) return null

  const client = db()
  const { rows } = await client.execute({
    sql: `SELECT d.id AS device_id, d.name AS device_name
            FROM sessions s
            JOIN devices d ON d.id = s.device_id
           WHERE s.token_hash = ? AND s.expires_at > ?`,
    args: [await hashToken(token), new Date().toISOString()],
  })
  if (rows.length === 0) return null

  const deviceId = String(rows[0].device_id)
  await client.execute({
    sql: 'UPDATE devices SET last_seen_at = ? WHERE id = ?',
    args: [iso(), deviceId],
  })
  return { deviceId, deviceName: String(rows[0].device_name) }
}

export async function destroySession(req: VercelRequest): Promise<void> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (!token) return
  await db().execute({
    sql: 'DELETE FROM sessions WHERE token_hash = ?',
    args: [await hashToken(token)],
  })
}
