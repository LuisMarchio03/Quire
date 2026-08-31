import { useCallback, useEffect, useMemo, useState } from 'react'
import { importBook, type ImportStage } from '../../lib/library/importBook'
import { createBookStore } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import { nowIso } from '../../lib/time'
import type { Book, BookStatus } from '../../lib/types'

export type StatusFilter = 'all' | BookStatus

export interface ImportingState {
  name: string
  stage: ImportStage
  fraction: number
}

/** Tira acento e caixa para a busca casar "sertao" com "Sertão". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function useLibrary() {
  const store = useMemo(() => createBookStore(), [])
  const [books, setBooks] = useState<Book[]>([])
  const [percents, setPercents] = useState<Record<string, number>>({})
  const [localIds, setLocalIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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

  const visible = useMemo(() => {
    const needle = fold(query.trim())
    return books.filter((book) => {
      if (statusFilter !== 'all' && book.status !== statusFilter) return false
      if (!needle) return true
      return fold(`${book.title} ${book.author ?? ''}`).includes(needle)
    })
  }, [books, query, statusFilter])

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
    importing,
    message,
    dismissMessage: () => setMessage(null),
    importFiles,
    removeFile,
    deleteBook,
    refresh,
  }
}
