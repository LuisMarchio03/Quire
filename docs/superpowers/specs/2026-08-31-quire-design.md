# Quire — design

**Data:** 2026-08-31
**Status:** aprovado

## O que é

Um leitor de livros pessoal, instalável como PWA no celular e no computador, onde
a biblioteca é formada pelos arquivos que o próprio dono joga dentro dela. Você
adiciona um PDF ou um EPUB e ele passa a ser um livro de verdade: abre na página
onde você parou, tem tipografia ajustável, destaques coloridos, notas e marcas de
página, e um modo de foco que escurece tudo menos o parágrafo que você está lendo.

Não há loja, catálogo nem DRM. O acervo é o que você já tem.

## Decisões de produto

| Decisão | Escolha |
|---|---|
| Formatos | EPUB e PDF |
| Onde mora o arquivo | Só no dispositivo (IndexedDB) |
| O que sincroniza | Metadados, capa, progresso e anotações (Turso) |
| Usuários | Um só — o dono |
| Técnicas de leitura | Modo foco + tipografia ajustável |

Ficam **fora** desta versão, deliberadamente: TTS, RSVP, bionic reading, coleções
e estantes, métricas de WPM, formatos MOBI/AZW3.

## Arquitetura

### Local-first com espelho de metadados

O app funciona inteiro sem rede. O arquivo do livro e o texto renderizado nunca
saem do aparelho. O Turso guarda um espelho leve: título, autor, capa em
miniatura, progresso e anotações.

Toda escrita é aplicada primeiro no banco local e enfileirada numa *outbox*. Um
sincronizador drena a fila quando há rede e puxa as mudanças do servidor por
`updated_at`. Conflito entre dois dispositivos resolve por última escrita vence,
registro a registro — é um app de um usuário só, e a colisão real (o mesmo livro
aberto em dois aparelhos ao mesmo tempo) é rara e barata de perder.

Exclusão propaga por `deleted_at`, nunca por remoção física, senão o dispositivo
offline ressuscita o que foi apagado.

### Identidade do livro é o conteúdo

O `id` de um livro é o SHA-256 do arquivo, calculado em blocos no navegador.

Isso resolve a consequência da escolha "arquivo só no dispositivo". No celular, a
estante mostra todos os livros — com capa, progresso e anotações, que vieram do
Turso — e marca como indisponíveis os que não têm arquivo local. Ao adicionar ali
o mesmo arquivo, o hash bate e o livro reencontra o próprio histórico. Sem
duplicata e sem reconfiguração.

Um arquivo diferente do mesmo título é outro livro. É o comportamento correto:
âncoras de destaque não sobrevivem a uma edição diferente.

### Persistência do arquivo

Os bytes vão para IndexedDB, atrás de uma interface `BookStore`
(`put`, `get`, `has`, `delete`, `usage`). IndexedDB — e não OPFS — porque o
Safari do iPhone só escreve em OPFS por *sync access handle* dentro de worker, e
a compatibilidade não vale a complexidade para arquivos desse tamanho.

Navegadores despejam armazenamento sob pressão de disco. No primeiro upload o app
chama `navigator.storage.persist()` e, se o navegador negar, mostra um aviso
permanente na estante explicando o risco. A tela de armazenamento mostra o espaço
usado e permite remover o arquivo de um livro sem perder as anotações.

Trocar para armazenamento em nuvem depois é escrever outro adaptador de
`BookStore` — não refazer o app.

### Motor de leitura

Uma interface comum, dois motores:

```
open(source) → Book
goTo(locator) / next() / prev()
locate() → Locator
search(query) → Match[]
applyTheme(theme)
selectionToAnchor(selection) → Anchor
anchorToRects(anchor) → Rect[]
```

**PDF** usa `pdfjs-dist`: a página é desenhada em canvas e a camada de texto do
pdf.js fica por cima, invisível, para dar seleção e destaque.

**EPUB** usa motor próprio: `fflate` descompacta, o app lê `container.xml` e o
OPF para montar spine, metadados e sumário, e cada capítulo é renderizado num
`<iframe sandbox>` paginado por CSS `columns`.

Motor próprio, e não epub.js, porque o modo foco precisa manipular o DOM do
conteúdo — envolver parágrafos, medir linhas, aplicar transições — e porque a
tipografia ajustável tem que reagir sem quebrar a paginação. epub.js subiria mais
rápido e cobraria a dívida exatamente no diferencial do app.

### Segurança

EPUB é HTML arbitrário vindo de um arquivo que o usuário pegou em qualquer lugar.
O conteúdo sempre renderiza em `<iframe sandbox="allow-same-origin">` — sem
`allow-scripts`, nunca. Recursos internos (imagens, CSS, fontes) são servidos por
blob URLs criadas a partir do zip; nada de rede sai do iframe.

