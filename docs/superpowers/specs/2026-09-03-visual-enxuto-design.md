# Quire — visual enxuto

**Data:** 2026-09-03
**Status:** implementado

## O pedido

"Um visual mais agradável, minimalista e moderno", partindo de uma captura do
leitor no celular em que a página do PDF aparecia como um bloco cinza sobre o
fundo marrom do app. Entre três direções (papel e tinta enxuto; grafite
neutro; claro por padrão), o dono escolheu a primeira.

## A direção: papel e tinta, só que enxuto

A identidade fica — cromo escuro e quente, dourado de acento, paletas de
leitura calibradas para leitura longa. Sai o que sobra.

### Fundamentos

- **Fundo chapado.** Some o gradiente do `body`. Uma cor de fundo, uma de
  superfície para o que precisa se destacar (campos, folhas inferiores).
- **Fios, não caixas.** Cartões com borda e preenchimento saem; seções se
  separam por rótulo pequeno em caixa alta e por espaço; listas por fio de um
  pixel em `--color-line`, agora mais discreto.
- **Ícones desenhados.** Um componente `Icon` com SVG em linha (traço de 1,75)
  substitui os símbolos de texto (◎ ☆ ✎ ⋯ ✕), que variam de aparelho para
  aparelho.
- **Literata embutida.** A serifa de leitura e dos títulos deixa de depender
  do que o aparelho tem instalado: `@fontsource-variable/literata`, só os
  subconjuntos latinos (normal e itálico, ~190 KB), pré-armazenados pelo PWA.
  A declaração `@font-face` mora em `src/lib/reader/fonts.ts` e vale tanto
  para o documento do app quanto para o `iframe` do EPUB, que é outro
  documento. A interface usa a fonte do sistema.

### Leitor

- A página do PDF é fundida com o papel da paleta (`pdfPagePaint`): branco vira
  exatamente o fundo, letra vai à luminância da tinta. Sem cópia de pixels.
- Barra superior sem borda, num degradê do fundo para transparente; título
  pequeno e apagado; ícones.
- Rodapé de uma linha: "Página 22 de 399 · 6%", com um fio de progresso na
  borda inferior da tela. As setas continuam no rodapé, mas só aparecem onde há
  mouse (`hover: hover`); no celular, toque nas laterais e deslizar bastam.
- Margens e ampliação do PDF saem do rodapé e entram no painel Aa, numa seção
  "Página do PDF" que só existe em formato de página fixa.
- Painel Aa como folha inferior sem borda, com alça; fontes num controle
  segmentado; ajustes em linhas com fio; paletas em círculos; interruptores
  no lugar das caixas de marcação.
- Painel de anotações e menu de seleção seguem o mesmo vocabulário.

### Estante

- Cabeçalho: marca em Literata, botão "+" e ajustes como ícones; busca num
  campo sem borda, largura toda; filtros de situação como abas sublinhadas;
  etiquetas como fichas leves.
- Capas sem anel, com sombra e cantos pequenos, como livro; progresso numa
  linha fina abaixo da capa; título em Literata; autor e percentual apagados.
- Livro que só está no outro aparelho: capa esmaecida e, na legenda, "não
  está neste aparelho" com o botão "Adicionar arquivo aqui".
- Faixa de junção, diálogos de exclusão e de etiquetas: superfície sem borda,
  cantos maiores, sombra.

### Ajustes e entrada

- Ajustes como uma página: rótulos de seção, medidor de espaço fino, lista de
  arquivos com fios, código de pareamento grande em Literata, "Sair" como
  texto em tom de perigo.
- Entrada: marca, campos sem borda sobre superfície, um botão primário.

## O que não muda

Paletas e contrastes; toque nas laterais, deslizar, pinça, teclado; modo foco,
destaques, etiquetas, sincronização; escala da interface; funcionamento
offline; todos os rótulos acessíveis que os testes conhecem.
