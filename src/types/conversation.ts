export type ChatLayoutMode = 'chat' | 'companion'

export interface Conversation {
  id: string
  title: string
  personaId: string
  layoutMode: ChatLayoutMode
  modelConfigId: string
  enabledSkillIds: string[]
  enabledMcpServerIds: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
  lastMessage?: string
}

export interface CreateConversationInput {
  title?: string
  personaId: string
  modelConfigId: string
  layoutMode: ChatLayoutMode
  enabledSkillIds: string[]
  enabledMcpServerIds: string[]
  pinned: boolean
  inheritPersonaLongTermMemory?: boolean
}

export interface UpdateConversationInput {
  title?: string
  personaId?: string
  modelConfigId?: string
  layoutMode?: ChatLayoutMode
  enabledSkillIds?: string[]
  enabledMcpServerIds?: string[]
  pinned?: boolean
}
