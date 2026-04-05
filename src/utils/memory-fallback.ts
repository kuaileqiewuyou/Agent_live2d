export function toErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  return ''
}

export function isMemoryVectorFallbackError(error: unknown): boolean {
  const message = toErrorText(error).toLowerCase()
  if (!message) return false

  return [
    'qdrant',
    'vector',
    'embedding',
    'collection',
    'upsert',
    'similarity search',
    'memory store',
  ].some(keyword => message.includes(keyword))
}

