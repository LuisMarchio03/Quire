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

export function SyncIndicator({ state, onSyncNow }: { state: SyncState; onSyncNow?: () => void }) {
  return (
    <button
      type="button"
      onClick={onSyncNow}
      className={`text-xs ${TONE[state]} hover:underline`}
      aria-live="polite"
    >
      {LABEL[state]}
    </button>
  )
}
