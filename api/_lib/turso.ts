import { createClient, type Client } from '@libsql/client'

let cached: Client | null = null

export function db(): Client {
  if (cached) return cached
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) throw new Error('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são obrigatórios')
  cached = createClient({ url, authToken })
  return cached
}
