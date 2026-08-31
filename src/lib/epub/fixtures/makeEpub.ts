import { zipSync, type Zippable } from 'fflate'

const encode = (text: string) => new TextEncoder().encode(text)

export interface Chapter {
  /** Caminho relativo ao diretório do OPF. */
  href: string
  title: string
  body: string
}

export interface MakeEpubOptions {
  title?: string
  author?: string | null
  language?: string
  /** 3 usa nav.xhtml; 2 usa toc.ncx. */
  version?: 2 | 3
  chapters?: Chapter[]
  /** Caminho do OPF dentro do zip — serve para testar href relativo. */
  opfPath?: string
  cover?: 'properties' | 'meta' | 'none'
  containerXml?: string | null
  extraFiles?: Record<string, Uint8Array>
}

const DEFAULT_CHAPTERS: Chapter[] = [
  { href: 'text/c1.xhtml', title: 'Capítulo um', body: '<p>Era uma vez um começo.</p>' },
  { href: 'text/c2.xhtml', title: 'Capítulo dois', body: '<p>Depois veio o meio.</p>' },
]

/** Monta um EPUB válido em memória, para os testes não dependerem de arquivo real. */
export function makeEpub(options: MakeEpubOptions = {}): Uint8Array {
  const {
    title = 'Livro de Teste',
    author = 'Autora Exemplo',
    language = 'pt-BR',
    version = 3,
    chapters = DEFAULT_CHAPTERS,
    opfPath = 'OEBPS/content.opf',
    cover = 'properties',
    containerXml,
    extraFiles = {},
  } = options

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''
  const inDir = (relative: string) => (opfDir ? `${opfDir}/${relative}` : relative)

  const files: Zippable = {
    mimetype: [encode('application/epub+zip'), { level: 0 }],
    ...extraFiles,
  }

  if (containerXml !== null) {
    files['META-INF/container.xml'] =
      containerXml !== undefined
        ? encode(containerXml)
        : encode(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
  }

  chapters.forEach((chapter) => {
    // No zip o nome é literal; no OPF o href vai escapado. Um href com %20
    // corresponde a um arquivo com espaço de verdade.
    files[inDir(decodeURIComponent(chapter.href))] = encode(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.title}</title></head>
<body><h1>${chapter.title}</h1>${chapter.body}</body></html>`)
  })

  if (cover !== 'none') files[inDir('images/cover.png')] = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

  const manifest = chapters
    .map((c, i) => `<item id="c${i}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('\n    ')

  const coverItem =
    cover === 'properties'
      ? '<item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>'
      : cover === 'meta'
        ? '<item id="cover-img" href="images/cover.png" media-type="image/png"/>'
        : ''
  const coverMeta = cover === 'meta' ? '<meta name="cover" content="cover-img"/>' : ''

  if (version === 3) {
    const navItems = chapters
      .map((c) => `<li><a href="${c.href}">${c.title}</a></li>`)
      .join('\n        ')
    files[inDir('nav.xhtml')] = encode(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
        ${navItems}
</ol></nav></body></html>`)
  } else {
    const navPoints = chapters
      .map(
        (c, i) => `<navPoint id="np${i}" playOrder="${i + 1}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`,
      )
      .join('\n    ')
    files[inDir('toc.ncx')] = encode(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`)
  }

  const navManifest =
    version === 3
      ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
      : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
  const spineAttrs = version === 3 ? '' : ' toc="ncx"'

  files[opfPath] = encode(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:teste</dc:identifier>
    <dc:title>${title}</dc:title>
    ${author ? `<dc:creator>${author}</dc:creator>` : ''}
    <dc:language>${language}</dc:language>
    ${coverMeta}
  </metadata>
  <manifest>
    ${navManifest}
    ${coverItem}
    ${manifest}
  </manifest>
  <spine${spineAttrs}>
    ${spine}
  </spine>
</package>`)

  return zipSync(files)
}
