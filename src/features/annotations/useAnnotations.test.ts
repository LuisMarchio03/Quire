import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAnnotations } from './useAnnotations'
import { localMirror } from '../../lib/store/localMirror'
import { deleteQuireDb } from '../../lib/store/idb'
import type { Anchor } from '../../lib/types'

const anchorAt = (spineIndex: number): Anchor => ({
  kind: 'epub',
  spineIndex,
  startPath: [0, 0],
  startOffset: 0,
  endPath: [0, 0],
  endOffset: 9,
})

async function mount(bookId = 'h1') {
  const view = renderHook(() => useAnnotations(bookId))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('useAnnotations', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('cria destaque com o trecho citado e a cor escolhida', async () => {
    const { result } = await mount()

    await act(async () => {
      await result.current.addHighlight(anchorAt(1), 'um começo', '#e8c468')
    })

    expect(result.current.highlights).toHaveLength(1)
    expect(result.current.highlights[0]).toMatchObject({
      type: 'highlight',
      quotedText: 'um começo',
      color: '#e8c468',
    })
  })

  it('cria nota com texto próprio', async () => {
    const { result } = await mount()

    await act(async () => {
      await result.current.addNote(anchorAt(1), 'um começo', 'reler isto', '#7fc4a2')
    })

    expect(result.current.highlights[0]).toMatchObject({ type: 'note', noteText: 'reler isto' })
  })

  it('escrever nota num destaque o transforma em nota, e apagar o texto desfaz', async () => {
    const { result } = await mount()
    let id = ''
    await act(async () => {
      id = (await result.current.addHighlight(anchorAt(0), 'trecho', '#e8c468')).id
    })

    await act(async () => {
      await result.current.updateNote(id, 'pensar melhor')
    })
    expect(result.current.highlights[0].type).toBe('note')

    await act(async () => {
      await result.current.updateNote(id, '')
    })
    expect(result.current.highlights[0].type).toBe('highlight')
    expect(result.current.highlights[0].noteText).toBeNull()
  })

  it('marcar a mesma posição duas vezes remove a marca', async () => {
    const { result } = await mount()

    await act(async () => {
      await result.current.toggleBookmark(anchorAt(4), 'Capítulo 5')
    })
    expect(result.current.bookmarks).toHaveLength(1)

    await act(async () => {
      await result.current.toggleBookmark(anchorAt(4), 'Capítulo 5')
    })
    expect(result.current.bookmarks).toHaveLength(0)
  })

  it('marcas em posições diferentes convivem', async () => {
    const { result } = await mount()

    await act(async () => {
      await result.current.toggleBookmark(anchorAt(1), 'Capítulo 2')
      await result.current.toggleBookmark(anchorAt(6), 'Capítulo 7')
    })

    expect(result.current.bookmarks).toHaveLength(2)
    expect(result.current.bookmarkAt(6)).toBeDefined()
    expect(result.current.bookmarkAt(3)).toBeUndefined()
  })

  it('excluir é lógico: some da lista mas fica registrado para sincronizar', async () => {
    const { result } = await mount()
    let id = ''
    await act(async () => {
      id = (await result.current.addHighlight(anchorAt(0), 'trecho', '#e8c468')).id
    })

    await act(async () => {
      await result.current.remove(id)
    })

    expect(result.current.annotations).toHaveLength(0)
    expect((await localMirror.getAnnotation(id))?.deletedAt).toBeTruthy()
  })

  it('mostra só as anotações do livro pedido', async () => {
    const { result } = await mount('h1')
    await act(async () => {
      await result.current.addHighlight(anchorAt(0), 'do h1', '#e8c468')
    })

    const outro = await mount('h2')
    expect(outro.result.current.annotations).toHaveLength(0)
  })
})
