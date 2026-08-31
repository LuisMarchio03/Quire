// Gera o valor de QUIRE_PASSWORD_HASH a partir da senha digitada.
// Uso: npm run hash-password
import { createInterface } from 'node:readline/promises'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const ITERATIONS = 210_000

const rl = createInterface({ input: process.stdin, output: process.stdout })
const password = (await rl.question('Senha de acesso ao Quire: ')).trim()
rl.close()

if (password.length < 8) {
  console.error('Use pelo menos 8 caracteres.')
  process.exit(1)
}

const salt = randomBytes(16)
const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
const encode = (b: Buffer) => b.toString('base64url')

console.log('\nCole no .env.local (e nas variáveis de ambiente da Vercel):\n')
console.log(`QUIRE_PASSWORD_HASH=pbkdf2$${ITERATIONS}$${encode(salt)}$${encode(derived)}`)
