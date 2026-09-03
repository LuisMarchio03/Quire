import { localMirror } from '../store/localMirror'
import { createBookStore } from '../store/bookStore'
import { adoptAliasedFiles, unionStrings, type FileStore } from '../library/aliases'
import { nowIso } from '../time'
import type { Annotation, Book, Progress } from '../types'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export type Change =
  | { entity: 'book'; data: Book }
  | { entity: 'progress'; data: Progress }
  | { entity: 'annotation'; data: Annotation }

export interface CopyInfo {
  bookId: string
  deviceId: string
  deviceName: string
}

export interface SyncRequest {
  since: string | null
  changes: Change[]
  /** Ids dos livros cujo arquivo está neste aparelho. */
  copies: string[]
}

export interface SyncReply {
  cursor: string
  changes: Change[]
  /** Índices, dentro de `changes`, que o servidor recusou. */
  rejected: number[]
  copies: CopyInfo[]
}

export interface SyncTransport {
  sync(request: SyncRequest): Promise<SyncReply>
}

export interface SyncResult {
  pushed: number
  pulled: number
  error?: string
}

export interface SyncEngine {
  syncNow(): Promise<SyncResult>
  start(options?: { intervalMs?: number }): void
  stop(): void
  state(): SyncState
  copies(): CopyInfo[]
}

export interface SyncEngineOptions {
  transport: SyncTransport
  listLocalFiles: () => Promise<string[]>
  /** Onde os arquivos moram — para mover um arquivo guardado sob alias. */
  store?: FileStore
  onStateChange?: (state: SyncState) => void
  onCopies?: (copies: CopyInfo[]) => void
  /** Chegou mudança do servidor e foi aplicada: a interface precisa reler. */
  onPulled?: (count: number) => void
}

const DEFAULT_INTERVAL_MS = 60_000
const MAX_BACKOFF_MS = 5 * 60_000

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { transport, listLocalFiles, onStateChange, onCopies, onPulled } = options
  const store = options.store ?? createBookStore()

  let inFlight: Promise<SyncResult> | null = null
  let currentState: SyncState = 'idle'
  let knownCopies: CopyInfo[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  let running = false

  function setState(next: SyncState) {
    if (next === currentState) return
    currentState = next
    onStateChange?.(next)
  }

  /**
   * A fila guarda referências, não cópias: o valor enviado é sempre o estado
   * atual do registro. Fila atrasada nunca ressuscita um dado velho.
   */
  async function collectChanges() {
    const entries = await localMirror.drainOutbox()
    const changes: Change[] = []
    const entryIds: string[] = []
    const orphaned: string[] = []

    for (const entry of entries) {
      if (entry.entity === 'book') {
        const data = await localMirror.getBook(entry.key)
        if (data) {
          changes.push({ entity: 'book', data })
          entryIds.push(entry.id)
        } else orphaned.push(entry.id)
      } else if (entry.entity === 'progress') {
        const data = await localMirror.getProgress(entry.key)
        if (data) {
          changes.push({ entity: 'progress', data })
          entryIds.push(entry.id)
        } else orphaned.push(entry.id)
      } else {
        const data = await localMirror.getAnnotation(entry.key)
        if (data) {
          changes.push({ entity: 'annotation', data })
          entryIds.push(entry.id)
        } else orphaned.push(entry.id)
      }
    }

    if (orphaned.length > 0) await localMirror.ackOutbox(orphaned)
    return { changes, entryIds }
  }

  /** Também aqui vale última escrita vence: o delta não atropela edição local mais nova. */
  async function applyChange(change: Change): Promise<boolean> {
    if (change.entity === 'book') {
      const incoming = change.data
      const current = await localMirror.getBook(incoming.id)
      const incomingWins = !current || current.updatedAt < incoming.updatedAt
      const base: Book = incomingWins || !current ? incoming : current

      // Alias é fato que só cresce. Última escrita vence não pode apagar "este
      // arquivo é este livro", senão o aparelho que guarda o arquivo sob o
      // alias fica órfão. A união volta ao servidor com carimbo novo.
      const known = (incomingWins ? current?.aliases : incoming.aliases) ?? []
      const aliases = unionStrings(base.aliases ?? [], known)
      const grew = aliases.length > (base.aliases ?? []).length
      const book: Book = grew ? { ...base, aliases, updatedAt: nowIso() } : base

      if (incomingWins || grew) await localMirror.saveBook(book, { queue: grew })
      const adopted = await adoptAliasedFiles(book, store)
      return incomingWins || grew || adopted
    }
    if (change.entity === 'progress') {
      const current = await localMirror.getProgress(change.data.bookId)
      if (current && current.updatedAt >= change.data.updatedAt) return false
      await localMirror.saveProgress(change.data, { queue: false })
      return true
    }
    const current = await localMirror.getAnnotation(change.data.id)
    if (current && current.updatedAt >= change.data.updatedAt) return false
    await localMirror.saveAnnotation(change.data, { queue: false })
    return true
  }

  async function run(): Promise<SyncResult> {
    setState('syncing')
    try {
      const [{ changes, entryIds }, copies, since] = await Promise.all([
        collectChanges(),
        listLocalFiles(),
        localMirror.getSyncCursor(),
      ])

      const reply = await transport.sync({ since, changes, copies })

      const rejected = new Set(reply.rejected ?? [])
      const acked = entryIds.filter((_, index) => !rejected.has(index))
      if (acked.length > 0) await localMirror.ackOutbox(acked)

      let pulled = 0
      for (const change of reply.changes) if (await applyChange(change)) pulled++

      await localMirror.setSyncCursor(reply.cursor)
      if (pulled > 0) onPulled?.(pulled)

      knownCopies = reply.copies ?? []
      onCopies?.(knownCopies)

      failures = 0
      setState('idle')
      return { pushed: acked.length, pulled }
    } catch (error) {
      failures++
      setState(globalThis.navigator?.onLine === false ? 'offline' : 'error')
      return { pushed: 0, pulled: 0, error: error instanceof Error ? error.message : 'falha' }
    }
  }

  function schedule(intervalMs: number) {
    if (!running || intervalMs <= 0) return
    const backoff = failures > 0 ? Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS) : intervalMs
    timer = setTimeout(() => {
      void engine.syncNow().finally(() => schedule(intervalMs))
    }, backoff)
  }

  const onOnline = () => void engine.syncNow()
  const onFocus = () => void engine.syncNow()
  // No celular, voltar do segundo plano nem sempre dispara `focus`; o que
  // avisa é a visibilidade do documento.
  const onVisible = () => {
    if (globalThis.document?.visibilityState !== 'hidden') void engine.syncNow()
  }

  const engine: SyncEngine = {
    syncNow() {
      inFlight ??= run().finally(() => {
        inFlight = null
      })
      return inFlight
    },

    start({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
      if (running) return
      running = true
      globalThis.addEventListener?.('online', onOnline)
      globalThis.addEventListener?.('focus', onFocus)
      globalThis.document?.addEventListener?.('visibilitychange', onVisible)
      void engine.syncNow().finally(() => schedule(intervalMs))
    },

    stop() {
      running = false
      if (timer) clearTimeout(timer)
      timer = null
      globalThis.removeEventListener?.('online', onOnline)
      globalThis.removeEventListener?.('focus', onFocus)
      globalThis.document?.removeEventListener?.('visibilitychange', onVisible)
    },

    state: () => currentState,
    copies: () => knownCopies,
  }

  return engine
}
