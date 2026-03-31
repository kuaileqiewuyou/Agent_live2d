import { create } from 'zustand'

interface AppState {
  initialized: boolean
  sidebarCollapsed: boolean
  setInitialized: (v: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  initialized: false,
  sidebarCollapsed: false,
  setInitialized: (initialized) => set({ initialized }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}))
