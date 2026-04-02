export interface LongTermMemory {
  id: string
  conversationId?: string | null
  personaId?: string | null
  memoryScope: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  vectorId?: string | null
  createdAt: string
  updatedAt: string
}

export interface LongTermMemoryCreateInput {
  conversationId?: string | null
  personaId?: string | null
  memoryScope: string
  content: string
  tags: string[]
  metadata?: Record<string, unknown>
}

export interface MemorySearchInput {
  query: string
  conversationId?: string | null
  personaId?: string | null
  memoryScope?: string | null
  tags?: string[] | null
  limit?: number
}

export interface MemorySummaryResult {
  id: string
  summary: string
  sourceMessageCount: number
}
