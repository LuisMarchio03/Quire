import { describe, expect, it } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('devolve o hash conhecido de "abc"', async () => {
    const blob = new Blob([new TextEncoder().encode('abc')])
    expect(await sha256Hex(blob)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('devolve o hash conhecido da entrada vazia', async () => {
    expect(await sha256Hex(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('devolve o hash conhecido de uma entrada maior que um bloco de 64 bytes', async () => {
    const text = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
    expect(await sha256Hex(new Blob([new TextEncoder().encode(text)]))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('lê arquivo maior que um bloco de leitura e relata progresso crescente até 1', async () => {
    const big = new Blob([new Uint8Array(9 * 1024 * 1024).fill(7)])
    const fractions: number[] = []
    const hash = await sha256Hex(big, (f) => fractions.push(f))
    expect(hash).toHaveLength(64)
    expect(fractions.length).toBeGreaterThan(1)
    expect(fractions.at(-1)).toBe(1)
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b))
  })

  it('arquivos com o mesmo conteúdo têm o mesmo hash e conteúdos diferentes não', async () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 5])
    expect(await sha256Hex(new Blob([a]))).toBe(await sha256Hex(new Blob([a])))
    expect(await sha256Hex(new Blob([a]))).not.toBe(await sha256Hex(new Blob([b])))
  })
})
