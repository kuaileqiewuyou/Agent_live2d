import { create } from 'zustand'

interface UIState {
  showPersonaDialog: boolean
  showModelConfigDialog: boolean
  showNewConversationDialog: boolean
  editingPersonaId: string | null
  editingModelConfigId: string | null
  setShowPersonaDialog: (v: boolean) => void
  setShowModelConfigDialog: (v: boolean) => void
  setShowNewConversationDialog: (v: boolean) => void
  setEditingPersonaId: (id: string | null) => void
  setEditingModelConfigId: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  showPersonaDialog: false,
  showModelConfigDialog: false,
  showNewConversationDialog: false,
  editingPersonaId: null,
  editingModelConfigId: null,
  setShowPersonaDialog: (showPersonaDialog) => set({ showPersonaDialog }),
  setShowModelConfigDialog: (showModelConfigDialog) => set({ showModelConfigDialog }),
  setShowNewConversationDialog: (showNewConversationDialog) => set({ showNewConversationDialog }),
  setEditingPersonaId: (editingPersonaId) => set({ editingPersonaId }),
  setEditingModelConfigId: (editingModelConfigId) => set({ editingModelConfigId }),
}))
