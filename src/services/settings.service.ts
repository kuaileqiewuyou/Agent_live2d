import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'

const STORAGE_KEY = 'agent-live2d-settings'
let settings: AppSettings = { ...DEFAULT_SETTINGS }

async function getSettings(): Promise<AppSettings> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  }
  return { ...settings }
}

async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  settings = { ...settings, ...data }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  return { ...settings }
}

export const settingsService = {
  getSettings,
  updateSettings,
}
