import { describe, expect, it, vi } from 'vitest'
import type { ChatTurn, ManualToolRequest, Message } from '@/types'
import { handleStreamFailure } from '@/pages/chat/streamFailureHandler'
import { ApiRequestError } from '@/api/errors'

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
  it('does not fallback send when user actively cancelled this turn', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transient = createMessage('transient-1', 'assistant', 'streaming', { transient: true })
    transient.status = 'streaming'
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => ({
      userMessage: createMessage('fallback-user', 'user', 'u'),
      assistantMessage: createMessage('fallback-assistant', 'assistant', 'a'),
    }))
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      cancelledByUser: true,
      conversationId: 'c-1',
      nonce: 110,
      assistantId: 'assistant-temp',
      content: 'hello',
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
    expect(loadConversation).not.toHaveBeenCalled()
    expect(updateMessage).not.toHaveBeenCalled()
    expect(pushNotification).not.toHaveBeenCalled()
    expect(setMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'persisted-1' }),
        expect.objectContaining({ id: 'stopped-110', role: 'system' }),
      ]),
    )
  })

  it('refreshes conversation and exits when request is already in progress', async () => {
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => ({
      userMessage: createMessage('fallback-user', 'user', 'u'),
      assistantMessage: createMessage('fallback-assistant', 'assistant', 'a'),
    }))
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamError: new ApiRequestError('request is still in progress', { code: 'request_in_progress', status: 409 }),
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 101,
      assistantId: 'assistant-temp',
      content: 'hello',
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
    })

    expect(result).toBe('stream-interrupted')
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(sendFallbackMessage).not.toHaveBeenCalled()
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'request-in-progress-101',
          role: 'system',
        }),
      ]),
    )
    expect(updateMessage).not.toHaveBeenCalled()
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '请求处理中',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })

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
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '连接已恢复',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
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
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '连接已恢复',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
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
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '连接已恢复',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })

  it('marks assistant as error when fallback send also fails', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transientThinking = createMessage('thinking-1', 'system', 'thinking', { transient: true })
    const transientAssistant = createMessage('assistant-temp', 'assistant', 'partial answer', { transient: true })
    transientAssistant.status = 'streaming'

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
      getCurrentMessages: () => [persisted, transientThinking, transientAssistant],
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

    expect(result).toBe('fallback-failed')
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('assistant-temp', {
      status: 'error',
      content: 'network down',
    })
    const settledMessages = setMessages.mock.calls[0]?.[0] as Message[]
    expect(settledMessages.some(message => message.id === 'thinking-1')).toBe(false)
    expect(settledMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'persisted-1' }),
      expect.objectContaining({
        id: 'assistant-temp',
        status: 'error',
        content: 'network down',
      }),
    ]))
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: '发送失败',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })

  it('uses info-level validation notice when fallback fails with 422', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transientThinking = createMessage('thinking-1', 'system', 'thinking', { transient: true })
    const transientAssistant = createMessage('assistant-temp', 'assistant', 'partial answer', { transient: true })
    transientAssistant.status = 'streaming'

    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => {
      throw new ApiRequestError('manualToolRequests[0] invalid params: budget should be a number', {
        code: 'validation_error',
        status: 422,
      })
    })
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 103,
      assistantId: 'assistant-temp',
      content: 'fallback payload',
      getCurrentMessages: () => [persisted, transientThinking, transientAssistant],
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

    expect(result).toBe('fallback-failed')
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('assistant-temp', {
      status: 'error',
      content: 'manualToolRequests[0] invalid params: budget should be a number',
    })
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '参数校验失败',
      description: expect.stringContaining('请修正 Tool 参数后重试。'),
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })

  it('uses provider-level notice when fallback fails with provider_error', async () => {
    const persisted = createMessage('persisted-1', 'user', 'hello')
    const transientThinking = createMessage('thinking-1', 'system', 'thinking', { transient: true })
    const transientAssistant = createMessage('assistant-temp', 'assistant', 'partial answer', { transient: true })
    transientAssistant.status = 'streaming'

    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => {
      throw new ApiRequestError('provider call failed: upstream timeout', {
        code: 'provider_error',
        status: 502,
      })
    })
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 104,
      assistantId: 'assistant-temp',
      content: 'fallback payload',
      getCurrentMessages: () => [persisted, transientThinking, transientAssistant],
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

    expect(result).toBe('fallback-failed')
    expect(loadConversation).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(updateMessage).toHaveBeenCalledWith('assistant-temp', {
      status: 'error',
      content: 'provider call failed: upstream timeout',
    })
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: 'Provider 不可用',
      description: expect.stringContaining('provider call failed: upstream timeout'),
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })

  it('refreshes conversation when fallback returns request_in_progress', async () => {
    const setMessages = vi.fn()
    const pushNotification = vi.fn()
    const loadConversation = vi.fn(async (_conversationId: string) => {})
    const sendFallbackMessage = vi.fn(async (): Promise<ChatTurn> => {
      throw new ApiRequestError('request is still in progress', { code: 'request_in_progress', status: 409 })
    })
    const updateMessage = vi.fn()

    const result = await handleStreamFailure({
      streamAcceptedByServer: false,
      conversationId: 'c-1',
      nonce: 102,
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

    expect(result).toBe('stream-interrupted')
    expect(loadConversation).toHaveBeenCalledTimes(2)
    expect(sendFallbackMessage).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledTimes(1)
    expect(setMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'request-in-progress-102',
          role: 'system',
        }),
      ]),
    )
    expect(updateMessage).not.toHaveBeenCalled()
    expect(pushNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '请求处理中',
      action: expect.objectContaining({
        label: '立即刷新',
      }),
    }))
  })
})
