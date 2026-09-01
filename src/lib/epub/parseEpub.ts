import { unzipSync } from 'fflate'

export class UnsupportedEpubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEpubError'
  }
}

export interface EpubResource {
  path: string
  bytes: Uint8Array
  mediaType: string
}

export interface SpineItem {
  id: string
  /** Caminho já resolvido dentro do zip. */
  href: string
  mediaType: string
}

export interface TocEntry {
  label: string
  href: string
  children: TocEntry[]
}

export interface EpubMetadata {
  title: string
  author: string | null
  language: string | null
  /** `dc:subject` — o assunto que a editora declarou. Vira etiqueta sugerida. */
  subjects: string[]
}

export interface EpubBook {
  metadata: EpubMetadata
  spine: SpineItem[]
  toc: TocEntry[]
  coverPath: string | null
  opfDir: string
  resource(path: string): EpubResource | undefined
  /** Resolve um href relativo a partir do documento que o cita. */
  resolveFrom(fromPath: string, href: string): string
}

/** Normaliza `a/b/../c` para `a/c` e tira `./`. */
function normalize(path: string): string {
  const parts: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function join(dir: string, href: string): string {
  const clean = decodeHref(href).split('#')[0]
  if (!clean) return ''
  return normalize(dir ? `${dir}/${clean}` : clean)
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

/**
 * Busca por nome local, ignorando prefixo de namespace. EPUBs no mundo real
 * usam `opf:`, `dc:`, prefixo nenhum e combinações — casar pelo nome local é o
 * único caminho que funciona nos três casos.
 */
function byLocalName(root: Element | Document, name: string): Element[] {
  const wanted = name.toLowerCase()
  const found: Element[] = []
  const walk = (node: Element) => {
    if (node.localName?.toLowerCase() === wanted) found.push(node)
    for (const child of Array.from(node.children)) walk(child)
  }
  const start = 'documentElement' in root ? root.documentElement : root
  if (start) walk(start)
  return found
}

const firstText = (root: Element | Document, name: string): string | null => {
  const text = byLocalName(root, name)[0]?.textContent?.trim()
  return text || null
}

function parseXml(bytes: Uint8Array, what: string): Document {
  const text = new TextDecoder('utf-8').decode(bytes)
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new UnsupportedEpubError(`${what} está mal formado`)
  }
  return doc
}

export async function parseEpub(bytes: Uint8Array): Promise<EpubBook> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new UnsupportedEpubError('o arquivo não é um zip válido')
  }

  // Indexa cada entrada pelo nome literal e pela versão decodificada: há EPUB
  // por aí com o caminho escapado dentro do próprio zip, e o href do OPF pode
  // vir dos dois jeitos.
  const files = new Map<string, Uint8Array>()
  for (const [path, content] of Object.entries(entries)) {
    const literal = normalize(path)
    files.set(literal, content)
    const decoded = normalize(decodeHref(path))
    if (decoded !== literal && !files.has(decoded)) files.set(decoded, content)
  }

  const containerBytes = files.get('META-INF/container.xml')
  if (!containerBytes) throw new UnsupportedEpubError('falta META-INF/container.xml')

  const container = parseXml(containerBytes, 'container.xml')
  const opfPath = byLocalName(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new UnsupportedEpubError('container.xml não aponta para o pacote')

  const opfNormalized = normalize(decodeHref(opfPath))
  const opfBytes = files.get(opfNormalized)
  if (!opfBytes) throw new UnsupportedEpubError(`pacote ${opfPath} não está no arquivo`)

  const opf = parseXml(opfBytes, 'o pacote OPF')
  const opfDir = dirOf(opfNormalized)

  const metadataEl = byLocalName(opf, 'metadata')[0]
  const metadata: EpubMetadata = {
    title: (metadataEl && firstText(metadataEl, 'title')) ?? 'Sem título',
    author: metadataEl ? firstText(metadataEl, 'creator') : null,
    language: metadataEl ? firstText(metadataEl, 'language') : null,
    subjects: metadataEl
      ? byLocalName(metadataEl, 'subject')
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
      : [],
  }

  interface ManifestItem {
    id: string
    href: string
    mediaType: string
    properties: string
  }
  const manifest = new Map<string, ManifestItem>()
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      id,
      href: join(opfDir, href),
      mediaType: item.getAttribute('media-type') ?? 'application/octet-stream',
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spine: SpineItem[] = []
  for (const ref of byLocalName(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref') ?? '')
    if (item && files.has(item.href)) {
      spine.push({ id: item.id, href: item.href, mediaType: item.mediaType })
    }
  }
  if (spine.length === 0) throw new UnsupportedEpubError('o livro não tem capítulos legíveis')

  const coverPath = findCover(opf, manifest, files)
  const toc = readToc(opf, manifest, files)

  const resource = (path: string): EpubResource | undefined => {
    const normalized = normalize(decodeHref(path)).split('#')[0]
    const content = files.get(normalized)
    if (!content) return undefined
    const item = [...manifest.values()].find((i) => i.href === normalized)
    return {
      path: normalized,
      bytes: content,
      mediaType: item?.mediaType ?? guessMediaType(normalized),
    }
  }

  return {
    metadata,
    spine,
    toc,
    coverPath,
    opfDir,
    resource,
    resolveFrom: (fromPath, href) => join(dirOf(normalize(fromPath)), href),
  }
}

function findCover(
  opf: Document,
  manifest: Map<string, { href: string; properties: string }>,
  files: Map<string, Uint8Array>,
): string | null {
  for (const item of manifest.values()) {
    if (item.properties.split(/\s+/).includes('cover-image') && files.has(item.href)) {
      return item.href
    }
  }
  for (const meta of byLocalName(opf, 'meta')) {
    if (meta.getAttribute('name') !== 'cover') continue
    const item = manifest.get(meta.getAttribute('content') ?? '')
    if (item && files.has(item.href)) return item.href
  }
  return null
}

function readToc(
  opf: Document,
  manifest: Map<string, { id: string; href: string; properties: string }>,
  files: Map<string, Uint8Array>,
): TocEntry[] {
  const navItem = [...manifest.values()].find((i) => i.properties.split(/\s+/).includes('nav'))
  if (navItem) {
    const bytes = files.get(navItem.href)
    if (bytes) {
      try {
        return readNavDocument(parseXml(bytes, 'o sumário'), dirOf(navItem.href))
      } catch {
        /* sumário quebrado não impede a leitura do livro */
      }
    }
  }

  const spineEl = byLocalName(opf, 'spine')[0]
  const ncxItem = manifest.get(spineEl?.getAttribute('toc') ?? '')
  const ncxBytes = ncxItem && files.get(ncxItem.href)
  if (ncxBytes) {
    try {
      return readNcx(parseXml(ncxBytes, 'o sumário'), dirOf(ncxItem!.href))
    } catch {
      /* idem */
    }
  }

  return []
}

function readNavDocument(doc: Document, baseDir: string): TocEntry[] {
  const navs = byLocalName(doc, 'nav')
  const toc =
    navs.find((n) => (n.getAttribute('epub:type') ?? n.getAttribute('type')) === 'toc') ?? navs[0]
  const list = toc && byLocalName(toc, 'ol')[0]
  return list ? readNavList(list, baseDir) : []
}

function readNavList(list: Element, baseDir: string): TocEntry[] {
  const entries: TocEntry[] = []
  for (const li of Array.from(list.children).filter((c) => c.localName === 'li')) {
    const anchor = Array.from(li.children).find((c) => c.localName === 'a')
    const nested = Array.from(li.children).find((c) => c.localName === 'ol')
    if (!anchor) continue
    entries.push({
      label: anchor.textContent?.trim() ?? '',
      href: join(baseDir, anchor.getAttribute('href') ?? ''),
      children: nested ? readNavList(nested, baseDir) : [],
    })
  }
  return entries
}

function readNcx(doc: Document, baseDir: string): TocEntry[] {
  const navMap = byLocalName(doc, 'navMap')[0]
  if (!navMap) return []

  const readPoints = (parent: Element): TocEntry[] =>
    Array.from(parent.children)
      .filter((c) => c.localName === 'navPoint')
      .map((point) => ({
        label: byLocalName(point, 'text')[0]?.textContent?.trim() ?? '',
        href: join(baseDir, byLocalName(point, 'content')[0]?.getAttribute('src') ?? ''),
        children: readPoints(point),
      }))

  return readPoints(navMap)
}

const MEDIA_TYPES: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  html: 'text/html',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

function guessMediaType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return MEDIA_TYPES[extension] ?? 'application/octet-stream'
}
