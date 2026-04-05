import type { Message } from '@/types'

const RECOVERABLE_SYSTEM_MESSAGE_PREFIXES = ['stream-interrupted-', 'stopped-']
const IN_PROGRESS_SYSTEM_MESSAGE_PREFIX = 'request-in-progress-'

function isRecoverableSystemHint(message: Message | undefined) {
  if (!message || message.role !== 'system') return false
  return RECOVERABLE_SYSTEM_MESSAGE_PREFIXES.some(prefix => message.id.startsWith(prefix))
}

function isRequestInProgressSystemHint(message: Message | undefined) {
  if (!message || message.role !== 'system') return false
  return message.id.startsWith(IN_PROGRESS_SYSTEM_MESSAGE_PREFIX)
}

export function canRegenerateFromMessages(messages: Message[]) {
  if (messages.length === 0) return false

  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
  if (!latestUserMessage) return false

  const latestMessage = messages[messages.length - 1]
  if (isRequestInProgressSystemHint(latestMessage)) {
    return false
  }
  if (isRecoverableSystemHint(latestMessage)) {
    return true
  }

  const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant')
  if (latestAssistantMessage) {
    return latestAssistantMessage.status === 'done' || latestAssistantMessage.status === 'error'
  }

  return false
}
