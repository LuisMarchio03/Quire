/**
 * Teste de integração contra o Turso de verdade.
 *
 * É o único lugar onde o SQL roda: erro de coluna, de ON CONFLICT ou de
 * transação só aparece aqui. Fica pulado por padrão e só roda quando as
 * credenciais estão no ambiente:
 *
 *   node --env-file=.env.local ./node_modules/.bin/vitest run api/_lib/integration.test.ts
 *
 * Usa ids com prefixo próprio e apaga tudo o que criou no fim.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { hashPassword } from './auth.js'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const live = Boolean(url && authToken)

const PREFIX = 'zz-teste-'
const stamp = (iso: string) => iso

describe.skipIf(!live)('Turso — esquema e sincronização', () => {
  let client: Client
  let handleLogin: typeof import('../login.js').default
  let handlePair: typeof import('../pair.js').default
  let handleSync: typeof import('../sync.js').default
  let cookie = ''
  let deviceId = ''

  const request = (body: unknown, extra: Record<string, string> = {}) =>
    ({
      method: 'POST',
      body,
      headers: { 'user-agent': 'vitest', ...(cookie ? { cookie } : {}), ...extra },
    }) as never

  function response() {
    const state: { status: number; body: unknown; headers: Record<string, string> } = {
      status: 0,
      body: null,
      headers: {},
    }
    const res = {
      status(code: number) {
        state.status = code
        return res
      },
      json(payload: unknown) {
        state.body = payload
        return res
      },
      setHeader(name: string, value: string) {
        state.headers[name.toLowerCase()] = value
      },
    }
    return { res: res as never, state }
  }

  beforeAll(async () => {
    client = createClient({ url: url!, authToken: authToken! })
    process.env.QUIRE_PASSWORD_HASH = await hashPassword('senha-de-teste-do-quire')
    handleLogin = (await import('../login.js')).default
    handlePair = (await import('../pair.js')).default
    handleSync = (await import('../sync.js')).default
  })

  afterAll(async () => {
    if (!live) return
    await client.executeMultiple(`
      DELETE FROM annotations WHERE id LIKE '${PREFIX}%';
      DELETE FROM reading_progress WHERE book_id LIKE '${PREFIX}%';
      DELETE FROM books WHERE id LIKE '${PREFIX}%';
      DELETE FROM book_copies WHERE book_id LIKE '${PREFIX}%';
      DELETE FROM sessions WHERE device_id IN (SELECT id FROM devices WHERE name LIKE '${PREFIX}%');
      DELETE FROM devices WHERE name LIKE '${PREFIX}%';
      DELETE FROM pairing_codes WHERE used_at IS NOT NULL;
    `)
    client.close()
  })

  it('recusa senha errada', async () => {
    const { res, state } = response()
    await handleLogin(request({ password: 'errada', deviceName: `${PREFIX}pc` }), res)
    expect(state.status).toBe(401)
  })

  it('entra com a senha certa e devolve cookie de sessão', async () => {
    const { res, state } = response()
    await handleLogin(
      request({ password: 'senha-de-teste-do-quire', deviceName: `${PREFIX}pc` }),
      res,
    )

    expect(state.status).toBe(200)
    expect(state.headers['set-cookie']).toContain('quire_session=')
    cookie = state.headers['set-cookie'].split(';')[0]
    deviceId = (state.body as { deviceId: string }).deviceId
    expect(deviceId).toBeTruthy()
  })

  it('sync sem sessão devolve 401', async () => {
    const saved = cookie
    cookie = ''
    const { res, state } = response()
    await handleSync(request({ since: null, changes: [] }), res)
    cookie = saved
    expect(state.status).toBe(401)
  })

  it('grava livro, progresso e anotação numa única chamada', async () => {
    const bookId = `${PREFIX}livro`
    const { res, state } = response()

    await handleSync(
      request({
        since: null,
        copies: [bookId],
        changes: [
          {
            entity: 'book',
            data: {
              id: bookId,
              title: 'Livro de Integração',
              author: 'Vitest',
              format: 'epub',
              language: 'pt-BR',
              coverUrl: null,
              fileSize: 123,
              spineCount: 4,
              status: 'reading',
              addedAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-01-01T00:00:00.000Z'),
              deletedAt: null,
            },
          },
          {
            entity: 'progress',
            data: {
              bookId,
              locator: { spineIndex: 2, progressInSpine: 0.5 },
              percent: 0.4,
              updatedAt: stamp('2026-01-01T00:00:00.000Z'),
            },
          },
          {
            entity: 'annotation',
            data: {
              id: `${PREFIX}ann`,
              bookId,
              type: 'highlight',
              color: '#e8c468',
              anchor: { kind: 'epub', spineIndex: 2, startPath: [0, 0], startOffset: 1, endPath: [0, 0], endOffset: 8 },
              quotedText: 'trecho de teste',
              noteText: null,
              createdAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-01-01T00:00:00.000Z'),
              deletedAt: null,
            },
          },
        ],
      }),
      res,
    )

    expect(state.status).toBe(200)
    expect((state.body as { rejected: number[] }).rejected).toEqual([])

    const { rows } = await client.execute({
      sql: 'SELECT title, status, spine_count, synced_at FROM books WHERE id = ?',
      args: [bookId],
    })
    expect(rows[0].title).toBe('Livro de Integração')
    expect(rows[0].spine_count).toBe(4)
    expect(String(rows[0].synced_at)).toMatch(/^\d{4}-/)

    const copies = await client.execute({
      sql: 'SELECT device_id FROM book_copies WHERE book_id = ?',
      args: [bookId],
    })
    expect(copies.rows[0].device_id).toBe(deviceId)
  })

  it('última escrita vence: registro mais velho não sobrescreve', async () => {
    const bookId = `${PREFIX}livro`
    const { res } = response()

    await handleSync(
      request({
        since: null,
        changes: [
          {
            entity: 'book',
            data: {
              id: bookId,
              title: 'Versão Antiga',
              author: null,
              format: 'epub',
              language: null,
              coverUrl: null,
              fileSize: 1,
              spineCount: 1,
              status: 'unread',
              addedAt: stamp('2025-01-01T00:00:00.000Z'),
              updatedAt: stamp('2025-01-01T00:00:00.000Z'),
              deletedAt: null,
            },
          },
        ],
      }),
      res,
    )

    const { rows } = await client.execute({
      sql: 'SELECT title FROM books WHERE id = ?',
      args: [bookId],
    })
    expect(rows[0].title).toBe('Livro de Integração')
  })

  it('registro mais novo sobrescreve', async () => {
    const bookId = `${PREFIX}livro`
    const { res } = response()

    await handleSync(
      request({
        since: null,
        changes: [
          {
            entity: 'book',
            data: {
              id: bookId,
              title: 'Versão Nova',
              author: 'Vitest',
              format: 'epub',
              language: 'pt-BR',
              coverUrl: null,
              fileSize: 123,
              spineCount: 4,
              status: 'finished',
              addedAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-06-01T00:00:00.000Z'),
              deletedAt: null,
            },
          },
        ],
      }),
      res,
    )

    const { rows } = await client.execute({
      sql: 'SELECT title, status FROM books WHERE id = ?',
      args: [bookId],
    })
    expect(rows[0].title).toBe('Versão Nova')
    expect(rows[0].status).toBe('finished')
  })

  it('recusa mudança malformada e aceita as boas da mesma leva', async () => {
    const { res, state } = response()

    await handleSync(
      request({
        since: null,
        changes: [
          { entity: 'book', data: { id: '', title: 'sem id' } },
          {
            entity: 'progress',
            data: {
              bookId: `${PREFIX}livro`,
              locator: { spineIndex: 3, progressInSpine: 0 },
              percent: 0.9,
              updatedAt: stamp('2026-06-02T00:00:00.000Z'),
            },
          },
        ],
      }),
      res,
    )

    expect((state.body as { rejected: number[] }).rejected).toEqual([0])
    const { rows } = await client.execute({
      sql: 'SELECT percent FROM reading_progress WHERE book_id = ?',
      args: [`${PREFIX}livro`],
    })
    expect(Number(rows[0].percent)).toBeCloseTo(0.9)
  })

  it('o cursor devolve só o que mudou depois dele', async () => {
    const primeiro = response()
    await handleSync(request({ since: null, changes: [] }), primeiro.res)
    const cursor = (primeiro.state.body as { cursor: string }).cursor

    const segundo = response()
    await handleSync(request({ since: cursor, changes: [] }), segundo.res)

    expect((segundo.state.body as { changes: unknown[] }).changes).toHaveLength(0)
  })

  it('pareamento: gera código, aceita uma vez e recusa a segunda', async () => {
    const criar = response()
    await handlePair(request({ action: 'create' }), criar.res)
    expect(criar.state.status).toBe(200)
    const { code } = criar.state.body as { code: string }
    expect(code).toMatch(/^\d{6}$/)

    const semSessao = cookie
    cookie = ''

    const usar = response()
    await handlePair(request({ action: 'redeem', code, deviceName: `${PREFIX}celular` }), usar.res)
    expect(usar.state.status).toBe(200)
    expect(usar.state.headers['set-cookie']).toContain('quire_session=')

    const repetir = response()
    await handlePair(request({ action: 'redeem', code, deviceName: `${PREFIX}outro` }), repetir.res)
    expect(repetir.state.status).toBe(401)

    cookie = semSessao
  })

  it('exclusão lógica chega ao outro aparelho', async () => {
    const bookId = `${PREFIX}livro`
    const apagar = response()
    await handleSync(
      request({
        since: null,
        changes: [
          {
            entity: 'annotation',
            data: {
              id: `${PREFIX}ann`,
              bookId,
              type: 'highlight',
              color: '#e8c468',
              anchor: { kind: 'epub', spineIndex: 2, startPath: [0, 0], startOffset: 1, endPath: [0, 0], endOffset: 8 },
              quotedText: 'trecho de teste',
              noteText: null,
              createdAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-07-01T00:00:00.000Z'),
              deletedAt: stamp('2026-07-01T00:00:00.000Z'),
            },
          },
        ],
      }),
      apagar.res,
    )

    const { rows } = await client.execute({
      sql: 'SELECT deleted_at FROM annotations WHERE id = ?',
      args: [`${PREFIX}ann`],
    })
    expect(rows[0].deleted_at).toBeTruthy()
  })

  it('aliases fazem a viagem de ida e volta', async () => {
    const bookId = `${PREFIX}livro`
    const gravar = response()
    await handleSync(
      request({
        since: null,
        changes: [
          {
            entity: 'book',
            data: {
              id: bookId,
              title: 'Versão Nova',
              author: 'Vitest',
              format: 'epub',
              language: 'pt-BR',
              coverUrl: null,
              fileSize: 123,
              spineCount: 4,
              status: 'finished',
              aliases: [`${PREFIX}outro-hash`],
              addedAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-08-01T00:00:00.000Z'),
              deletedAt: null,
            },
          },
        ],
      }),
      gravar.res,
    )
    expect((gravar.state.body as { rejected: number[] }).rejected).toEqual([])

    const ler = response()
    await handleSync(request({ since: null, changes: [] }), ler.res)
    const { changes } = ler.state.body as {
      changes: Array<{ entity: string; data: { id: string; aliases?: string[] } }>
    }
    const livro = changes.find((c) => c.entity === 'book' && c.data.id === bookId)
    expect(livro?.data.aliases).toEqual([`${PREFIX}outro-hash`])
  })

  it('anotação pode mudar de livro', async () => {
    const mover = response()
    await handleSync(
      request({
        since: null,
        changes: [
          {
            entity: 'annotation',
            data: {
              id: `${PREFIX}ann`,
              bookId: `${PREFIX}livro-2`,
              type: 'highlight',
              color: '#e8c468',
              anchor: { kind: 'epub', spineIndex: 2, startPath: [0, 0], startOffset: 1, endPath: [0, 0], endOffset: 8 },
              quotedText: 'trecho de teste',
              noteText: null,
              createdAt: stamp('2026-01-01T00:00:00.000Z'),
              updatedAt: stamp('2026-08-02T00:00:00.000Z'),
              deletedAt: null,
            },
          },
        ],
      }),
      mover.res,
    )

    const { rows } = await client.execute({
      sql: 'SELECT book_id, deleted_at FROM annotations WHERE id = ?',
      args: [`${PREFIX}ann`],
    })
    expect(rows[0].book_id).toBe(`${PREFIX}livro-2`)
    expect(rows[0].deleted_at).toBeNull()
  })
})
