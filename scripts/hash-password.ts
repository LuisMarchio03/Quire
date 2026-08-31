// Gera o valor de QUIRE_PASSWORD_HASH a partir de uma senha.
//
//   npm run hash-password                    # pergunta a senha
//   echo -n "senha" | npm run hash-password  # lê da entrada padrão
//
// A senha nunca vira argumento de linha de comando de propósito: argumento
// fica no histórico do shell e aparece na lista de processos.
import { createInterface } from 'node:readline/promises'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const ITERATIONS = 210_000

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8').trim()
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const answer = await rl.question('Senha de acesso ao Quire: ')
  rl.close()
  return answer.trim()
}

const password = await readPassword()

if (password.length < 8) {
  console.error('Use pelo menos 8 caracteres.')
  process.exit(1)
}

const salt = randomBytes(16)
const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
const encode = (b: Buffer) => b.toString('base64url')

console.log(`QUIRE_PASSWORD_HASH=pbkdf2$${ITERATIONS}$${encode(salt)}$${encode(derived)}`)
