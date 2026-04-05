import type {
  ChatTurn,
  ManualToolRequest,
  Message,
  NotificationAction,
  NotificationType,
} from '@/types'
import { ApiRequestError } from '@/api/errors'

export type StreamFailureOutcome = 'stream-interrupted' | 'fallback-sent' | 'fallback-failed'

interface PushNotificationPayload {
  type: NotificationType
  title: string
  description?: string
  action?: NotificationAction
}

interface HandleStreamFailureArgs {
  streamError?: unknown
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

const RECOVERABLE_NOTICE_TITLE = '连接已恢复'
const RECOVERABLE_NOTICE_DESCRIPTION = '本轮消息已恢复，且未重复发送。可刷新确认最新消息。'
const IN_PROGRESS_NOTICE_TITLE = '请求处理中'
const IN_PROGRESS_NOTICE_DESCRIPTION = '相同请求仍在处理中，已刷新会话，无需重复发送。'
const IN_PROGRESS_SYSTEM_HINT = '上一条请求仍在处理中，已刷新会话，无需重发。'
const VALIDATION_NOTICE_TITLE = '参数校验失败'
const VALIDATION_NOTICE_DESCRIPTION_PREFIX = '请修正 Tool 参数后重试。'
const PROVIDER_NOTICE_TITLE = 'Provider 不可用'
const PROVIDER_NOTICE_DESCRIPTION = '当前模型 Provider 暂不可用，请检查 Model Config / API Key 后重试。'
const UNRECOVERABLE_NOTICE_TITLE = '发送失败'
const UNRECOVERABLE_FALLBACK = '发送失败，请稍后重试。'

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isRequestInProgressError(error: unknown) {
  if (error instanceof ApiRequestError && error.code === 'request_in_progress') {
    return true
  }

  if (error instanceof ApiRequestError && error.status === 409) {
    return true
  }

  const message = toErrorMessage(error, '').trim().toLowerCase()
  if (!message) return false

  return [
    'request_in_progress',
    'request is still in progress',
    'in progress',
    'processing',
    'still processing',
    'retry later',
  ].some(keyword => message.includes(keyword))
}

function isValidationError(error: unknown) {
  if (error instanceof ApiRequestError && error.code === 'validation_error') {
    return true
  }

  if (error instanceof ApiRequestError && error.status === 422) {
    return true
  }

  const message = toErrorMessage(error, '').trim().toLowerCase()
  if (!message) return false

  return [
    'validation',
    'invalid params',
    'unprocessable',
    'should be a',
  ].some(keyword => message.includes(keyword))
}

function isProviderError(error: unknown) {
  if (error instanceof ApiRequestError && error.code === 'provider_error') {
    return true
  }

  if (error instanceof ApiRequestError && error.status === 502) {
    return true
  }

  const message = toErrorMessage(error, '').trim().toLowerCase()
  if (!message) return false

  return [
    'provider error',
    'provider unavailable',
    'provider call failed',
    'model provider',
    'gateway',
  ].some(keyword => message.includes(keyword))
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

function appendInProgressSystemHint(params: {
  conversationId: string
  nonce: number
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
}) {
  const {
    conversationId,
    nonce,
    getCurrentMessages,
    setMessages,
    dropTransientMessages,
    createTransientMessage,
  } = params

  const persistedMessages = dropTransientMessages(getCurrentMessages())
  setMessages([
    ...persistedMessages,
    createTransientMessage(
      conversationId,
      `request-in-progress-${nonce}`,
      'system',
      IN_PROGRESS_SYSTEM_HINT,
    ),
  ])
}

function settleAssistantError(params: {
  assistantId: string
  message: string
  getCurrentMessages: () => Message[]
  setMessages: (messages: Message[]) => void
  dropTransientMessages: (messages: Message[]) => Message[]
}) {
  const {
    assistantId,
    message,
    getCurrentMessages,
    setMessages,
    dropTransientMessages,
  } = params

  const currentMessages = getCurrentMessages()
  const persistedMessages = dropTransientMessages(currentMessages)
  const transientAssistant = currentMessages.find(item => item.id === assistantId && item.role === 'assistant')

  if (!transientAssistant) {
    setMessages(persistedMessages)
    return
  }

  const assistantMessage: Message = {
    ...transientAssistant,
    status: 'error',
    content: message,
    metadata: {
      ...(transientAssistant.metadata || {}),
      transient: false,
    },
  }
  const withoutAssistant = persistedMessages.filter(item => item.id !== assistantId)
  setMessages([...withoutAssistant, assistantMessage])
}

function buildRefreshAction(params: {
  conversationId: string
  loadConversation: (conversationId: string) => Promise<void>
  onLoadConversationError?: (error: unknown) => void
}): NotificationAction {
  const {
    conversationId,
    loadConversation,
    onLoadConversationError,
  } = params

  return {
    label: '立即刷新',
    onClick: () => {
      void loadConversation(conversationId).catch((error) => {
        onLoadConversationError?.(error)
      })
    },
  }
}

function pushRecoverableNotice(
  pushNotification: (payload: PushNotificationPayload) => void,
  refreshAction: NotificationAction,
) {
  pushNotification({
    type: 'info',
    title: RECOVERABLE_NOTICE_TITLE,
    description: RECOVERABLE_NOTICE_DESCRIPTION,
    action: refreshAction,
  })
}

function pushInProgressNotice(
  pushNotification: (payload: PushNotificationPayload) => void,
  refreshAction: NotificationAction,
) {
  pushNotification({
    type: 'info',
    title: IN_PROGRESS_NOTICE_TITLE,
    description: IN_PROGRESS_NOTICE_DESCRIPTION,
    action: refreshAction,
  })
}
export async function handleStreamFailure(args: HandleStreamFailureArgs): Promise<StreamFailureOutcome> {
  const {
    streamAcceptedByServer,
    conversationId,
    nonce,
    assistantId,
    content,
    manualToolRequests,
    streamError,
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

  const refreshAction = buildRefreshAction({
    conversationId,
    loadConversation,
    onLoadConversationError,
  })

  if (isRequestInProgressError(streamError)) {
    try {
      await loadConversation(conversationId)
    }
    catch (error) {
      onLoadConversationError?.(error)
    }

    appendInProgressSystemHint({
      conversationId,
      nonce,
      getCurrentMessages,
      setMessages,
      dropTransientMessages,
      createTransientMessage,
    })

    pushInProgressNotice(pushNotification, refreshAction)
    return 'stream-interrupted'
  }

  if (streamAcceptedByServer) {
    const persistedMessages = dropTransientMessages(getCurrentMessages())
    setMessages([
      ...persistedMessages,
      createTransientMessage(
        conversationId,
        `stream-interrupted-${nonce}`,
        'system',
        '流式连接已中断，但后端已接收本轮请求。可直接重新生成，无需重发。',
      ),
    ])

    pushRecoverableNotice(pushNotification, refreshAction)

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
        pushRecoverableNotice(pushNotification, refreshAction)
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

    pushRecoverableNotice(pushNotification, refreshAction)
    await loadConversation(conversationId)
    return 'fallback-sent'
  }
  catch (fallbackError) {
    if (isRequestInProgressError(fallbackError)) {
      try {
        await loadConversation(conversationId)
      }
      catch (error) {
        onLoadConversationError?.(error)
      }

      appendInProgressSystemHint({
        conversationId,
        nonce,
        getCurrentMessages,
        setMessages,
        dropTransientMessages,
        createTransientMessage,
      })

      pushInProgressNotice(pushNotification, refreshAction)
      return 'stream-interrupted'
    }

    if (isValidationError(fallbackError)) {
      const message = toErrorMessage(fallbackError, UNRECOVERABLE_FALLBACK)
      settleAssistantError({
        assistantId,
        message,
        getCurrentMessages,
        setMessages,
        dropTransientMessages,
      })
      updateMessage(assistantId, {
        status: 'error',
        content: message,
      })

      pushNotification({
        type: 'info',
        title: VALIDATION_NOTICE_TITLE,
        description: `${VALIDATION_NOTICE_DESCRIPTION_PREFIX} (${message})`,
        action: refreshAction,
      })
      return 'fallback-failed'
    }

    if (isProviderError(fallbackError)) {
      const message = toErrorMessage(fallbackError, UNRECOVERABLE_FALLBACK)
      settleAssistantError({
        assistantId,
        message,
        getCurrentMessages,
        setMessages,
        dropTransientMessages,
      })
      updateMessage(assistantId, {
        status: 'error',
        content: message,
      })

      pushNotification({
        type: 'error',
        title: PROVIDER_NOTICE_TITLE,
        description: `${PROVIDER_NOTICE_DESCRIPTION} (${message})`,
        action: refreshAction,
      })
      return 'fallback-failed'
    }

    const message = toErrorMessage(fallbackError, UNRECOVERABLE_FALLBACK)
    settleAssistantError({
      assistantId,
      message,
      getCurrentMessages,
      setMessages,
      dropTransientMessages,
    })
    updateMessage(assistantId, {
      status: 'error',
      content: message,
    })

    pushNotification({
      type: 'error',
      title: UNRECOVERABLE_NOTICE_TITLE,
      description: message,
      action: refreshAction,
    })
    return 'fallback-failed'
  }
}
