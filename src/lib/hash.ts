/**
 * SHA-256 incremental sobre um Blob.
 *
 * `crypto.subtle.digest` não aceita fluxo: exigiria carregar o arquivo inteiro
 * na memória, e um EPUB de 80 MB no celular é justamente o caso que precisa
 * funcionar. Então o digest é feito em blocos, com o estado carregado adiante.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  private block = new Uint8Array(64)
  private blockLength = 0
  private totalBytes = 0
  private w = new Uint32Array(64)

  update(data: Uint8Array): void {
    this.totalBytes += data.length
    let offset = 0

    if (this.blockLength > 0) {
      const need = 64 - this.blockLength
      const take = Math.min(need, data.length)
      this.block.set(data.subarray(0, take), this.blockLength)
      this.blockLength += take
      offset = take
      if (this.blockLength < 64) return
      this.compress(this.block, 0)
      this.blockLength = 0
    }

    for (; offset + 64 <= data.length; offset += 64) this.compress(data, offset)

    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0)
      this.blockLength = data.length - offset
    }
  }

  digest(): Uint8Array {
    const bitLength = this.totalBytes * 8
    const tail = new Uint8Array(this.blockLength < 56 ? 64 : 128)
    tail.set(this.block.subarray(0, this.blockLength), 0)
    tail[this.blockLength] = 0x80
    // O comprimento é de 64 bits; arquivos acima de 2^53 bits estão fora do escopo.
    const view = new DataView(tail.buffer)
    view.setUint32(tail.length - 8, Math.floor(bitLength / 0x100000000))
    view.setUint32(tail.length - 4, bitLength >>> 0)
    for (let i = 0; i < tail.length; i += 64) this.compress(tail, i)

    const out = new Uint8Array(32)
    const outView = new DataView(out.buffer)
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.h[i])
    return out
  }

  private compress(data: Uint8Array, offset: number): void {
    const w = this.w
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }

    let [a, b, c, d, e, f, g, h] = this.h
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + s1 + ch + K[i] + w[i]) | 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (s0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }

    const hs = this.h
    hs[0] = (hs[0] + a) | 0
    hs[1] = (hs[1] + b) | 0
    hs[2] = (hs[2] + c) | 0
    hs[3] = (hs[3] + d) | 0
    hs[4] = (hs[4] + e) | 0
    hs[5] = (hs[5] + f) | 0
    hs[6] = (hs[6] + g) | 0
    hs[7] = (hs[7] + h) | 0
  }
}

const READ_CHUNK = 8 * 1024 * 1024

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** SHA-256 de um blob, em hexadecimal minúsculo. É o `id` do livro no acervo. */
export async function sha256Hex(
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const hasher = new Sha256()
  const total = blob.size

  for (let offset = 0; offset < total; offset += READ_CHUNK) {
    const end = Math.min(offset + READ_CHUNK, total)
    hasher.update(new Uint8Array(await blob.slice(offset, end).arrayBuffer()))
    onProgress?.(end / total)
  }
  if (total === 0) onProgress?.(1)

  return toHex(hasher.digest())
}
