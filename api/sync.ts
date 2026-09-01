import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { InStatement } from '@libsql/client'
import { readSession } from './_lib/session.js'
import { db } from './_lib/turso.js'
import { parseChange, rowToAnnotation, rowToBook, rowToProgress, type Change } from './_lib/merge.js'

/**
 * Uma requisição faz as duas metades da sincronização: aplica o que o aparelho
 * mandou e devolve o que mudou desde o cursor dele.
 *
 * O cursor é lido ANTES da consulta de leitura. Assim, um registro gravado no
 * meio do caminho volta na próxima rodada em vez de se perder — repetir é
 * barato (aplicar é idempotente), perder não teria conserto.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' })

  let session
  try {
    session = await readSession(req)
  } catch (error) {
    console.error('api/sync sessão:', error)
    return res.status(500).json({ error: 'falha ao consultar a sessão' })
  }
  if (!session) return res.status(401).json({ error: 'não autenticado' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const since = typeof body.since === 'string' ? body.since : null
  const rawChanges = Array.isArray(body.changes) ? body.changes : []
  const copies = Array.isArray(body.copies) ? body.copies.filter((c) => typeof c === 'string') : null

  const accepted: Change[] = []
  const rejected: number[] = []
  rawChanges.forEach((raw, index) => {
    const change = parseChange(raw)
    if (change) accepted.push(change)
    else rejected.push(index)
  })

  const client = db()
  const stamp = new Date().toISOString()
  const cursor = stamp

  try {
    const writes: InStatement[] = accepted.map((change) => toStatement(change, stamp))

    if (copies) {
      writes.push({
        sql: 'DELETE FROM book_copies WHERE device_id = ?',
        args: [session.deviceId],
      })
      for (const bookId of copies) {
        writes.push({
          sql: 'INSERT OR REPLACE INTO book_copies (book_id, device_id, added_at) VALUES (?, ?, ?)',
          args: [bookId, session.deviceId, stamp],
        })
      }
    }

    if (writes.length > 0) await client.batch(writes, 'write')

    const [books, progress, annotations, copyRows] = await client.batch(
      [
        since
          ? { sql: 'SELECT * FROM books WHERE synced_at > ?', args: [since] }
          : { sql: 'SELECT * FROM books', args: [] },
        since
          ? { sql: 'SELECT * FROM reading_progress WHERE synced_at > ?', args: [since] }
          : { sql: 'SELECT * FROM reading_progress', args: [] },
        since
          ? { sql: 'SELECT * FROM annotations WHERE synced_at > ?', args: [since] }
          : { sql: 'SELECT * FROM annotations', args: [] },
        {
          sql: `SELECT c.book_id, c.device_id, d.name AS device_name
                  FROM book_copies c JOIN devices d ON d.id = c.device_id`,
          args: [],
        },
      ],
      'read',
    )

    const changes: Change[] = [
      ...books.rows.map((row) => ({ entity: 'book' as const, data: rowToBook(row) })),
      ...progress.rows.map((row) => ({ entity: 'progress' as const, data: rowToProgress(row) })),
      ...annotations.rows.map((row) => ({
        entity: 'annotation' as const,
        data: rowToAnnotation(row),
      })),
    ]

    return res.status(200).json({
      cursor,
      changes,
      rejected,
      copies: copyRows.rows.map((row) => ({
        bookId: String(row.book_id),
        deviceId: String(row.device_id),
        deviceName: String(row.device_name),
      })),
    })
  } catch (error) {
    console.error('api/sync:', error)
    return res.status(500).json({ error: 'falha ao sincronizar' })
  }
}

function toStatement(change: Change, stamp: string): InStatement {
  if (change.entity === 'book') {
    const b = change.data
    return {
      sql: `INSERT INTO books (id, title, author, format, language, cover_url, file_size,
                               spine_count, status, tags, added_at, updated_at, synced_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title, author = excluded.author, language = excluded.language,
              cover_url = excluded.cover_url, file_size = excluded.file_size,
              spine_count = excluded.spine_count, status = excluded.status,
              tags = excluded.tags,
              updated_at = excluded.updated_at, synced_at = excluded.synced_at,
              deleted_at = excluded.deleted_at
            WHERE excluded.updated_at > books.updated_at`,
      args: [
        b.id, b.title, b.author, b.format, b.language, b.coverUrl, b.fileSize,
        b.spineCount, b.status, JSON.stringify(b.tags ?? []), b.addedAt, b.updatedAt, stamp,
        b.deletedAt,
      ],
    }
  }

  if (change.entity === 'progress') {
    const p = change.data
    return {
      sql: `INSERT INTO reading_progress (book_id, locator, percent, updated_at, synced_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(book_id) DO UPDATE SET
              locator = excluded.locator, percent = excluded.percent,
              updated_at = excluded.updated_at, synced_at = excluded.synced_at
            WHERE excluded.updated_at > reading_progress.updated_at`,
      args: [p.bookId, JSON.stringify(p.locator), p.percent, p.updatedAt, stamp],
    }
  }

  const a = change.data
  return {
    sql: `INSERT INTO annotations (id, book_id, type, color, anchor, quoted_text, note_text,
                                   created_at, updated_at, synced_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type, color = excluded.color, anchor = excluded.anchor,
            quoted_text = excluded.quoted_text, note_text = excluded.note_text,
            updated_at = excluded.updated_at, synced_at = excluded.synced_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at > annotations.updated_at`,
    args: [
      a.id, a.bookId, a.type, a.color, JSON.stringify(a.anchor), a.quotedText, a.noteText,
      a.createdAt, a.updatedAt, stamp, a.deletedAt,
    ],
  }
}
