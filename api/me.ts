import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie } from './_lib/auth.js'
import { destroySession, readSession } from './_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'DELETE') {
      await destroySession(req)
      res.setHeader('Set-Cookie', clearSessionCookie())
      return res.status(200).json({ ok: true })
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'método não permitido' })

    const session = await readSession(req)
    if (!session) return res.status(401).json({ error: 'não autenticado' })
    return res.status(200).json(session)
  } catch (error) {
    console.error('api/me:', error)
    return res.status(500).json({ error: 'falha ao consultar a sessão' })
  }
}
