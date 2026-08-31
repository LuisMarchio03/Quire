// Gera os ícones do PWA sem dependência externa: rasteriza formas com
// supersampling 4x e escreve PNG com zlib nativo.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// Retângulo arredondado rotacionado, em coordenadas normalizadas 0..1.
function makeSheet({ cx, cy, w, h, angle, radius }) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const lx = Math.abs(dx * cos + dy * sin)
    const ly = Math.abs(-dx * sin + dy * cos)
    const hw = w / 2 - radius
    const hh = h / 2 - radius
    const qx = Math.max(lx - hw, 0)
    const qy = Math.max(ly - hh, 0)
    return Math.hypot(qx, qy) <= radius && lx <= w / 2 && ly <= h / 2
  }
}

const BG = hex('#16120e')
const SHEETS = [
  { shape: { cx: 0.425, cy: 0.505, w: 0.36, h: 0.53, angle: -0.25, radius: 0.038 }, color: hex('#8a6533') },
  { shape: { cx: 0.478, cy: 0.5, w: 0.36, h: 0.53, angle: -0.11, radius: 0.038 }, color: hex('#b5843f') },
  { shape: { cx: 0.532, cy: 0.497, w: 0.36, h: 0.53, angle: 0.05, radius: 0.038 }, color: hex('#f0c179') },
]

function render(size, { padded }) {
  const ss = 4
  const n = size * ss
  const tests = SHEETS.map((s) => ({ hit: makeSheet(s.shape), color: s.color }))
  const scale = padded ? 0.78 : 1
  const out = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = 0.5 + ((px * ss + sx + 0.5) / n - 0.5) / scale
          const y = 0.5 + ((py * ss + sy + 0.5) / n - 0.5) / scale
          let c = BG
          for (const t of tests) if (t.hit(x, y)) c = t.color
          r += c[0]; g += c[1]; b += c[2]
        }
      }
      const i = (py * size + px) * 4
      const k = ss * ss
      out[i] = Math.round(r / k)
      out[i + 1] = Math.round(g / k)
      out[i + 2] = Math.round(b / k)
      out[i + 3] = 255
    }
  }
  return encodePng(size, size, out)
}

writeFileSync('public/icon-192.png', render(192, { padded: false }))
writeFileSync('public/icon-512.png', render(512, { padded: false }))
writeFileSync('public/icon-maskable-512.png', render(512, { padded: true }))
console.log('ícones gerados em public/')
