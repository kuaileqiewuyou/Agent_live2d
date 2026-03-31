import { create } from 'zustand'
import type { Conversation, Message } from '@/types'

interface ConversationState {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  isLoadingMessages: boolean
  isSending: boolean
  searchQuery: string
  setConversations: (conversations: Conversation[]) => void
  setCurrentConversationId: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  setIsLoadingMessages: (v: boolean) => void
  setIsSending: (v: boolean) => void
  setSearchQuery: (query: string) => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoadingMessages: false,
  isSending: false,
  searchQuery: '',
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setIsLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),
  setIsSending: (isSending) => set({ isSending }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}))
