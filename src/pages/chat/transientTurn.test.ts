import { describe, expect, it } from 'vitest'
import type { Message } from '@/types'
import { mergeTransientTurnMessages } from '@/pages/chat/transientTurn'

function createMessage(
  id: string,
  role: Message['role'],
  content: string,
  metadata?: Record<string, unknown>,
): Message {
  return {
    id,
    conversationId: 'c-1',
    role,
    content,
    status: 'done',
    senderType: role === 'user' ? 'user' : 'assistant',
    createdAt: new Date().toISOString(),
    metadata: metadata || {},
  }
}

describe('mergeTransientTurnMessages', () => {
  it('drops old transient messages before appending new turn transient messages', () => {
    const persisted = createMessage('m-1', 'user', 'persisted')
    const transientOld = createMessage('t-old', 'system', 'old transient', { transient: true })
    const transientNext = [
      createMessage('t-user', 'user', 'new user', { transient: true }),
      createMessage('t-assistant', 'assistant', 'new assistant', { transient: true }),
    ]

    const result = mergeTransientTurnMessages([persisted, transientOld], transientNext)
    expect(result.map(message => message.id)).toEqual(['m-1', 't-user', 't-assistant'])
  })

  it('keeps all persisted history order', () => {
    const persistedA = createMessage('m-1', 'user', 'u1')
    const persistedB = createMessage('m-2', 'assistant', 'a1')
    const transientNext = [createMessage('t-1', 'system', 'thinking', { transient: true })]

    const result = mergeTransientTurnMessages([persistedA, persistedB], transientNext)
    expect(result.map(message => message.id)).toEqual(['m-1', 'm-2', 't-1'])
  })
})
