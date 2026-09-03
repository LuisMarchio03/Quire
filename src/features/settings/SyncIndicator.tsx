import type { SyncState } from '../../lib/sync/syncEngine'

const LABEL: Record<SyncState, string> = {
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Sem conexão — as mudanças sobem depois',
  error: 'Falha ao sincronizar — tentando de novo',
}

const TONE: Record<SyncState, string> = {
  idle: 'text-ink-faint',
  syncing: 'text-accent',
  offline: 'text-ink-dim',
  error: 'text-danger',
}

const DOT: Record<SyncState, string> = {
  idle: 'bg-[#7fc4a2]',
  syncing: 'bg-accent animate-pulse',
  offline: 'bg-ink-faint',
  error: 'bg-danger',
}

/** Um ponto e uma linha de texto: o estado se lê de relance, sem ler. */
export function SyncIndicator({ state, onSyncNow }: { state: SyncState; onSyncNow?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSyncNow}
      className={`flex items-center gap-1.5 text-[0.6875rem] ${TONE[state]} hover:underline`}
      aria-live="polite"
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[state]}`} />
      {LABEL[state]}
    </button>
  )
}
