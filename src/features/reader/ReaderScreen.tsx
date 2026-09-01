import { useCallback, useEffect, useRef, useState } from 'react'
import { anchorFromOffsets, rectsToPdfAnchor, resolveAnchor, selectionOffsets } from '../../lib/anchor/anchor'
import { parseEpub } from '../../lib/epub/parseEpub'
import { createEpubEngine } from '../../lib/reader/epubEngine'
import { createPdfEngine } from '../../lib/reader/pdfEngine'
import { loadPdf } from '../../lib/reader/loadPdf'
import { PALETTES } from '../../lib/reader/contentStyles'
import type { ReaderEngine, SearchHit } from '../../lib/reader/types'
import { createBookStore } from '../../lib/store/bookStore'
import { localMirror } from '../../lib/store/localMirror'
import { nowIso } from '../../lib/time'
import type { Anchor, Annotation, Book, HighlightColor, Locator } from '../../lib/types'
import { useAnnotations, positionOf } from '../annotations/useAnnotations'
import { paintHighlights } from '../annotations/highlightLayer'
import { SelectionMenu } from '../annotations/SelectionMenu'
import { AnnotationsPanel } from '../annotations/AnnotationsPanel'
import { applyFocusMode, clearFocusMode, focusNext, focusPrev } from './focusMode'
import { attachPinch } from './pinch'
import { attachSwipe } from './swipe'
import { observeViewport, readSafeInsets } from './viewport'
import { ReaderControls } from './ReaderControls'
import { TypographyPanel } from './TypographyPanel'
import { useReaderTheme } from './useReaderTheme'

interface ReaderScreenProps {
  bookId: string
  onClose: () => void
}

interface PendingSelection {
  text: string
  x: number
  y: number
  epub: { start: number; end: number } | null
  pdf: { rects: DOMRect[]; box: DOMRect } | null
}

const SAVE_DELAY_MS = 1000
const CONTROLS_HIDE_MS = 4000

const EMPTY_RECT = { left: 0, top: 0, width: 0, height: 0 } as DOMRect

/**
 * A geometria da seleção serve só para posicionar o menu. Nem todo ambiente
 * expõe essas medidas num documento aninhado, e ficar sem elas não pode
 * impedir alguém de destacar um trecho.
 */
function boundsOf(range: Range): DOMRect {
  return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : EMPTY_RECT
}

function fragmentsOf(range: Range): DOMRect[] {
  return typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : []
}

function boxOf(element: Element): DOMRect {
  return typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : EMPTY_RECT
}

