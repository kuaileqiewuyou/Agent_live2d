import { apiRequest, isMockMode, normalizeRequestError, parseApiError, API_BASE_URL } from '@/api'
import type {
  ChatTurn,
  Live2DState,
  ManualToolInputParams,
  ManualToolRequest,
  Message,
  MessageAttachment,
  OpsCommandSession,
  OpsMCPInstallSession,
  OpsMCPInstallStep,
} from '@/types'
import { mockMessages } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

interface MessageDedupeResult {
  conversationId: string
  totalBefore: number
  totalAfter: number
  deletedCount: number
  deletedTurnCount: number
  deletedMessageIds: string[]
}

interface StreamToolResult {
  type: 'skill' | 'mcp'
  name: string
  label?: string
  title?: string
  summary?: string
  result: string
  toolName?: string
  executionMode?: string
  manual?: boolean
  inputText?: string
  inputParams?: ManualToolInputParams
  error?: boolean | string
  code?: string
  details?: Record<string, unknown>
}

interface StreamToolUsage {
  manualCount?: number
  automaticCount?: number
  totalCount?: number
  manualTools?: string[]
  automaticTools?: string[]
}

interface StreamFinalAnswerPayload {
  messageId: string
  content: string
  toolUsage?: StreamToolUsage
  manualToolRequests?: ManualToolRequest[]
}

interface StreamMessageOptions {
  attachments?: MessageAttachment[]
  metadata?: Record<string, unknown>
  manualToolRequests?: ManualToolRequest[]
  modelConfigId?: string
  signal?: AbortSignal
}

interface StreamOpsInstallFinishedPayload {
  sessionId: string
  status?: string
  summary?: string
}

interface StreamOpsCommandFinishedPayload {
  sessionId: string
  status?: string
  summary?: string
}

let messages: Message[] = [...mockMessages]

function normalizeMessage(
  message: Partial<Message> & Pick<Message, 'id' | 'conversationId' | 'role' | 'content' | 'senderType' | 'createdAt'>,
): Message {
  return {
    ...message,
    status: message.status || 'done',
    senderName: message.senderName,
    agentName: message.agentName,
    toolName: message.toolName,
    toolStatus: message.toolStatus,
    reasoning: message.reasoning,
    attachments: message.attachments || [],
    metadata: message.metadata || {},
  }
}

async function getMessages(conversationId: string): Promise<Message[]> {
  if (isMockMode()) {
    return messages.filter((message) => message.conversationId === conversationId)
  }
  const res = await apiRequest<ListResponse<Message>>(`/api/conversations/${conversationId}/messages`)
  return res.data.items.map(normalizeMessage)
}

async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: MessageAttachment[],
  manualToolRequests?: ManualToolRequest[],
  metadata?: Record<string, unknown>,
  modelConfigId?: string,
): Promise<ChatTurn> {
  if (isMockMode()) {
    const now = new Date().toISOString()
    const userMessage: Message = {
      id: generateId(),
      conversationId,
      role: 'user',
      content,
      status: 'done',
      senderType: 'user',
      senderName: '用户',
      attachments,
      createdAt: now,
    }
    const assistantMessage: Message = {
      id: generateId(),
      conversationId,
      role: 'assistant',
      content: '这是一次本地 mock 回复。真实回复会由后端 Agent 生成。',
      status: 'done',
      senderType: 'assistant',
      senderName: 'AI',
      createdAt: new Date().toISOString(),
    }
    messages.push(userMessage, assistantMessage)
    return { userMessage, assistantMessage }
  }

  const res = await apiRequest<ChatTurn>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      attachments,
      manualToolRequests,
      metadata: metadata || {},
      modelConfigId,
    }),
  })
  return {
    userMessage: normalizeMessage(res.data.userMessage),
    assistantMessage: normalizeMessage(res.data.assistantMessage),
  }
}

