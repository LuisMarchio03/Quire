import { useCallback, useEffect, useMemo, useState } from 'react'
import { importBook, type ImportStage } from '../../lib/library/importBook'
import { mergeBooks } from '../../lib/library/mergeBooks'
import { findTwins, twinKey } from '../../lib/library/twins'
import { createBookStore } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import { nowIso } from '../../lib/time'
import type { Book, BookStatus } from '../../lib/types'
import { collectTags, filterBooks, normalizeTags } from '../../lib/library/tags'

export type StatusFilter = 'all' | BookStatus

export interface ImportingState {
  name: string
  stage: ImportStage
  fraction: number
}

/**
 * Dois livros que podem ser o mesmo. `twin` a estante achou sozinha; `file` o
 * dono escolheu um arquivo para um cartão e o arquivo não era idêntico.
 */
export interface MergeSuggestion {
  kind: 'twin' | 'file'
  loser: Book
  survivor: Book
}

const DISMISSED_KEY = 'quire.twinsDismissed'

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : []
  } catch {
    return []
  }
}

function writeDismissed(keys: string[]): void {
  try {
    globalThis.localStorage?.setItem(DISMISSED_KEY, JSON.stringify(keys))
  } catch {
    /* sem armazenamento: a recusa vale só enquanto a aba estiver aberta */
  }
}

export interface LibraryOptions {
  /** Muda quando a sincronização trouxe algo: a estante relê o espelho. */
  refreshKey?: number
  /** Chamado depois de juntar dois livros — a hora de subir a mudança. */
  onMerged?: () => void
}

export function useLibrary({ refreshKey = 0, onMerged }: LibraryOptions = {}) {
  const store = useMemo(() => createBookStore(), [])
  const [books, setBooks] = useState<Book[]>([])
  const [percents, setPercents] = useState<Record<string, number>>({})
  const [localIds, setLocalIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [importing, setImporting] = useState<ImportingState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [offer, setOffer] = useState<MergeSuggestion | null>(null)
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const refresh = useCallback(async () => {
    const [list, ids] = await Promise.all([localMirror.listBooks(), store.list()])
    const entries = await Promise.all(
      list.map(async (book) => [book.id, (await localMirror.getProgress(book.id))?.percent ?? 0] as const),
    )
    setBooks(list)
    setLocalIds(new Set(ids))
    setPercents(Object.fromEntries(entries))
    setLoading(false)
  }, [store])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  const importFiles = useCallback(
    async (files: File[], expectedBookId?: string) => {
      setMessage(null)
      for (const file of files) {
        setImporting({ name: file.name, stage: 'hash', fraction: 0 })
        try {
          const result = await importBook(file, {
            onProgress: (stage, fraction) => setImporting({ name: file.name, stage, fraction }),
          })

          if (result.status === 'unsupported') {
            setMessage(`Não deu para abrir "${file.name}": ${result.reason}.`)
          } else if (expectedBookId && result.book.id !== expectedBookId) {
            // O dono escolheu este arquivo para aquele cartão. Se o formato
            // bate, o mais provável é ser o mesmo livro vindo por outro
            // caminho — a decisão é dele, com a contagem de páginas à vista.
            const target = await localMirror.getBook(expectedBookId)
            if (target && !target.deletedAt && target.format === result.book.format) {
              setOffer({ kind: 'file', loser: result.book, survivor: target })
            } else {
              setMessage(
                `Esse arquivo não é o mesmo livro — o conteúdo é outro. Ele entrou na estante como "${result.book.title}".`,
              )
            }
          }
        } catch (error) {
          setMessage(
            `Falha ao adicionar "${file.name}": ${error instanceof Error ? error.message : 'erro inesperado'}.`,
          )
        }
      }
      setImporting(null)
      await refresh()
    },
    [refresh],
  )

  /** Libera espaço sem perder anotação nenhuma: o livro continua na estante. */
  const removeFile = useCallback(
    async (bookId: string) => {
      await store.delete(bookId)
      await refresh()
    },
    [refresh, store],
  )

  const deleteBook = useCallback(
    async (bookId: string) => {
      const book = await localMirror.getBook(bookId)
      if (book) await localMirror.saveBook({ ...book, deletedAt: nowIso(), updatedAt: nowIso() })
      await store.delete(bookId)
      await refresh()
    },
    [refresh, store],
  )

  const visible = useMemo(
    () => filterBooks(books, { query, tags: selectedTags, status: statusFilter }),
    [books, query, selectedTags, statusFilter],
  )

  /**
   * A sugestão da vez: a explícita, se o dono acabou de escolher um arquivo;
   * senão, o primeiro par de gêmeos que a estante encontra e ele ainda não
   * recusou. Uma por vez — juntado um, a releitura acha o próximo.
   */
  const suggestion = useMemo<MergeSuggestion | null>(() => {
    if (offer) return offer
    const [pair] = findTwins(books, { dismissed })
    return pair ? { kind: 'twin', survivor: pair[0], loser: pair[1] } : null
  }, [books, dismissed, offer])

  const acceptSuggestion = useCallback(async () => {
    if (!suggestion) return
    setOffer(null)
    await mergeBooks(suggestion.loser.id, suggestion.survivor.id)
    await refresh()
    onMerged?.()
  }, [onMerged, refresh, suggestion])

  const dismissSuggestion = useCallback(() => {
    if (!suggestion) return
    setOffer(null)
    const keys = [...new Set([...readDismissed(), twinKey(suggestion.loser, suggestion.survivor)])]
    writeDismissed(keys)
    setDismissed(keys)
  }, [suggestion])

  /** As etiquetas em uso, para virarem fichas clicáveis na estante. */
  const availableTags = useMemo(() => collectTags(books), [books])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }, [])

  const setBookTags = useCallback(
    async (bookId: string, tags: readonly string[]) => {
      const book = await localMirror.getBook(bookId)
      if (!book) return
      await localMirror.saveBook({
        ...book,
        tags: normalizeTags(tags),
        updatedAt: nowIso(),
      })
      await refresh()
    },
    [refresh],
  )

  return {
    books,
    visible,
    percents,
    localIds,
    loading,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    availableTags,
    selectedTags,
    toggleTag,
    clearTags: useCallback(() => setSelectedTags([]), []),
    setBookTags,
    importing,
    message,
    dismissMessage: () => setMessage(null),
    suggestion,
    acceptSuggestion,
    dismissSuggestion,
    importFiles,
    removeFile,
    deleteBook,
    refresh,
  }
}
