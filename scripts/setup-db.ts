// Cria (ou atualiza) o esquema do Quire no Turso. Idempotente.
// Uso: npm run db:setup
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error('Faltam TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no .env.local.')
  process.exit(1)
}

const schemaPath = fileURLToPath(new URL('../api/_lib/schema.sql', import.meta.url))
const client = createClient({ url, authToken })

await client.executeMultiple(readFileSync(schemaPath, 'utf8'))

// `CREATE TABLE IF NOT EXISTS` não toca em tabela que já existe, então coluna
// nova precisa ser acrescentada à parte para um banco antigo alcançar o esquema.
const MIGRACOES: Array<{ tabela: string; coluna: string; definicao: string }> = [
  { tabela: 'books', coluna: 'tags', definicao: "TEXT NOT NULL DEFAULT '[]'" },
  { tabela: 'books', coluna: 'aliases', definicao: "TEXT NOT NULL DEFAULT '[]'" },
]

for (const { tabela, coluna, definicao } of MIGRACOES) {
  const { rows } = await client.execute(`PRAGMA table_info(${tabela})`)
  if (rows.some((row) => row.name === coluna)) continue
  await client.execute(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`)
  console.log(`Coluna ${tabela}.${coluna} acrescentada.`)
}

const { rows } = await client.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
)
console.log(`Esquema aplicado em ${url}`)
for (const row of rows) console.log(`  • ${row.name}`)
client.close()
