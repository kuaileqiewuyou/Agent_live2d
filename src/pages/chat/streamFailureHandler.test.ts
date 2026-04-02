import { describe, expect, it, vi } from 'vitest'
import type { ChatTurn, ManualToolRequest, Message } from '@/types'
import { handleStreamFailure } from '@/pages/chat/streamFailureHandler'

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

describe('handleStreamFailure', () => {
  it('avoids fallback send when stream was already accepted by backend', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transient = createMessage('transient-1', 'system', 'thinking', { transient: true })
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => ({
      userMessage: createMessage('fallback-user', 'user', 'u'),
      assistantMessage: createMessage('fallback-assistant', 'assistant', 'a'),
    }))
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: true,
      conversationId: 'c-1',
      nonce: 42,
      assistantId: 'assistant-temp',
      content: 'test',
      getCurrentMessages: () => [persisted, transient],
      setMessages,
      dropTransientMessages: messages => messages.filter(message => !message.metadata?.transient),
      createTransientMessage: (conversationId, id, role, content, overrides = {}) => ({
        ...createMessage(id, role, content),
        conversationId,
        ...overrides,
      }),
      loadConversation,
      sendFallbackMessage,
      updateMessage,
      pushNotification,
    })

    expect(result).toBe('stream-interrupted')
    expect(sendFallbackMessage).not.toHaveBeenCalled()
    expect(updateMessage).not.toHaveBeenCalled()
    expect(loadConversation).toHaveBeenCalledWith('c-1')
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'persisted-1' }),
        expect.objectContaining({ id: 'stream-interrupted-42', role: 'system' }),
      ]),
    )
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }))
  })

  it('falls back to normal send when stream was not accepted by backend', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transient = createMessage('transient-1', 'system', 'thinking', { transient: true })
    const fallbackUser = createMessage('fallback-user', 'user', 'fallback user')
    const fallbackAssistant = createMessage('fallback-assistant', 'assistant', 'fallback assistant')
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => ({
      userMessage: fallbackUser,
      assistantMessage: fallbackAssistant,
    }))
    const updateMessage = vi.fn()
    const manualToolRequests: ManualToolRequest[] = [
      {
        id: 'm-1',
        type: 'skill',
        targetId: 's-1',
        label: 'Summary Skill',
      },
    ]

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 99,
      assistantId: 'assistant-temp',
      content: 'fallback payload',
      manualToolRequests,
      getCurrentMessages: () => [persisted, transient],
      setMessages,
      dropTransientMessages: messages => messages.filter(message => !message.metadata?.transient),
      createTransientMessage: (conversationId, id, role, content, overrides = {}) => ({
        ...createMessage(id, role, content),
        conversationId,
        ...overrides,
      }),
      loadConversation,
      sendFallbackMessage,
      updateMessage,
      pushNotification,
      recoverRetryCount: 1,
      recoverRetryDelayMs: 0,
    })

    expect(result).toBe('fallback-sent')
    expect(sendFallbackMessage).toHaveBeenCalledWith('c-1', 'fallback payload', manualToolRequests, undefined)
    expect(updateMessage).not.toHaveBeenCalled()
    expect(loadConversation).toHaveBeenCalledTimes(2)
    expect(loadConversation).toHaveBeenNthCalledWith(1, 'c-1')
    expect(loadConversation).toHaveBeenNthCalledWith(2, 'c-1')
    expect(setMessages).toHaveBeenCalledWith([persisted, fallbackUser, fallbackAssistant])
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }))
  })

  it('skips fallback send when conversation refresh already has this turn', async () => {
    const persistedBefore = createMessage('persisted-1', 'user', 'hello')
    const refreshedUser = {
      ...createMessage('new-user-1', 'user', 'fallback payload'),
      createdAt: new Date(105).toISOString(),
    }
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => ({
      userMessage: createMessage('fallback-user', 'user', 'u'),
      assistantMessage: createMessage('fallback-assistant', 'assistant', 'a'),
    }))
    const updateMessage = vi.fn()
    let currentMessages: Message[] = [persistedBefore]

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 100,
      assistantId: 'assistant-temp',
      content: 'fallback payload',
      getCurrentMessages: () => currentMessages,
      setMessages,
      dropTransientMessages: messages => messages.filter(message => !message.metadata?.transient),
      createTransientMessage: (conversationId, id, role, content, overrides = {}) => ({
        ...createMessage(id, role, content),
        conversationId,
        ...overrides,
      }),
      loadConversation: async (conversationId) => {
        await loadConversation(conversationId)
        currentMessages = [persistedBefore, refreshedUser]
      },
      sendFallbackMessage,
      updateMessage,
      pushNotification,
      recoverRetryCount: 1,
      recoverRetryDelayMs: 0,
    })

    expect(result).toBe('stream-interrupted')
    expect(sendFallbackMessage).not.toHaveBeenCalled()
    expect(setMessages).not.toHaveBeenCalled()
    expect(updateMessage).not.toHaveBeenCalled()
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }))
  })

  it('marks assistant as error when fallback send also fails', async () => {
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => {
      throw new Error('network down')
    })
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 100,
      assistantId: 'assistant-temp',
      content: 'fallback payload',
      getCurrentMessages: () => [],
      setMessages,
      dropTransientMessages: messages => messages,
      createTransientMessage: (conversationId, id, role, content, overrides = {}) => ({
        ...createMessage(id, role, content),
        conversationId,
        ...overrides,
      }),
      loadConversation,
      sendFallbackMessage,
      updateMessage,
      pushNotification,
      recoverRetryCount: 1,
      recoverRetryDelayMs: 0,
    })

    expect(result).toBe('fallback-failed')
    expect(setMessages).not.toHaveBeenCalled()
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('assistant-temp', {
      status: 'error',
      content: 'network down',
    })
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })
})
