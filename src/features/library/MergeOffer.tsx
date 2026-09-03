import type { Book } from '../../lib/types'
import type { MergeSuggestion } from './useLibrary'

function count(book: Book, n: number): string {
  const unit = book.format === 'pdf' ? ['página', 'páginas'] : ['capítulo', 'capítulos']
  return `${n} ${n === 1 ? unit[0] : unit[1]}`
}

function describe({ kind, loser, survivor }: MergeSuggestion): string {
  if (kind === 'twin') {
    return `“${survivor.title}” parece estar duas vezes na estante — ${survivor.format.toUpperCase()}, ${count(survivor, survivor.spineCount)} nos dois. É o mesmo livro?`
  }
  const sizes =
    loser.spineCount === survivor.spineCount
      ? `os dois têm ${count(survivor, survivor.spineCount)}`
      : `este tem ${count(loser, loser.spineCount)}; o outro, ${count(survivor, survivor.spineCount)}`
  return `O arquivo escolhido não é idêntico ao de “${survivor.title}” — entrou na estante como “${loser.title}” (${sizes}). É o mesmo livro?`
}

interface MergeOfferProps {
  suggestion: MergeSuggestion
  onMerge: () => void
  onDismiss: () => void
}

/**
 * Faixa no topo da estante. É uma pergunta, não um aviso: o app só sugere, e
 * quem decide que dois arquivos são o mesmo livro é o dono.
 */
export function MergeOffer({ suggestion, onMerge, onDismiss }: MergeOfferProps) {
  return (
    <div
      role="region"
      aria-label="Livros que parecem ser o mesmo"
      className="mb-6 rounded-xl bg-surface px-4 py-3.5 text-sm text-ink"
    >
      <p className="leading-relaxed">{describe(suggestion)}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        Juntar fica com o progresso mais recente, leva as anotações e as etiquetas dos dois, e o
        arquivo que está aqui continua servindo.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onMerge}
          className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-canvas hover:bg-accent/90"
        >
          Juntar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-xl bg-surface-2 px-3.5 py-1.5 text-xs text-ink-dim hover:text-ink"
        >
          Não, são livros diferentes
        </button>
      </div>
    </div>
  )
}