async function regenerateMessage(conversationId: string): Promise<ChatTurn> {
  const res = await apiRequest<ChatTurn>(`/api/conversations/${conversationId}/messages/regenerate`, {
    method: 'POST',
  })
  return {
    userMessage: normalizeMessage(res.data.userMessage),
    assistantMessage: normalizeMessage(res.data.assistantMessage),
  }
}

async function stopMessage(conversationId: string): Promise<void> {
  await apiRequest(`/api/conversations/${conversationId}/messages/stop`, {
    method: 'POST',
  })
}

async function dedupeMessages(conversationId: string): Promise<MessageDedupeResult> {
  const res = await apiRequest<MessageDedupeResult>(`/api/conversations/${conversationId}/messages/dedupe`, {
    method: 'POST',
  })
  return res.data
}

async function streamMessage(
  conversationId: string,
  content: string,
  handlers: {
    onMessageCreated?: (userMessageId: string) => void
    onThinking?: (payload: { stage?: string, message?: string }) => void
    onToolCalling?: (payload: {
      toolCount?: number
      message?: string
      manual?: boolean
      manualCount?: number
      autoCount?: number
    }) => void
    onToolResult?: (payload: StreamToolResult) => void
    onMemorySync?: (payload: { requested?: boolean, message?: string }) => void
    onToken?: (token: string) => void
    onLive2dStateChange?: (state: Live2DState) => void
    onOpsInstallPreview?: (session: OpsMCPInstallSession) => void
    onOpsInstallStepStarted?: (payload: { sessionId: string, step: OpsMCPInstallStep }) => void
    onOpsInstallStepFinished?: (payload: { sessionId: string, step: OpsMCPInstallStep }) => void
    onOpsInstallFinished?: (payload: StreamOpsInstallFinishedPayload) => void
    onOpsCommandPreview?: (session: OpsCommandSession) => void
    onOpsCommandFinished?: (payload: StreamOpsCommandFinishedPayload) => void
    onFinalAnswer?: (payload: StreamFinalAnswerPayload) => void
    onStopped?: () => void
  },
  options: StreamMessageOptions = {},
): Promise<void> {
  let hasTerminalEvent = false
  const supportedEvents = new Set([
    'message_created',
    'thinking',
    'tool_calling',
    'tool_result',
    'memory_sync',
    'ops_install_preview',
    'ops_install_step_started',
    'ops_install_step_finished',
    'ops_install_finished',
    'ops_command_preview',
    'ops_command_finished',
    'token',
    'final_answer',
    'stopped',
  ])

  try {
    const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        content,
        attachments: options.attachments || [],
        metadata: options.metadata || {},
        manualToolRequests: options.manualToolRequests || [],
        modelConfigId: options.modelConfigId,
      }),
    })

    if (!response.ok) {
      throw await parseApiError(response)
    }

    if (!response.body) {
      throw new Error(`流式请求失败：${response.status} ${response.statusText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // Browser/desktop streams may use CRLF. Normalize to simplify block splitting.
      buffer = buffer.replace(/\r\n/g, '\n')
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        let eventName = ''
        const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
        const dataLines: string[] = []

        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }

        if (!eventName || !supportedEvents.has(eventName)) continue
        if (dataLines.length === 0) continue

        const dataPayload = dataLines.join('\n')
        let payload: Record<string, unknown>
        try {
          const parsed = JSON.parse(dataPayload)
          if (!parsed || typeof parsed !== 'object') continue
          payload = parsed as Record<string, unknown>
        }
        catch {
          // Ignore keepalive/non-JSON blocks instead of aborting the whole stream.
          continue
        }

        const live2dState = payload.live2dState as Live2DState | undefined
        const userMessageId = typeof payload.userMessageId === 'string' ? payload.userMessageId : ''
        const tokenContent = typeof payload.content === 'string' ? payload.content : ''
        if (live2dState) {
          handlers.onLive2dStateChange?.(live2dState)
        }
        switch (eventName) {
          case 'message_created':
            if (userMessageId) handlers.onMessageCreated?.(userMessageId)
            if (!live2dState) handlers.onLive2dStateChange?.('thinking')
            break
          case 'thinking':
            handlers.onThinking?.(payload as { stage?: string, message?: string })
            if (!live2dState) handlers.onLive2dStateChange?.('thinking')
            break
          case 'tool_calling':
            handlers.onToolCalling?.(payload as {
              toolCount?: number
              message?: string
              manual?: boolean
              manualCount?: number
              autoCount?: number
            })
            break
          case 'tool_result':
            if (
              typeof payload.type === 'string'
              && typeof payload.name === 'string'
              && typeof payload.result === 'string'
            ) {
              handlers.onToolResult?.(payload as unknown as StreamToolResult)
            }
            break
          case 'memory_sync':
            handlers.onMemorySync?.(payload as { requested?: boolean, message?: string })
            break
          case 'ops_install_preview':
            if (typeof payload.id === 'string' && Array.isArray(payload.steps)) {
              handlers.onOpsInstallPreview?.(payload as unknown as OpsMCPInstallSession)
            }
            break
          case 'ops_install_step_started':
            if (typeof payload.sessionId === 'string' && payload.step && typeof payload.step === 'object') {
              handlers.onOpsInstallStepStarted?.({
                sessionId: payload.sessionId,
                step: payload.step as OpsMCPInstallStep,
              })
            }
            break
          case 'ops_install_step_finished':
            if (typeof payload.sessionId === 'string' && payload.step && typeof payload.step === 'object') {
              handlers.onOpsInstallStepFinished?.({
                sessionId: payload.sessionId,
                step: payload.step as OpsMCPInstallStep,
              })
            }
            break
          case 'ops_install_finished':
            if (typeof payload.sessionId === 'string') {
              handlers.onOpsInstallFinished?.({
                sessionId: payload.sessionId,
                status: typeof payload.status === 'string' ? payload.status : undefined,
                summary: typeof payload.summary === 'string' ? payload.summary : undefined,
              })
            }
            break
          case 'ops_command_preview':
            if (typeof payload.id === 'string' && payload.preview && typeof payload.preview === 'object') {
              handlers.onOpsCommandPreview?.(payload as unknown as OpsCommandSession)
            }
            break
          case 'ops_command_finished':
            if (typeof payload.sessionId === 'string') {
              handlers.onOpsCommandFinished?.({
                sessionId: payload.sessionId,
                status: typeof payload.status === 'string' ? payload.status : undefined,
                summary: typeof payload.summary === 'string' ? payload.summary : undefined,
              })
            }
            break
          case 'token':
            handlers.onToken?.(tokenContent)
            if (!live2dState) handlers.onLive2dStateChange?.('talking')
            break
          case 'final_answer':
            hasTerminalEvent = true
            if (!live2dState) handlers.onLive2dStateChange?.('idle')
            handlers.onFinalAnswer?.({
              messageId: typeof payload.messageId === 'string' ? payload.messageId : '',
              content: tokenContent,
              toolUsage: payload.toolUsage as StreamToolUsage | undefined,
              manualToolRequests: payload.manualToolRequests as ManualToolRequest[] | undefined,
            })
            break
          case 'stopped':
            hasTerminalEvent = true
            if (!live2dState) handlers.onLive2dStateChange?.('idle')
            handlers.onStopped?.()
            break
        }
      }
    }

    if (!hasTerminalEvent) {
      throw new Error('Stream ended before receiving a terminal event')
    }
  }
  catch (error) {
    throw normalizeRequestError(error)
  }
}

async function deleteMessage(id: string): Promise<void> {
  if (isMockMode()) {
    messages = messages.filter((message) => message.id !== id)
  }
}

export const messageService = {
  getMessages,
  sendMessage,
  regenerateMessage,
  stopMessage,
  dedupeMessages,
  streamMessage,
  deleteMessage,
}
