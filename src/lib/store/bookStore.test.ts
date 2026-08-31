import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookStore, requestPersistence } from './bookStore'
import { deleteQuireDb } from './idb'

describe('BookStore', () => {
  beforeEach(async () => {
    await deleteQuireDb()
  })

  it('guarda e devolve o mesmo conteúdo', async () => {
    const store = createBookStore()
    await store.put('abc', new Blob([new Uint8Array([1, 2, 3])]))
    // Array.from porque o fake-indexeddb devolve o buffer de outro realm.
    expect(Array.from((await store.getBytes('abc'))!)).toEqual([1, 2, 3])
    expect((await store.get('abc'))?.size).toBe(3)
  })

  it('has responde antes e depois de guardar', async () => {
    const store = createBookStore()
    expect(await store.has('abc')).toBe(false)
    await store.put('abc', new Blob([new Uint8Array([1])]))
    expect(await store.has('abc')).toBe(true)
  })

  it('get devolve undefined para livro desconhecido', async () => {
    expect(await createBookStore().get('nao-existe')).toBeUndefined()
  })

  it('delete remove o arquivo e é tolerante a id inexistente', async () => {
    const store = createBookStore()
    await store.put('abc', new Blob([new Uint8Array([1])]))
    await store.delete('abc')
    expect(await store.has('abc')).toBe(false)
    await expect(store.delete('abc')).resolves.toBeUndefined()
  })

  it('list devolve os ids guardados', async () => {
    const store = createBookStore()
    await store.put('b', new Blob([new Uint8Array([1])]))
    await store.put('a', new Blob([new Uint8Array([2])]))
    expect((await store.list()).sort()).toEqual(['a', 'b'])
  })

  it('usage soma o tamanho dos arquivos e reflete a estimativa do navegador', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 4096, quota: 8192 }),
        persisted: async () => true,
      },
    })
    const store = createBookStore()
    await store.put('abc', new Blob([new Uint8Array(10)]))
    expect(await store.usage()).toEqual({ used: 4096, quota: 8192, booksBytes: 10, persisted: true })
    vi.unstubAllGlobals()
  })

  it('usage não quebra quando o navegador não expõe storage', async () => {
    vi.stubGlobal('navigator', {})
    const usage = await createBookStore().usage()
    expect(usage).toEqual({ used: 0, quota: 0, booksBytes: 0, persisted: false })
    vi.unstubAllGlobals()
  })

  it('requestPersistence devolve false quando a API não existe', async () => {
    vi.stubGlobal('navigator', {})
    expect(await requestPersistence()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('requestPersistence não repete o pedido quando já está persistido', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } })
    expect(await requestPersistence()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
