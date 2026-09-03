import { useState } from 'react'
import { suggestDeviceName } from './useSession'

interface LoginScreenProps {
  onLogin: (password: string, deviceName: string) => Promise<void>
  onPair: (code: string, deviceName: string) => Promise<void>
  onLocalOnly: () => void
}

const field =
  'mt-1.5 w-full rounded-xl bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40'

export function LoginScreen({ onLogin, onPair, onLocalOnly }: LoginScreenProps) {
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [deviceName, setDeviceName] = useState(suggestDeviceName())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'password') await onLogin(password, deviceName)
      else await onPair(code.trim(), deviceName)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'não foi possível entrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-full place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-[2.5rem] font-medium tracking-tight text-accent">Quire</h1>
        <p className="mt-1 text-sm text-ink-dim">Seu acervo, lido do seu jeito.</p>

        <form onSubmit={submit} className="mt-10 space-y-4">
          {mode === 'password' ? (
            <label className="block text-xs uppercase tracking-[0.12em] text-ink-faint">
              Senha
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${field} text-base tracking-normal normal-case`}
              />
            </label>
          ) : (
            <label className="block text-xs uppercase tracking-[0.12em] text-ink-faint">
              Código de pareamento
              <input
                inputMode="numeric"
                pattern="\d{6}"
                autoFocus
                required
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${field} text-center font-serif text-3xl tracking-[0.4em] normal-case`}
              />
            </label>
          )}

          <label className="block text-xs uppercase tracking-[0.12em] text-ink-faint">
            Nome deste aparelho
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className={`${field} text-base tracking-normal normal-case`}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent py-2.5 font-medium text-canvas disabled:opacity-50"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-8 space-y-2 text-sm">
          <button
            type="button"
            onClick={() => setMode(mode === 'password' ? 'code' : 'password')}
            className="text-accent underline underline-offset-2"
          >
            {mode === 'password' ? 'Entrar com código de pareamento' : 'Entrar com a senha'}
          </button>
          <p className="leading-relaxed text-ink-faint">
            No computador já autenticado, abra Ajustes → Parear aparelho para gerar um código.
          </p>
        </div>

        <button
          type="button"
          onClick={onLocalOnly}
          className="mt-10 text-sm text-ink-faint underline underline-offset-2 hover:text-ink-dim"
        >
          Usar só neste aparelho, sem sincronizar
        </button>
      </div>
    </main>
  )
}
