export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'sending' | 'streaming' | 'done' | 'error'
export type ToolStatus = 'calling' | 'success' | 'error'
export type ManualToolType = 'skill' | 'mcp'
export type ManualToolParamType = 'string' | 'number' | 'boolean' | 'enum'
export type ManualToolFailureReason = 'not_enabled' | 'invalid_params' | 'execution_error' | 'unknown'
export type ManualToolExecutionStatus = 'queued' | 'running' | 'success' | 'error'

export interface MessageAttachment {
  id: string
  name: string
  type: string
  url: string
  size: number
}

export interface ManualToolInputParams {
  goal?: string
  scope?: string
  output?: string
  notes?: string
  [key: string]: string | undefined
}

export interface ManualToolRequest {
  id: string
  type: ManualToolType
  targetId: string
  label: string
  inputText?: string
  inputParams?: ManualToolInputParams
  autoExecute?: boolean
  requiredFields?: string[]
  fieldTypes?: Record<string, ManualToolParamType>
  fieldOptions?: Record<string, string[]>
}

export interface ManualToolFailureHint {
  type: ManualToolType
  label: string
  targetId?: string
  summary?: string
  reason?: ManualToolFailureReason
  inputText?: string
  inputParams?: ManualToolInputParams
}

export interface ManualToolExecutionState {
  type: ManualToolType
  targetId: string
  label: string
  status: ManualToolExecutionStatus
  detail?: string
  updatedAt: string
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
