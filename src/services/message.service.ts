import type { ChatTurn, Message, MessageAttachment } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockMessages } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let messages: Message[] = [...mockMessages]

function normalizeMessage(message: Partial<Message> & Pick<Message, 'id' | 'conversationId' | 'role' | 'content' | 'senderType' | 'createdAt'>): Message {
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
    return messages.filter((m) => m.conversationId === conversationId)
  }
  const res = await apiRequest<ListResponse<Message>>(`/api/conversations/${conversationId}/messages`)
  return res.data.items.map(normalizeMessage)
}

async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: MessageAttachment[],
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
      content: '这是一个模拟回复，真实回复将由后端 Agent 生成。',
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
    body: JSON.stringify({ content, attachments }),
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

async function streamMessage(
  conversationId: string,
  content: string,
  handlers: {
    onMessageCreated?: (userMessageId: string) => void
    onThinking?: () => void
    onToolCalling?: () => void
    onToken?: (token: string) => void
    onFinalAnswer?: (messageId: string, content: string) => void
    onStopped?: () => void
  },
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  const response = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, attachments: [] }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Stream Error: ${response.status} ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      let dataPayload = ''
      for (const line of lines) {
        if (line.startsWith('event:'))
          eventName = line.slice(6).trim()
        if (line.startsWith('data:'))
          dataPayload += line.slice(5).trim()
      }
      if (!eventName || !dataPayload)
        continue
      const payload = JSON.parse(dataPayload)
      switch (eventName) {
        case 'message_created':
          handlers.onMessageCreated?.(payload.userMessageId)
          break
        case 'thinking':
          handlers.onThinking?.()
          break
        case 'tool_calling':
          handlers.onToolCalling?.()
          break
        case 'token':
          handlers.onToken?.(payload.content || '')
          break
        case 'final_answer':
          handlers.onFinalAnswer?.(payload.messageId, payload.content || '')
          break
        case 'stopped':
          handlers.onStopped?.()
          break
      }
    }
  }
}

async function deleteMessage(id: string): Promise<void> {
  if (isMockMode()) {
    messages = messages.filter((m) => m.id !== id)
  }
}

export const messageService = {
  getMessages,
  sendMessage,
  regenerateMessage,
  stopMessage,
  streamMessage,
  deleteMessage,
}
