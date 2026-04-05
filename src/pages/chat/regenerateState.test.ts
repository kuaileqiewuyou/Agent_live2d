import { describe, expect, it } from 'vitest'
import type { Message } from '@/types'
import { canRegenerateFromMessages } from '@/pages/chat/regenerateState'

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    role: 'assistant',
    content: '',
    status: 'done',
    senderType: 'assistant',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('canRegenerateFromMessages', () => {
  it('returns true when latest assistant message is done', () => {
    const messages: Message[] = [
      createMessage({ id: 'u-1', role: 'user', senderType: 'user', content: 'hello' }),
      createMessage({ id: 'a-1', role: 'assistant', senderType: 'assistant', content: 'hi', status: 'done' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(true)
  })

  it('returns true when latest assistant message is error', () => {
    const messages: Message[] = [
      createMessage({ id: 'u-1', role: 'user', senderType: 'user', content: 'hello' }),
      createMessage({ id: 'a-1', role: 'assistant', senderType: 'assistant', content: 'failed', status: 'error' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(true)
  })

  it('returns true when latest message is recoverable system hint', () => {
    const messages: Message[] = [
      createMessage({ id: 'u-1', role: 'user', senderType: 'user', content: 'hello' }),
      createMessage({ id: 'stream-interrupted-101', role: 'system', senderType: 'system', content: 'interrupted', status: 'done' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(true)
  })

  it('returns false when latest message is request_in_progress system hint', () => {
    const messages: Message[] = [
      createMessage({ id: 'u-1', role: 'user', senderType: 'user', content: 'hello' }),
      createMessage({ id: 'request-in-progress-101', role: 'system', senderType: 'system', content: 'processing', status: 'done' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(false)
  })

  it('returns false for request_in_progress hint even when older assistant is done', () => {
    const messages: Message[] = [
      createMessage({ id: 'u-1', role: 'user', senderType: 'user', content: 'hello' }),
      createMessage({ id: 'a-1', role: 'assistant', senderType: 'assistant', content: 'old answer', status: 'done' }),
      createMessage({ id: 'request-in-progress-102', role: 'system', senderType: 'system', content: 'processing', status: 'done' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(false)
  })

  it('returns false when there is no user message', () => {
    const messages: Message[] = [
      createMessage({ id: 'a-1', role: 'assistant', senderType: 'assistant', content: 'hi', status: 'done' }),
    ]

    expect(canRegenerateFromMessages(messages)).toBe(false)
  })
})
