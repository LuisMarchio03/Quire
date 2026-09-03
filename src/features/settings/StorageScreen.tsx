import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createBookStore, requestPersistence, type StorageUsage } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import type { Book } from '../../lib/types'
import { formatBytes } from './formatBytes'
import { api } from '../../lib/api/client'
import { UiScaleControl, type UiScaleControls } from './UiScaleControl'
import { Icon } from '../ui/Icon'

interface StorageScreenProps {
  onClose: () => void
  onLogout?: () => void
  canPair?: boolean
  uiScale?: UiScaleControls
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-1 text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">{children}</h2>
  )
}

/** Uma página, não caixas: seções por rótulo e espaço, listas por fio. */
export function StorageScreen({
  onClose,
  onLogout,
  canPair = false,
  uiScale,
}: StorageScreenProps) {
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
    <main className="mx-auto min-h-full max-w-2xl px-5 pb-12 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="-ml-2 flex items-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar para a estante"
          className="grid size-9 place-items-center rounded-xl text-ink-dim hover:text-ink"
        >
          <Icon name="back" />
        </button>
      </header>
      <h1 className="mt-2 font-serif text-[1.75rem] font-medium tracking-tight text-ink">Ajustes</h1>

      {uiScale && (
        <section aria-label="Tamanho da interface" className="mt-6">
          <UiScaleControl controls={uiScale} />
        </section>
      )}

      <section aria-label="Armazenamento" className="mt-8">
        <Label>Este aparelho</Label>

        {usage && (
          <>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
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
              <div role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm">
                <p className="leading-relaxed text-ink">
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
                  className="mt-3 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-canvas"
                >
                  Pedir para manter os arquivos
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-label="Livros neste aparelho" className="mt-8">
        <Label>
          Arquivos aqui{' '}
          <span className="normal-case tracking-normal">
            ({here.length} de {books.length})
          </span>
        </Label>
        <p className="text-xs leading-relaxed text-ink-faint">
          Remover o arquivo libera espaço e não apaga nada do que você marcou — o livro continua na
          estante, esperando o arquivo de volta.
        </p>

        <ul className="mt-2 divide-y divide-line">
          {here.map((book) => (
            <li key={book.id} className="flex items-center gap-3 py-3">
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
                className="text-xs text-ink-faint hover:text-danger"
              >
                Remover daqui
              </button>
            </li>
          ))}
          {here.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-faint">
              Nenhum arquivo guardado neste aparelho.
            </li>
          )}
        </ul>
      </section>

      {canPair && (
        <section aria-label="Parear aparelho" className="mt-8">
          <Label>Parear outro aparelho</Label>
          <p className="text-xs leading-relaxed text-ink-faint">
            Gere um código aqui e digite-o no celular para ele entrar sem senha.
          </p>

          {pairing ? (
            <>
              <p className="mt-3 font-serif text-[2.25rem] tracking-[0.25em] text-accent tabular-nums">
                {pairing.code}
              </p>
              <p className="text-xs text-ink-faint">vale por 10 minutos, uma vez só</p>
            </>
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
              className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2 text-sm text-ink-dim hover:text-ink"
            >
              Gerar código
            </button>
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
          className="mt-12 text-sm text-danger/80 hover:text-danger"
        >
          Sair deste aparelho
        </button>
      )}
    </main>
  )
}
