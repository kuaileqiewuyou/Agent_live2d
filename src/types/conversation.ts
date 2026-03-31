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
