/** Agora, em ISO-8601 UTC — o formato usado em todo timestamp do app. */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Um instante deslocado em segundos a partir de uma base (padrão: agora). */
export function isoPlus(seconds: number, from: Date = new Date()): string {
  return new Date(from.getTime() + seconds * 1000).toISOString()
}
