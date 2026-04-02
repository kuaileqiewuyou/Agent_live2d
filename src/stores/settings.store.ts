import { create } from 'zustand'
import type { AppSettings, ThemeMode } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'
import { settingsService } from '@/services'

interface SettingsState {
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  updateSettings: (updates: Partial<AppSettings>) => void
  setTheme: (theme: ThemeMode) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: settingsService.getCachedSettings() || { ...DEFAULT_SETTINGS },
  setSettings: (settings) => set({ settings }),
  updateSettings: (updates) =>
    set((s) => ({ settings: { ...s.settings, ...updates } })),
  setTheme: (theme) =>
    set((s) => ({ settings: { ...s.settings, theme } })),
}))
