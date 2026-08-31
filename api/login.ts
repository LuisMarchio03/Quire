import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sessionCookie, verifyPassword } from './_lib/auth.js'
import { createSession } from './_lib/session.js'

/** Hash descartável: sem ele, senha errada e app mal configurado respondem em tempos diferentes. */
const DUMMY_HASH =
  'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' })

  const { password, deviceName } = (req.body ?? {}) as Record<string, unknown>
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'senha é obrigatória' })
  }

  const stored = process.env.QUIRE_PASSWORD_HASH
  const ok = await verifyPassword(password, stored || DUMMY_HASH)
  if (!stored) {
    console.error('api/login: QUIRE_PASSWORD_HASH não está definido')
    return res.status(500).json({ error: 'servidor mal configurado' })
  }
  if (!ok) return res.status(401).json({ error: 'senha incorreta' })

  try {
    const name = typeof deviceName === 'string' && deviceName ? deviceName : 'Este aparelho'
    const { token, deviceId } = await createSession(name, req.headers['user-agent'])
    res.setHeader('Set-Cookie', sessionCookie(token))
    return res.status(200).json({ deviceId, deviceName: name })
  } catch (error) {
    console.error('api/login:', error)
    return res.status(500).json({ error: 'não foi possível entrar' })
  }
}