export function ReaderScreen({ bookId, onClose }: ReaderScreenProps) {
  const { theme, focus, updateTheme, updateFocus, resetTheme } = useReaderTheme()
  const annotations = useAnnotations(bookId)

  const [book, setBook] = useState<Book | null>(null)
  const [engine, setEngine] = useState<ReaderEngine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [panel, setPanel] = useState<'typography' | 'annotations' | null>(null)
  const [locator, setLocator] = useState<Locator>({ spineIndex: 0, progressInSpine: 0 })
  const [percent, setPercent] = useState(0)
  const [pageInfo, setPageInfo] = useState({ page: 1, pages: 1 })
  const [selection, setSelection] = useState<PendingSelection | null>(null)
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const [crop, setCrop] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const clearPaint = useRef<() => void>(() => {})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- abertura do livro -------------------------------------------------
  useEffect(() => {
    let cancelled = false
    let created: ReaderEngine | null = null

    async function open() {
      const found = await localMirror.getBook(bookId)
      if (!found) {
        setError('Este livro não está no acervo.')
        return
      }
      if (cancelled) return
      setBook(found)

      const bytes = await createBookStore().getBytes(bookId)
      if (!bytes) {
        setError('O arquivo deste livro não está neste aparelho. Adicione-o pela estante.')
        return
      }

      try {
        created =
          found.format === 'epub'
            ? createEpubEngine(await parseEpub(bytes))
            : createPdfEngine(await loadPdf(bytes))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o arquivo.')
        return
      }
      if (cancelled || !containerRef.current) return

      await created.mount(containerRef.current)
      created.applyTheme(theme)

      const saved = await localMirror.getProgress(bookId)
      if (saved) await created.goTo(saved.locator)

      if (cancelled) {
        created.destroy()
        return
      }
      created.applyInsets(readSafeInsets(globalThis.document?.documentElement ?? null))
      await created.resize()

      setEngine(created)
      setLocator(created.locate())
      setPercent(created.percent())
      setPageInfo(created.pageInChapter())
      setZoom(created.getZoom())
      setCrop(created.getCrop())
    }

    void open()
    return () => {
      cancelled = true
      clearPaint.current()
      clearPaint.current = () => {}
      created?.destroy()
      setEngine(null)
    }
    // O tema entra na montagem e depois é aplicado pelo efeito próprio: relançar
    // a abertura a cada ajuste de fonte remontaria o livro inteiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // ---- posição ------------------------------------------------------------
  const persistProgress = useCallback(
    (current: Locator, ratio: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const now = nowIso()
          await localMirror.saveProgress({
            bookId,
            locator: current,
            percent: ratio,
            updatedAt: now,
          })
          const currentBook = await localMirror.getBook(bookId)
          if (!currentBook) return
          const status = ratio >= 0.98 ? 'finished' : 'reading'
          if (currentBook.status !== status) {
            await localMirror.saveBook({ ...currentBook, status, updatedAt: now })
          }
        })()
      }, SAVE_DELAY_MS)
    },
    [bookId],
  )

  useEffect(() => {
    if (!engine) return
    return engine.on('relocated', (next) => {
      setLocator(next)
      setPercent(engine.percent())
      setPageInfo(engine.pageInChapter())
      persistProgress(next, engine.percent())
    })
  }, [engine, persistProgress])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  // ---- a tela do celular muda o tempo todo --------------------------------
  useEffect(() => {
    const alvo = containerRef.current
    if (!engine || !alvo) return

    return observeViewport(alvo, () => {
      engine.applyInsets(readSafeInsets(globalThis.document?.documentElement ?? null))
      void engine.resize().then(() => {
        setPageInfo(engine.pageInChapter())
        setPercent(engine.percent())
      })
    })
  }, [engine])

  // ---- os controles somem sozinhos ----------------------------------------
  useEffect(() => {
    if (!controlsVisible || panel || selection) return
    const timer = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
    return () => clearTimeout(timer)
  }, [controlsVisible, panel, selection, locator])

  // ---- tema, destaques e foco --------------------------------------------
  useEffect(() => {
    engine?.applyTheme(theme)
  }, [engine, theme])

  const repaint = useCallback(() => {
    clearPaint.current()
    clearPaint.current = () => {}

    const root = engine?.contentRoot()
    if (!root || !engine) return

    const orphans = new Set<string>()
    const items = annotations.highlights
      .filter((annotation) => positionOf(annotation.anchor) === locator.spineIndex)
      .flatMap((annotation) => {
        const resolved = resolveAnchor(annotation.anchor, annotation.quotedText, root)
        if (resolved.orphan) orphans.add(annotation.id)
        return resolved.range
          ? [{ id: annotation.id, color: annotation.color ?? '#e8c468', range: resolved.range }]
          : []
      })

    setOrphanIds(orphans)
    clearPaint.current = paintHighlights(root, items)
  }, [annotations.highlights, engine, locator.spineIndex])

  useEffect(() => {
    repaint()
  }, [repaint, theme])

  useEffect(() => {
    const root = engine?.contentRoot()
    if (!root) return
    applyFocusMode(root, focus)
    return () => clearFocusMode(root)
  }, [engine, focus, locator.spineIndex, theme])

  const applyZoom = useCallback(
    async (value: number) => {
      if (!engine?.canZoom()) return
      await engine.setZoom(value)
      setZoom(engine.getZoom())
    },
    [engine],
  )

  const toggleCrop = useCallback(async () => {
    if (!engine?.canCrop()) return
    await engine.setCrop(!engine.getCrop())
    setCrop(engine.getCrop())
  }, [engine])

  // ---- gestos -------------------------------------------------------------
  const readSelection = useCallback(() => {
    const doc = engine?.contentDocument()
    const root = engine?.contentRoot()
    if (!doc || !root || !book) return

    const active = doc.getSelection()
    if (!active || active.isCollapsed || active.rangeCount === 0) {
      setSelection(null)
      return
    }

    const range = active.getRangeAt(0)
    const text = active.toString().trim()
    if (!text || !root.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }

    const rect = boundsOf(range)
    const frame = containerRef.current?.querySelector('iframe')?.getBoundingClientRect()
    setSelection({
      text,
      x: (frame?.left ?? 0) + rect.left + rect.width / 2,
      y: (frame?.top ?? 0) + rect.top - 52,
      epub: book.format === 'epub' ? selectionOffsets(range, root) : null,
      pdf: book.format === 'pdf' ? { rects: fragmentsOf(range), box: boxOf(root) } : null,
    })
  }, [book, engine])

  useEffect(() => {
    if (!engine) return
    const doc = engine.contentDocument()
    if (!doc) return

    const onPointerUp = () => setTimeout(readSelection, 0)

    const onClick = (event: MouseEvent) => {
      if (!doc.getSelection()?.isCollapsed) return
      const width = doc.documentElement?.clientWidth || window.innerWidth
      const zone = event.clientX / width
      if (zone < 0.28) void engine.prev()
      else if (zone > 0.72) void engine.next()
      else setControlsVisible((visible) => !visible)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const root = engine.contentRoot()
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        void engine.next()
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        void engine.prev()
      } else if (event.key === 'ArrowDown' && focus.enabled && root) {
        event.preventDefault()
        focusNext(root)
      } else if (event.key === 'ArrowUp' && focus.enabled && root) {
        event.preventDefault()
        focusPrev(root)
      } else if (event.key === 'Escape') {
        setPanel(null)
        setSelection(null)
      }
    }

    const detachSwipe = attachSwipe(doc, {
      onNext: () => void engine.next(),
      onPrev: () => void engine.prev(),
    })

    // Ampliar só faz sentido onde a página tem largura fixa. No EPUB, quem
    // aumenta a letra é o painel de tipografia.
    const detachPinch = engine.canZoom()
      ? attachPinch(doc, {
          onPreview: (relative) => {
            const alvo = engine.contentRoot()?.parentElement as HTMLElement | null
            if (!alvo) return
            alvo.style.transformOrigin = '0 0'
            alvo.style.transform = `scale(${relative})`
          },
          onCommit: (relative) => {
            const alvo = engine.contentRoot()?.parentElement as HTMLElement | null
            if (alvo) alvo.style.transform = ''
            void applyZoom(engine.getZoom() * relative)
          },
          onDoubleTap: () => void applyZoom(engine.getZoom() > 1 ? 1 : 2.5),
        })
      : () => {}

    doc.addEventListener('mouseup', onPointerUp)
    doc.addEventListener('touchend', onPointerUp)
    doc.addEventListener('click', onClick)
    doc.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      detachSwipe()
      detachPinch()
      doc.removeEventListener('mouseup', onPointerUp)
      doc.removeEventListener('touchend', onPointerUp)
      doc.removeEventListener('click', onClick)
      doc.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [engine, focus.enabled, readSelection, locator.spineIndex, applyZoom])

  // ---- anotações ----------------------------------------------------------
  const anchorFromSelection = useCallback((): Anchor | null => {
    const root = engine?.contentRoot()
    if (!root || !selection) return null

    if (selection.pdf) {
      return rectsToPdfAnchor(selection.pdf.rects, selection.pdf.box, locator.spineIndex)
    }
    if (!selection.epub) return null

    // Os <mark> da camada de destaque mudam a árvore, mas não o texto. Por isso
    // a medida é em caracteres: limpa-se a pintura e só então se resolve.
    clearPaint.current()
    clearPaint.current = () => {}
    return anchorFromOffsets(root, selection.epub.start, selection.epub.end, locator.spineIndex)
  }, [engine, locator.spineIndex, selection])

  const highlight = async (color: HighlightColor, openNote = false) => {
    const anchor = anchorFromSelection()
    const text = selection?.text ?? ''
    engine?.contentDocument()?.getSelection()?.removeAllRanges()
    setSelection(null)
    if (!anchor) {
      repaint()
      return
    }
    await annotations.addHighlight(anchor, text, color)
    if (openNote) setPanel('annotations')
  }

  const jumpTo = async (anchor: Anchor) => {
    if (!engine) return
    await engine.goTo({ spineIndex: positionOf(anchor), progressInSpine: 0 })
    setPanel(null)
  }

  const bookmarkPosition = locator.spineIndex
  const bookmarked = Boolean(annotations.bookmarkAt(bookmarkPosition))

  const toggleBookmark = async () => {
    if (!book) return
    const anchor: Anchor =
      book.format === 'pdf'
        ? { kind: 'pdf', page: bookmarkPosition, rects: [] }
        : {
            kind: 'epub',
            spineIndex: bookmarkPosition,
            startPath: [],
            startOffset: 0,
            endPath: [],
            endOffset: 0,
          }
    const label =
      book.format === 'pdf'
        ? `Página ${bookmarkPosition + 1}`
        : `Capítulo ${bookmarkPosition + 1} · ${Math.round(percent * 100)}%`
    await annotations.toggleBookmark(anchor, label)
  }

  const palette = PALETTES[theme.palette]

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-ink">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-canvas"
          >
            Voltar para a estante
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0" style={{ background: palette.bg }}>
      <div ref={containerRef} className="absolute inset-0" />

      {controlsVisible && book && (
        <ReaderControls
          title={book.title}
          chapterLabel={
            book.format === 'pdf'
              ? `Página ${pageInfo.page} de ${pageInfo.pages}`
              : `Capítulo ${locator.spineIndex + 1} de ${engine?.size() ?? book.spineCount}` +
                (pageInfo.pages > 1 ? ` · ${pageInfo.page}/${pageInfo.pages}` : '')
          }
          percent={percent}
          bookmarked={bookmarked}
          focusEnabled={focus.enabled}
          zoom={engine?.canZoom() ? { value: zoom, onChange: (v) => void applyZoom(v) } : undefined}
          crop={engine?.canCrop() ? { enabled: crop, onToggle: () => void toggleCrop() } : undefined}
          onBack={onClose}
          onToggleBookmark={() => void toggleBookmark()}
          onToggleFocus={() => updateFocus({ enabled: !focus.enabled })}
          onOpenTypography={() => setPanel(panel === 'typography' ? null : 'typography')}
          onOpenAnnotations={() => setPanel(panel === 'annotations' ? null : 'annotations')}
        />
      )}

      {selection && (
        <SelectionMenu
          x={selection.x}
          y={selection.y}
          onHighlight={(color) => void highlight(color)}
          onNote={() => void highlight('#e8c468', true)}
          onCopy={() => {
            void navigator.clipboard?.writeText(selection.text)
            setSelection(null)
          }}
          onClose={() => setSelection(null)}
        />
      )}

      {panel === 'typography' && (
        <TypographyPanel
          theme={theme}
          focus={focus}
          onTheme={updateTheme}
          onFocus={updateFocus}
          onReset={resetTheme}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'annotations' && book && (
        <AnnotationsPanel
          book={book}
          annotations={annotations.annotations}
          orphanIds={orphanIds}
          onJump={(annotation: Annotation) => void jumpTo(annotation.anchor)}
          onJumpToHit={(hit: SearchHit) => {
            void engine?.goTo(hit.locator)
            setPanel(null)
          }}
          onSearch={async (query) => (engine ? engine.search(query) : [])}
          onEditNote={(id, text) => void annotations.updateNote(id, text)}
          onRemove={(id) => void annotations.remove(id)}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
