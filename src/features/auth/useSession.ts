import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type SessionInfo } from '../../lib/api/client'

const SESSION_KEY = 'quire.session'

export type SessionState =
  | { status: 'checking' }
  /** Entrou — ou já tinha entrado e está sem rede agora. */
  | { status: 'in'; session: SessionInfo; online: boolean }
  | { status: 'out' }
  /** Sem servidor configurado ou sem rede, usando o aparelho sozinho. */
  | { status: 'local' }

function remembered(): SessionInfo | null {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionInfo) : null
  } catch {
    return null
  }
}

function remember(session: SessionInfo | null): void {
  try {
    if (session) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session))
    else globalThis.localStorage?.removeItem(SESSION_KEY)
  } catch {
    /* sem armazenamento: a sessão vale só enquanto a aba estiver aberta */
  }
}

/**
 * Sessão do dono. É deliberadamente otimista: um leitor não pode ficar
 * trancado do próprio acervo por estar sem rede. Quem já entrou continua
 * dentro; só um 401 explícito do servidor derruba a sessão.
 */
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'checking' })

  const check = useCallback(async () => {
    const saved = remembered()
    try {
      const session = await api.me()
      remember(session)
      setState({ status: 'in', session, online: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        remember(null)
        setState({ status: 'out' })
        return
      }
      setState(saved ? { status: 'in', session: saved, online: false } : { status: 'out' })
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return {
    state,
    recheck: check,

    async login(password: string, deviceName: string) {
      const session = await api.login(password, deviceName)
      remember(session)
      setState({ status: 'in', session, online: true })
    },

    async pair(code: string, deviceName: string) {
      const session = await api.redeemPairingCode(code, deviceName)
      remember(session)
      setState({ status: 'in', session, online: true })
    },

    async logout() {
      try {
        await api.logout()
      } catch {
        /* já não havia sessão do outro lado */
      }
      remember(null)
      setState({ status: 'out' })
    },

    useLocalOnly() {
      setState({ status: 'local' })
    },
  }
}

export function suggestDeviceName(): string {
  const agent = globalThis.navigator?.userAgent ?? ''
  if (/iPhone/i.test(agent)) return 'iPhone'
  if (/iPad/i.test(agent)) return 'iPad'
  if (/Android/i.test(agent)) return 'Celular Android'
  if (/Mac OS X/i.test(agent)) return 'Mac'
  if (/Windows/i.test(agent)) return 'PC Windows'
  if (/Linux/i.test(agent)) return 'Computador Linux'
  return 'Este aparelho'
}
