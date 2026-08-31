import { useCallback, useEffect, useState } from 'react'
import { createBookStore, requestPersistence, type StorageUsage } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import type { Book } from '../../lib/types'
import { formatBytes } from './formatBytes'
import { api } from '../../lib/api/client'

interface StorageScreenProps {
  onClose: () => void
  onLogout?: () => void
  canPair?: boolean
}

export function StorageScreen({ onClose, onLogout, canPair = false }: StorageScreenProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [localIds, setLocalIds] = useState<Set<string>>(new Set())
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const store = createBookStore()
    const [list, ids, used] = await Promise.all([
      localMirror.listBooks(),
      store.list(),
      store.usage(),
    ])
    setBooks(list)
    setLocalIds(new Set(ids))
    setUsage(used)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const here = books.filter((book) => localIds.has(book.id))

  return (
    <main className="mx-auto min-h-full max-w-2xl px-5 py-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar para a estante"
          className="rounded-lg px-2 py-1 text-ink-dim hover:text-ink"
        >
          ←
        </button>
        <h1 className="flex-1 font-serif text-2xl text-ink">Ajustes</h1>
      </header>

      <section aria-label="Armazenamento" className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Armazenamento deste aparelho</h2>

        {usage && (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-accent"
                style={{ width: `${usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-ink-dim">
              {formatBytes(usage.used)} usados
              {usage.quota > 0 && ` de ${formatBytes(usage.quota)} disponíveis`} ·{' '}
              {formatBytes(usage.booksBytes)} em livros
            </p>

            {!usage.persisted && (
              <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
                <p className="text-ink">
                  O navegador ainda pode apagar os arquivos guardados aqui se o disco ficar cheio.
                  Suas anotações e seu progresso estão a salvo no servidor — os arquivos dos livros
                  não.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await requestPersistence()
                    await refresh()
                  }}
                  className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
                >
                  Pedir para manter os arquivos
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-label="Livros neste aparelho" className="mt-5">
        <h2 className="mb-2 text-sm font-medium text-ink">
          Arquivos aqui <span className="text-ink-faint">({here.length} de {books.length})</span>
        </h2>
        <p className="mb-3 text-xs text-ink-faint">
          Remover o arquivo libera espaço e não apaga nada do que você marcou — o livro continua na
          estante, esperando o arquivo de volta.
        </p>

        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {here.map((book) => (
            <li key={book.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{book.title}</p>
                <p className="text-xs text-ink-faint">{formatBytes(book.fileSize)}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await createBookStore().delete(book.id)
                  await refresh()
                }}
                className="text-xs text-ink-dim hover:text-danger"
              >
                Remover daqui
              </button>
            </li>
          ))}
          {here.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-faint">
              Nenhum arquivo guardado neste aparelho.
            </li>
          )}
        </ul>
      </section>

      {canPair && (
        <section aria-label="Parear aparelho" className="mt-5 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">Parear outro aparelho</h2>
          <p className="mt-1 text-xs text-ink-faint">
            Gere um código aqui e digite-o no celular para ele entrar sem senha.
          </p>

          {pairing ? (
            <p className="mt-3 text-center font-mono text-3xl tracking-[0.3em] text-accent">
              {pairing.code}
            </p>
          ) : (
            <button
              type="button"
              onClick={async () => {
                setPairError(null)
                try {
                  setPairing(await api.createPairingCode())
                } catch (error) {
                  setPairError(error instanceof Error ? error.message : 'falha ao gerar o código')
                }
              }}
              className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              Gerar código
            </button>
          )}
          {pairing && (
            <p className="mt-1 text-center text-xs text-ink-faint">vale por 10 minutos, uma vez só</p>
          )}
          {pairError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {pairError}
            </p>
          )}
        </section>
      )}

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="mt-8 text-sm text-ink-faint underline underline-offset-2 hover:text-danger"
        >
          Sair deste aparelho
        </button>
      )}
    </main>
  )
}
