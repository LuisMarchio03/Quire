<div align="center">

# 📚 Quire

**Seu acervo, lido do seu jeito.**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)
![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-instalável-5A0FC8?logo=pwa&logoColor=white)
![Testes](https://img.shields.io/badge/testes-399%20passando-3FB950)

</div>

---

## O que é

Um leitor de livros pessoal, instalável no celular e no computador, cuja
biblioteca é formada pelos arquivos que você mesmo joga dentro. Você adiciona um
EPUB ou um PDF e ele passa a ser um livro de verdade: abre onde você parou, tem
tipografia ajustável, destaques coloridos, notas, marcas de página e um modo de
foco que escurece tudo menos o parágrafo que você está lendo.

Não há loja, catálogo nem DRM. O acervo é o que você já tem.

*Quire*, em encadernação, é o caderno de folhas dobradas que vira um livro.

## Como funciona

O arquivo do livro **nunca sai do aparelho** — fica em IndexedDB, e o app lê
tudo offline. O que viaja entre seus aparelhos, pelo Turso, é o leve: título,
autor, capa em miniatura, progresso de leitura e todas as anotações.

O `id` de cada livro é o **SHA-256 do arquivo**. É isso que faz a estante do
celular mostrar um livro que você adicionou no computador — com capa, progresso
e destaques — marcado como indisponível ali. Quando você escolhe o mesmo arquivo
naquele aparelho, o hash bate e o livro reencontra o próprio histórico. Sem
duplicata e sem reconfiguração.

Nem sempre o mesmo livro chega aos dois aparelhos como o mesmo arquivo — baixado
de novo, salvo por outro caminho, com metadado mexido, o hash muda. Quando a
estante vê dois livros com o mesmo formato, a mesma contagem de páginas e um
título parecido, ela pergunta se é o mesmo livro e oferece **juntar**: fica um
só, com o progresso mais recente, as anotações e as etiquetas dos dois, e cada
aparelho continua usando o arquivo que já tinha. O hash do outro arquivo vira
um *alias* do livro, então reimportá-lo em qualquer aparelho reencontra o livro
certo. *Adicionar arquivo aqui* com um arquivo parecido, mas não idêntico, faz a
mesma oferta.

Toda escrita é aplicada primeiro no aparelho e entra numa fila que sobe quando há
rede. Conflito entre dois aparelhos resolve por última escrita vence, registro a
registro. A estante se atualiza quando a sincronização traz algo; fechar um
livro sobe a posição na hora; e o app sincroniza ao voltar para o primeiro
plano no celular.

## Funcionalidades

- **EPUB e PDF.** EPUB com paginação de verdade, por colunas, e motor próprio.
  PDF com camada de texto selecionável e inversão de cores para leitura noturna.
- **Tipografia ajustável.** Fonte serifada, sem serifa ou espaçada para leitura
  fácil; tamanho, entrelinha, margem, largura da coluna, justificação e
  hifenização.
- **Cinco temas.** Claro, sépia, cinza, escuro e preto para telas OLED.
- **Modo foco.** Escurece o texto fora do parágrafo em leitura, com régua
  opcional sob a linha. As setas ↑ ↓ movem o foco.
- **Destaques, notas e marcas de página**, com âncoras que sobrevivem a mudança
  de fonte, de tela e de paginação — e que se reancoram pelo texto citado quando
  o documento muda.
- **Etiquetas livres**, com fichas clicáveis na estante que se combinam, e um
  campo de busca só que casa título, autor e etiqueta. EPUB traz as etiquetas
  sugeridas do próprio metadado.
- **O mesmo livro, arquivos diferentes.** A estante percebe quando um livro
  entrou duas vezes por arquivos distintos e oferece juntar os dois — o
  progresso passa a ser um só em todos os aparelhos.
- **Tamanho da interface ajustável** (80% a 150%), por atalho, pinça ou ajustes.
- **Busca dentro do livro**, ignorando acento e caixa.
- **Exportação em Markdown** de tudo que você marcou.
- **PWA instalável**, que funciona offline por inteiro.

## Rodando localmente

```bash
npm install
```

### 1. Banco no Turso

```bash
turso db create quire
turso db show quire --url          # copie a URL
turso db tokens create quire       # copie o token
```

Crie o `.env.local` a partir do `.env.example`:

```ini
TURSO_DATABASE_URL=libsql://quire-SEU-USUARIO.turso.io
TURSO_AUTH_TOKEN=...
QUIRE_PASSWORD_HASH=
```

Aplique o esquema (é idempotente, pode rodar quantas vezes quiser):

```bash
npm run db:setup
```

### 2. Senha de acesso

```bash
npm run hash-password                     # pergunta a senha
echo -n "sua senha" | npm run hash-password   # ou lê da entrada padrão
```

Cole a linha gerada em `QUIRE_PASSWORD_HASH`. A senha em si não é guardada em
lugar nenhum — só o derivado PBKDF2-SHA256 com 210 000 iterações.

### 3. Subir

```bash
npm run dev      # http://localhost:5273
npm test         # 399 testes
npm run build
```

## Publicando na Vercel

O projeto já tem `vercel.json`. Importe o repositório na Vercel e configure as
três variáveis de ambiente (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`QUIRE_PASSWORD_HASH`) para Production e Preview. O build é `npm run build` e a
saída é `dist/`.

## Usando no celular

No computador já autenticado, abra **Ajustes → Parear outro aparelho** e gere um
código de seis dígitos. No celular, abra o app, toque em *Entrar com código de
pareamento* e digite. O código vale dez minutos e serve uma vez só.

Depois, use *Adicionar à tela de início* para instalar o PWA.

## Estrutura

```
src/lib/          hash, epub, reader (motores), anchor, library (importação,
                  gêmeos, junção, aliases), store, sync, api
src/features/     library, reader, annotations, auth, settings
api/              funções serverless: login, pair, me, sync
api/_lib/         cliente Turso, sessão, autenticação, merge, esquema SQL
scripts/          setup-db, hash-password, make-icons
docs/superpowers/ design e plano de implementação
```

## Decisões que valem explicação

**Motor de EPUB próprio, e não epub.js.** O modo foco precisa manipular o DOM do
capítulo — envolver parágrafos, medir, aplicar transições — e a tipografia
ajustável precisa reagir sem quebrar a paginação. Uma biblioteca de terceiros
com manutenção parada cobraria a dívida exatamente no diferencial do app.

**EPUB roda em `<iframe sandbox>` sem `allow-scripts`.** Um EPUB é HTML de
procedência desconhecida. Além do sandbox, `<script>`, `<object>`, `<embed>` e
atributos `on*` são removidos antes de o conteúdo ser injetado.

**Dois carimbos de tempo por registro.** `updated_at` vem do aparelho e decide
quem vence um conflito; `synced_at` é escrito pelo servidor e é o que move o
cursor de sincronização. Se o cursor usasse o relógio do aparelho, um celular
adiantado faria o outro aparelho pular escritas para sempre.

**Âncoras medidas em caracteres na hora de criar.** Enquanto os destaques estão
pintados, a árvore do DOM muda mas o texto não. Medir a seleção em caracteres
atravessa essa diferença.

## Licença

MIT
