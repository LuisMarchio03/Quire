# Quire — o mesmo livro, arquivos diferentes

**Data:** 2026-09-03
**Status:** implementado

## O problema

O design original decidiu que "um arquivo diferente do mesmo título é outro
livro". Na prática, o mesmo livro chega a cada aparelho como um arquivo
ligeiramente diferente — baixado de novo, salvo por outro caminho, com
metadado mexido — e o SHA-256 não bate. O acervo mostra então dois livros
com o mesmo título e a mesma contagem de páginas, cada um com o próprio
progresso, e a leitura feita no computador nunca chega ao celular.

Foi exatamente o que apareceu no banco: *Confissões* duas vezes, 399 páginas
nas duas, uma a 5,5% (PC, página 22) e outra a 2,5% (celular, página 10).

## A solução

Um livro passa a ter **vários arquivos**. O `id` continua sendo o hash do
primeiro arquivo; os demais entram em `aliases`, uma lista de hashes que
identificam o mesmo livro. Quem decide que dois arquivos são o mesmo livro é o
dono, com um toque — o app só sugere.

### Modelo

- `Book.aliases: string[]` — outros SHA-256 que são este livro. Viaja como
  `tags`: coluna `aliases` (JSON) em `books`, validada no `parseChange`.
- Ao aplicar um livro vindo do servidor, o aparelho faz a **união** dos aliases
  que já conhecia com os que chegaram, e reenvia se a união cresceu. Alias é
  um fato que só cresce: última escrita vence não pode apagar "este arquivo é
  este livro", senão o aparelho que tem o arquivo sob o alias fica órfão.
- A anotação pode trocar de livro: o `ON CONFLICT` do servidor passa a
  atualizar `book_id`.

### Juntar dois livros

`mergeBooks(loserId, survivorId)`:

1. O sobrevivente recebe como alias o id do outro e os aliases dele; as
   etiquetas se somam; a capa do outro serve se o sobrevivente não tinha.
2. O progresso mais recente (`updatedAt`) vence e é regravado com carimbo
   novo, para vencer também no servidor. A situação de leitura acompanha.
3. As anotações do outro mudam de `bookId` para o sobrevivente.
4. O arquivo local do outro passa a viver sob o id do sobrevivente; se o
   sobrevivente já tinha arquivo aqui, o do outro é apagado.
5. O outro é excluído logicamente.

Tudo pelo espelho local, então sobe pela fila como qualquer escrita.

### Arquivo sob alias

Quando um livro com aliases chega pela sincronização, o aparelho procura no
próprio armazenamento um arquivo guardado sob algum desses aliases e o move
para o id do livro. É assim que o celular que fez a leitura com o arquivo
"errado" reencontra o livro unificado depois que a junção foi feita no PC.

Importar um arquivo cujo hash é alias de um livro reconecta a esse livro.

### Estante

- **Gêmeos.** Dois livros visíveis com o mesmo formato, a mesma contagem de
  páginas/capítulos e pelo menos uma palavra em comum no título (sem acento,
  quatro letras ou mais) viram uma sugestão no topo da estante: *"parece estar
  duas vezes na estante — é o mesmo livro?"* com **Juntar** e **Não, são
  diferentes**. A recusa fica guardada no aparelho e não volta a perguntar.
  Sobrevive o mais antigo (`addedAt`).
- **Adicionar arquivo aqui** com um arquivo que não é idêntico ao do outro
  aparelho: em vez de só avisar que é outro livro, a estante oferece juntar,
  mostrando a contagem de páginas dos dois. O cartão escolhido é o
  sobrevivente; o arquivo novo vira alias dele. Formato diferente continua
  sendo outro livro.
- A estante se atualiza quando a sincronização traz mudanças.

### Pontualidade

- O sincronizador também dispara quando a aba/PWA volta a ficar visível.
- Fechar o livro grava a posição pendente antes de voltar à estante, e a
  volta dispara uma sincronização — a leitura do PC chega ao celular em
  segundos, não em até um minuto.

## Fora do escopo

- Reposicionar um livro já aberto quando outro aparelho avança.
- Decidir sozinho que dois arquivos são o mesmo livro sem o dono confirmar.
