export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'sending' | 'streaming' | 'done' | 'error'
export type ToolStatus = 'calling' | 'success' | 'error'

export interface MessageAttachment {
  id: string
  name: string
  type: string
  url: string
  size: number
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  senderType: 'user' | 'assistant' | 'agent' | 'system' | 'tool'
  senderName?: string
  agentName?: string
  toolName?: string
  toolStatus?: ToolStatus
  reasoning?: string
  attachments?: MessageAttachment[]
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ChatTurn {
  userMessage: Message
  assistantMessage: Message
}
