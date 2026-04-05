import type { Message } from '@/types'

export function mergeTransientTurnMessages(
  currentMessages: Message[],
  transientTurnMessages: Message[],
): Message[] {
  const persistedMessages = currentMessages.filter(message => !message.metadata?.transient)
  return [...persistedMessages, ...transientTurnMessages]
}
