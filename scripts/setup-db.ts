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

const { rows } = await client.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
)
console.log(`Esquema aplicado em ${url}`)
for (const row of rows) console.log(`  • ${row.name}`)
client.close()
