import type { ChatLayoutMode } from './conversation'

export interface Persona {
  id: string
  name: string
  avatar: string
  description: string
  personalityTags: string[]
  speakingStyle: string
  backgroundStory: string
  openingMessage: string
  longTermMemoryEnabled: boolean
  live2dModel?: string
  defaultLayoutMode: ChatLayoutMode
  systemPromptTemplate: string
  createdAt: string
  updatedAt: string
}
