-- Esquema do Quire no Turso. Idempotente: pode rodar quantas vezes quiser.
-- Todo timestamp é ISO-8601 UTC em TEXT. Exclusão é sempre lógica.
--
-- Dois carimbos por registro, de propósito: `updated_at` vem do aparelho e
-- decide quem vence um conflito; `synced_at` é escrito pelo servidor e é o que
-- move o cursor de sincronização. Se o cursor usasse o relógio do aparelho, um
-- celular adiantado faria o outro aparelho pular escritas para sempre.

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_device_idx ON sessions(device_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- Código de pareamento: guardado só como hash, uso único, vida curta.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash  TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,          -- SHA-256 do arquivo
  title       TEXT NOT NULL,
  author      TEXT,
  format      TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
  language    TEXT,
  cover_url   TEXT,                      -- miniatura webp em data URL
  file_size   INTEGER NOT NULL DEFAULT 0,
  spine_count INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'unread'
              CHECK (status IN ('unread', 'reading', 'finished')),
  tags        TEXT NOT NULL DEFAULT '[]',   -- JSON com as etiquetas do livro
  aliases     TEXT NOT NULL DEFAULT '[]',   -- JSON: outros hashes de arquivo que são este livro
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,               -- relógio do aparelho; resolve conflito
  synced_at   TEXT NOT NULL,               -- relógio do servidor; move o cursor
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS books_synced_idx ON books(synced_at);

-- Que aparelho tem o arquivo. Alimenta o "adicionar arquivo aqui" na estante.
CREATE TABLE IF NOT EXISTS book_copies (
  book_id   TEXT NOT NULL,
  device_id TEXT NOT NULL,
  added_at  TEXT NOT NULL,
  PRIMARY KEY (book_id, device_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  book_id    TEXT PRIMARY KEY,
  locator    TEXT NOT NULL,              -- JSON do Locator
  percent    REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  synced_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS progress_synced_idx ON reading_progress(synced_at);

CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('highlight', 'note', 'bookmark')),
  color       TEXT,
  anchor      TEXT NOT NULL,             -- JSON do Anchor
  quoted_text TEXT NOT NULL DEFAULT '',
  note_text   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  synced_at   TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS annotations_book_idx ON annotations(book_id);
CREATE INDEX IF NOT EXISTS annotations_synced_idx ON annotations(synced_at);
