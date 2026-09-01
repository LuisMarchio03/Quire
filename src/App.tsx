import { useEffect, useRef, useState } from 'react'
import { LibraryScreen } from './features/library/LibraryScreen'
import { ReaderScreen } from './features/reader/ReaderScreen'
import { StorageScreen } from './features/settings/StorageScreen'
import { SyncIndicator } from './features/settings/SyncIndicator'
import { LoginScreen } from './features/auth/LoginScreen'
import { useSession } from './features/auth/useSession'
import { httpSyncTransport } from './lib/api/client'
import { createSyncEngine, type SyncEngine, type SyncState } from './lib/sync/syncEngine'
import { createBookStore, requestPersistence } from './lib/store/bookStore'
import { attachScaleShortcuts, useUiScale } from './features/settings/useUiScale'
import { attachPinch } from './features/reader/pinch'

type Route = { name: 'library' } | { name: 'reader'; bookId: string } | { name: 'settings' }

export function App() {
  const session = useSession()
  const uiScale = useUiScale()
  const [route, setRoute] = useState<Route>({ name: 'library' })
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const syncEngine = useRef<SyncEngine | null>(null)

  // Pedido único e silencioso: sem isso o navegador pode despejar os arquivos
  // dos livros, que são o único dado do app que não vive também no servidor.
  useEffect(() => {
    void requestPersistence()
  }, [])

  useEffect(
    () =>
      attachScaleShortcuts(document, {
        increase: uiScale.increase,
        decrease: uiScale.decrease,
        reset: uiScale.reset,
      }),
    [uiScale.increase, uiScale.decrease, uiScale.reset],
  )

  // Pinça nas telas do app escala a interface. Dentro do livro ela pertence ao
  // conteúdo — página do PDF ou corpo do texto do EPUB — que é o que se espera
  // ao juntar os dedos sobre o que se está lendo.
  const gestureBase = useRef<number | null>(null)
  const scaleRef = useRef(uiScale.scale)
  scaleRef.current = uiScale.scale

  useEffect(() => {
    if (route.name === 'reader') return
    return attachPinch(document, {
      onPreview: (relative) => {
        gestureBase.current ??= scaleRef.current
        uiScale.setScale(gestureBase.current * relative)
      },
      onCommit: (relative) => {
        const base = gestureBase.current ?? scaleRef.current
        gestureBase.current = null
        uiScale.setScale(base * relative)
      },
    })
  }, [route.name, uiScale.setScale])

  const signedIn = session.state.status === 'in'

  useEffect(() => {
    if (!signedIn) return
    const engine = createSyncEngine({
      transport: httpSyncTransport,
      listLocalFiles: () => createBookStore().list(),
      onStateChange: setSyncState,
    })
    syncEngine.current = engine
    engine.start()
    return () => {
      engine.stop()
      syncEngine.current = null
    }
  }, [signedIn])

  if (session.state.status === 'checking') {
    return (
      <div className="grid h-full place-items-center">
        <p className="font-serif text-2xl text-accent">Quire</p>
      </div>
    )
  }

  if (session.state.status === 'out') {
    return (
      <LoginScreen
        onLogin={session.login}
        onPair={session.pair}
        onLocalOnly={session.useLocalOnly}
      />
    )
  }

  if (route.name === 'reader') {
    return (
      <ReaderScreen
        bookId={route.bookId}
        onClose={() => setRoute({ name: 'library' })}
        uiScale={uiScale}
      />
    )
  }

  if (route.name === 'settings') {
    return (
      <StorageScreen
        onClose={() => setRoute({ name: 'library' })}
        canPair={signedIn}
        uiScale={uiScale}
        onLogout={signedIn ? () => void session.logout() : undefined}
      />
    )
  }

  return (
    <LibraryScreen
      onOpen={(bookId) => setRoute({ name: 'reader', bookId })}
      onOpenSettings={() => setRoute({ name: 'settings' })}
      statusSlot={
        signedIn ? (
          <SyncIndicator state={syncState} onSyncNow={() => void syncEngine.current?.syncNow()} />
        ) : (
          <span className="text-xs text-ink-faint">Só neste aparelho — sem sincronização</span>
        )
      }
    />
  )
}
