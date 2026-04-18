import { apiRequest } from '@/api'
import type {
  MemoryDeleteResult,
  LongTermMemory,
  LongTermMemoryCreateInput,
  MemorySearchInput,
  MemorySummaryResult,
} from '@/types'

interface ListResponse<T> {
  items: T[]
  total: number
}

async function listLongTermMemories(): Promise<LongTermMemory[]> {
  const res = await apiRequest<ListResponse<LongTermMemory>>('/api/memory/long-term')
  return res.data.items
}

async function createLongTermMemory(payload: LongTermMemoryCreateInput): Promise<LongTermMemory> {
  const res = await apiRequest<LongTermMemory>('/api/memory/long-term', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data
}

async function searchMemories(payload: MemorySearchInput): Promise<LongTermMemory[]> {
  const res = await apiRequest<ListResponse<LongTermMemory>>('/api/memory/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data.items
}

async function summarizeConversation(conversationId: string): Promise<MemorySummaryResult> {
  const res = await apiRequest<MemorySummaryResult>('/api/memory/summarize', {
    method: 'POST',
    body: JSON.stringify({ conversationId, force: true }),
  })
  return res.data
}

async function deleteLongTermMemory(memoryId: string): Promise<MemoryDeleteResult> {
  const res = await apiRequest<MemoryDeleteResult>(`/api/memory/long-term/${memoryId}`, {
    method: 'DELETE',
  })
  return res.data
}

export const memoryService = {
  listLongTermMemories,
  createLongTermMemory,
  searchMemories,
  summarizeConversation,
  deleteLongTermMemory,
}
