import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hashToken, newPairingCode, sessionCookie } from './_lib/auth.js'
import { createSession, readSession } from './_lib/session.js'
import { db } from './_lib/turso.js'

const CODE_TTL_MINUTES = 10

/**
 * Pareamento de aparelho. O computador já autenticado gera um código curto; o
 * celular troca esse código por sessão própria. O código vive dez minutos,
 * serve uma vez só e é guardado apenas como hash.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' })

  const { action, code, deviceName } = (req.body ?? {}) as Record<string, unknown>
  const client = db()
  const now = new Date()

  try {
    if (action === 'create') {
      if (!(await readSession(req))) return res.status(401).json({ error: 'não autenticado' })

      const plain = newPairingCode()
      const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString()
      await client.batch(
        [
          // Códigos vencidos ou já usados não servem mais para nada; varrer aqui
          // evita que a tabela cresça para sempre.
          {
            sql: 'DELETE FROM pairing_codes WHERE expires_at < ? OR used_at IS NOT NULL',
            args: [now.toISOString()],
          },
          {
            sql: 'INSERT INTO pairing_codes (code_hash, created_at, expires_at) VALUES (?, ?, ?)',
            args: [await hashToken(plain), now.toISOString(), expiresAt],
          },
        ],
        'write',
      )
      return res.status(200).json({ code: plain, expiresAt })
    }

    if (action === 'redeem') {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'código inválido' })
      }
      const codeHash = await hashToken(code)
      const { rowsAffected } = await client.execute({
        sql: `UPDATE pairing_codes SET used_at = ?
               WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
        args: [now.toISOString(), codeHash, now.toISOString()],
      })
      if (rowsAffected === 0) return res.status(401).json({ error: 'código inválido ou expirado' })

      const name = typeof deviceName === 'string' && deviceName ? deviceName : 'Aparelho pareado'
      const { token, deviceId } = await createSession(name, req.headers['user-agent'])
      res.setHeader('Set-Cookie', sessionCookie(token))
      return res.status(200).json({ deviceId, deviceName: name })
    }

    return res.status(400).json({ error: 'ação desconhecida' })
  } catch (error) {
    console.error('api/pair:', error)
    return res.status(500).json({ error: 'não foi possível parear' })
  }
}
