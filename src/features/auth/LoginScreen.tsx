import { useState } from 'react'
import { suggestDeviceName } from './useSession'

interface LoginScreenProps {
  onLogin: (password: string, deviceName: string) => Promise<void>
  onPair: (code: string, deviceName: string) => Promise<void>
  onLocalOnly: () => void
}

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
    <main className="grid min-h-full place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl text-accent">Quire</h1>
        <p className="mt-1 text-sm text-ink-dim">Seu acervo, lido do seu jeito.</p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          {mode === 'password' ? (
            <label className="block text-sm text-ink-dim">
              Senha
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:border-accent/60 focus:outline-none"
              />
            </label>
          ) : (
            <label className="block text-sm text-ink-dim">
              Código de pareamento
              <input
                inputMode="numeric"
                pattern="\d{6}"
                autoFocus
                required
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[0.4em] text-ink focus:border-accent/60 focus:outline-none"
              />
            </label>
          )}

          <label className="block text-sm text-ink-dim">
            Nome deste aparelho
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:border-accent/60 focus:outline-none"
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
            className="w-full rounded-lg bg-accent py-2 font-medium text-canvas disabled:opacity-50"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-sm">
          <button
            type="button"
            onClick={() => setMode(mode === 'password' ? 'code' : 'password')}
            className="text-accent underline underline-offset-2"
          >
            {mode === 'password'
              ? 'Entrar com código de pareamento'
              : 'Entrar com a senha'}
          </button>
          <p className="text-ink-faint">
            No computador já autenticado, abra Ajustes → Parear aparelho para gerar um código.
          </p>
        </div>

        <button
          type="button"
          onClick={onLocalOnly}
          className="mt-8 text-sm text-ink-faint underline underline-offset-2 hover:text-ink-dim"
        >
          Usar só neste aparelho, sem sincronizar
        </button>
      </div>
    </main>
  )
}
