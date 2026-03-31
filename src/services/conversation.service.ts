import type { Conversation } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockConversations } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let conversations: Conversation[] = [...mockConversations]

async function getConversations(): Promise<Conversation[]> {
  if (isMockMode()) {
    return [...conversations]
  }
  const res = await apiRequest<ListResponse<Conversation>>('/api/conversations')
  return res.data.items
}

async function getConversation(id: string): Promise<Conversation | undefined> {
  if (isMockMode()) {
    return conversations.find((c) => c.id === id)
  }
  const res = await apiRequest<Conversation>(`/api/conversations/${id}`)
  return res.data
}

async function createConversation(
  data: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Conversation> {
  if (isMockMode()) {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    conversations.unshift(conversation)
    return conversation
  }
  const res = await apiRequest<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.data
}

async function updateConversation(
  id: string,
  data: Partial<Conversation>
): Promise<Conversation> {
  if (isMockMode()) {
    const index = conversations.findIndex((c) => c.id === id)
    if (index === -1) {
      throw new Error(`Conversation not found: ${id}`)
    }
    const updated: Conversation = {
      ...conversations[index],
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    }
    conversations[index] = updated
    return updated
  }
  const res = await apiRequest<Conversation>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return res.data
}

async function deleteConversation(id: string): Promise<void> {
  if (isMockMode()) {
    conversations = conversations.filter((c) => c.id !== id)
    return
  }
  await apiRequest<void>(`/api/conversations/${id}`, {
    method: 'DELETE',
  })
}

export const conversationService = {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
}
