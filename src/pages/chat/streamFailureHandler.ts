import type { ChatTurn, ManualToolRequest, Message, NotificationType } from '@/types'

export type StreamFailureOutcome = 'stream-interrupted' | 'fallback-sent' | 'fallback-failed'

interface PushNotificationPayload {
  type: NotificationType
  title: string
  description?: string
}

interface HandleStreamFailureArgs {
  streamAcceptedByServer: boolean
  conversationId: string
  nonce: number
  assistantId: string
  content: string
  manualToolRequests?: ManualToolRequest[]
  getCurrentMessages: () => Message[]
  setMessages: (messages: Message[]) => void
  dropTransientMessages: (messages: Message[]) => Message[]
  createTransientMessage: (
    conversationId: string,
    id: string,
    role: 'system' | 'tool',
    content: string,
    overrides?: Partial<Message>,
  ) => Message
  loadConversation: (conversationId: string) => Promise<void>
  sendFallbackMessage: (
    conversationId: string,
    content: string,
    manualToolRequests?: ManualToolRequest[],
    metadata?: Record<string, unknown>,
  ) => Promise<ChatTurn>
  updateMessage: (id: string, patch: Partial<Message>) => void
  pushNotification: (payload: PushNotificationPayload) => void
  onLoadConversationError?: (error: unknown) => void
  recoverRetryCount?: number
  recoverRetryDelayMs?: number
  fallbackMetadata?: Record<string, unknown>
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isRecentSameContentUserMessage(message: Message, content: string, nonce: number) {
  if (message.role !== 'user') return false
  if ((message.content || '').trim() !== (content || '').trim()) return false
  const createdAt = new Date(message.createdAt).getTime()
  if (!Number.isFinite(createdAt)) return false
  // Allow moderate clock drift between frontend and backend.
  return createdAt >= (nonce - 5 * 60 * 1000)
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function handleStreamFailure(args: HandleStreamFailureArgs): Promise<StreamFailureOutcome> {
  const {
    streamAcceptedByServer,
    conversationId,
    nonce,
    assistantId,
    content,
    manualToolRequests,
    getCurrentMessages,
    setMessages,
    dropTransientMessages,
    createTransientMessage,
    loadConversation,
    sendFallbackMessage,
    updateMessage,
    pushNotification,
    onLoadConversationError,
    recoverRetryCount,
    recoverRetryDelayMs,
    fallbackMetadata,
  } = args

  if (streamAcceptedByServer) {
    const persistedMessages = dropTransientMessages(getCurrentMessages())
    setMessages([
      ...persistedMessages,
      createTransientMessage(
        conversationId,
        `stream-interrupted-${nonce}`,
        'system',
        '流式连接中断：本轮消息已发送到后端，但未完整返回。可直接点击“重新生成”继续。',
      ),
    ])

    pushNotification({
      type: 'info',
      title: '流式连接中断',
      description: '已避免重复发送。你可以直接重新生成上一条回复。',
    })

    try {
      await loadConversation(conversationId)
    }
    catch (error) {
      onLoadConversationError?.(error)
    }
    return 'stream-interrupted'
  }

  const probeCount = Math.max(1, recoverRetryCount ?? 2)
  const probeDelay = Math.max(0, recoverRetryDelayMs ?? 700)

  for (let probeIndex = 0; probeIndex < probeCount; probeIndex += 1) {
    try {
      await loadConversation(conversationId)
      const recoveredMessages = getCurrentMessages()
      const alreadyPersisted = recoveredMessages.some(message => (
        isRecentSameContentUserMessage(message, content, nonce)
      ))
      if (alreadyPersisted) {
        pushNotification({
          type: 'info',
          title: '流式连接中断',
          description: '检测到后端已接收本轮消息，已自动恢复会话内容，避免重复发送。',
        })
        return 'stream-interrupted'
      }
    }
    catch (error) {
      onLoadConversationError?.(error)
    }

    if (probeIndex < probeCount - 1) {
      await sleep(probeDelay)
    }
  }

  try {
    const fallback = await sendFallbackMessage(conversationId, content, manualToolRequests, fallbackMetadata)
    const persistedMessages = dropTransientMessages(getCurrentMessages())
    setMessages([
      ...persistedMessages,
      fallback.userMessage,
      fallback.assistantMessage,
    ])

    pushNotification({
      type: 'info',
      title: '已切换为普通发送模式',
      description: '流式响应不可用，已使用普通请求完成本次发送。',
    })
    await loadConversation(conversationId)
    return 'fallback-sent'
  }
  catch (fallbackError) {
    updateMessage(assistantId, {
      status: 'error',
      content: toErrorMessage(fallbackError, '发送失败，请稍后再试。'),
    })

    pushNotification({
      type: 'error',
      title: '发送消息失败',
      description: toErrorMessage(fallbackError, '请稍后再试。'),
    })
    return 'fallback-failed'
  }
}
