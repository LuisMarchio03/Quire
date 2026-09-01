import { useCallback, useEffect, useMemo, useState } from 'react'
import { importBook, type ImportStage } from '../../lib/library/importBook'
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

export function useLibrary() {
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
  }, [refresh])

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
            setMessage(
              `Esse arquivo não é o mesmo livro — o conteúdo é outro. Ele entrou na estante como "${result.book.title}".`,
            )
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
    importFiles,
    removeFile,
    deleteBook,
    refresh,
  }
}