O parsing do EPUB e o cálculo de hash rodam em Web Worker, para não travar a
interface com um arquivo de 80 MB.

### Autenticação

Um usuário, senha única. O servidor guarda o hash e devolve um token opaco em
cookie `httpOnly`; a sessão vive na tabela `sessions`.

O celular entra por **pareamento**: o computador já logado gera um código de seis
dígitos válido por poucos minutos, e o celular troca esse código por sessão
própria. Mesmo padrão de `login.ts`/`parear.ts` do Macronaut.

## Modelo de dados (Turso)

```sql
devices(id, name, user_agent, created_at, last_seen_at)
sessions(token_hash, device_id, created_at, expires_at)
pairing_codes(code_hash, created_at, expires_at, used_at)

books(
  id            TEXT PRIMARY KEY,   -- SHA-256 do arquivo
  title, author, format,            -- 'epub' | 'pdf'
  language, cover_webp BLOB,        -- miniatura ~40 KB
  file_size, spine_count,
  status,                           -- 'unread' | 'reading' | 'finished'
  added_at, updated_at, deleted_at
)

book_copies(book_id, device_id, added_at)   -- quem tem o arquivo

reading_progress(
  book_id PRIMARY KEY, locator JSON, percent, updated_at
)

annotations(
  id, book_id, type,                -- 'highlight' | 'note' | 'bookmark'
  color, anchor JSON, quoted_text, note_text,
  created_at, updated_at, deleted_at
)
```

O espelho local em IndexedDB tem as mesmas tabelas mais `outbox` e `sync_state`.

### Âncoras

Um destaque precisa sobreviver a mudança de fonte, de tamanho e de tela — a
posição em pixels não serve.

**EPUB:** índice do capítulo no spine, caminho do nó de texto até a raiz, offset
inicial e final, mais o texto citado. Na abertura o app tenta o caminho; se o
documento mudou, procura o texto citado no capítulo e reancora. Se não achar, o
destaque fica marcado como órfão em vez de sumir.

**PDF:** número da página e retângulos normalizados pela caixa da página, mais o
texto extraído. Como o PDF tem layout fixo, isso é estável.

## Interface

**Estante** — grade de capas, busca por título e autor, filtro por status,
indicador de "arquivo não está neste dispositivo". Adicionar livro por botão ou
arrastando o arquivo na janela.

**Leitor** — tela cheia, sem cromo. Um toque no centro abre os controles; um toque
nas laterais vira página; deslizar navega. Barra inferior com progresso do
capítulo e do livro.

**Ajustes de leitura** — fonte (serifada, sem serifa, OpenDyslexic), tamanho,
entrelinha, largura da coluna, margens, justificação e hifenização, e cinco temas
(claro, sépia, cinza, escuro, preto OLED).

**Modo foco** — escurece o conteúdo fora do parágrafo atual, com uma régua opcional
sob a linha. Avança conforme a leitura. Desliga num toque.

**Anotações** — seleção abre paleta de quatro cores, nota e cópia. Painel lateral
lista destaques, notas e marcas do livro, com busca; exportação em Markdown.

## Stack

React 19, Vite, TypeScript, Tailwind 4, PWA por `vite-plugin-pwa`. Funções
serverless em `api/` para Vercel, Turso por `@libsql/client`, testes em Vitest com
Testing Library.

```
src/features/{library,reader,annotations,settings,sync}/
src/lib/{store,api,hash,epub,pdf}/
api/{login,pair,sync}.ts   api/_lib/
scripts/setup-db.ts
```

## Testes

TDD onde o erro é caro e o teste é barato — lógica pura:

- hash de arquivo em blocos, com arquivo grande
- parsing de EPUB: container, OPF, spine, sumário, metadados, capa
- âncoras: seleção → âncora → retângulos, ida e volta; reancoragem por texto
  citado; marcação de órfã
- outbox: ordem, retentativa, idempotência
- merge de sync: última escrita vence, propagação de `deleted_at`
- paginação: contagem de páginas estável ao mudar tipografia

Componentes de leitura têm teste de fumaça (abre, navega, destaca, persiste). O
render fiel de EPUB e PDF não é testado por unidade — é verificado à mão.

## Riscos

**Motor EPUB próprio é o item mais caro.** Mitigação: entregar navegação por
capítulo antes da paginação por colunas, para haver leitor utilizável cedo.

**Despejo de armazenamento pelo navegador.** Mitigação: `persist()`, aviso visível
e a garantia de que anotações nunca dependem do arquivo local.

**EPUB fora do padrão.** Mitigação: falhar com mensagem clara e não corromper a
estante — o livro entra marcado como não suportado.
