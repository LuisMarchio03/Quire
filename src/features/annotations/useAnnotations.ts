import { useCallback, useEffect, useMemo, useState } from 'react'
import { localMirror } from '../../lib/store/localMirror'
import { nowIso } from '../../lib/time'
import type { Anchor, Annotation, HighlightColor } from '../../lib/types'

/** Capítulo no EPUB, página no PDF — é o que identifica uma marca de página. */
export function positionOf(anchor: Anchor): number {
  return anchor.kind === 'pdf' ? anchor.page : anchor.spineIndex
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function useAnnotations(bookId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setAnnotations(await localMirror.listAnnotations(bookId))
    setLoading(false)
  }, [bookId])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(
    async (annotation: Annotation) => {
      await localMirror.saveAnnotation(annotation)
      await reload()
      return annotation
    },
    [reload],
  )

  const create = useCallback(
    (fields: Pick<Annotation, 'type' | 'anchor' | 'quotedText' | 'noteText' | 'color'>) => {
      const now = nowIso()
      return save({
        id: newId(),
        bookId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...fields,
      })
    },
    [bookId, save],
  )

  const addHighlight = useCallback(
    (anchor: Anchor, quotedText: string, color: HighlightColor) =>
      create({ type: 'highlight', anchor, quotedText, noteText: null, color }),
    [create],
  )

  const addNote = useCallback(
    (anchor: Anchor, quotedText: string, noteText: string, color: HighlightColor) =>
      create({ type: 'note', anchor, quotedText, noteText, color }),
    [create],
  )

  const updateNote = useCallback(
    async (id: string, noteText: string) => {
      const current = await localMirror.getAnnotation(id)
      if (!current) return
      // Um destaque que ganha texto vira nota; perder o texto o devolve a destaque.
      await save({
        ...current,
        noteText: noteText || null,
        type: noteText ? 'note' : 'highlight',
        updatedAt: nowIso(),
      })
    },
    [save],
  )

  const remove = useCallback(
    async (id: string) => {
      const current = await localMirror.getAnnotation(id)
      if (!current) return
      // Exclusão lógica: um aparelho offline precisa saber que isto sumiu.
      await save({ ...current, deletedAt: nowIso(), updatedAt: nowIso() })
    },
    [save],
  )

  const bookmarks = useMemo(() => annotations.filter((a) => a.type === 'bookmark'), [annotations])

  const bookmarkAt = useCallback(
    (position: number) => bookmarks.find((b) => positionOf(b.anchor) === position),
    [bookmarks],
  )

  const toggleBookmark = useCallback(
    async (anchor: Anchor, label: string) => {
      const existing = bookmarkAt(positionOf(anchor))
      if (existing) {
        await remove(existing.id)
        return false
      }
      await create({ type: 'bookmark', anchor, quotedText: label, noteText: null, color: null })
      return true
    },
    [bookmarkAt, create, remove],
  )

  return {
    annotations,
    loading,
    highlights: useMemo(
      () => annotations.filter((a) => a.type === 'highlight' || a.type === 'note'),
      [annotations],
    ),
    bookmarks,
    bookmarkAt,
    addHighlight,
    addNote,
    updateNote,
    toggleBookmark,
    remove,
    reload,
  }
}
