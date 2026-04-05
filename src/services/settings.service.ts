import { apiRequest, isMockMode } from '@/api'
import { isNetworkError, normalizeRequestError } from '@/api/errors'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'

const STORAGE_KEY = 'agent-live2d-settings'
let settings: AppSettings = { ...DEFAULT_SETTINGS }

function readCachedSettings(): AppSettings | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  }
  catch {
    return null
  }
}

function writeCachedSettings(nextSettings: AppSettings) {
  if (typeof window === 'undefined') return

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings))
}

function setSettingsCache(nextSettings: AppSettings) {
  settings = { ...DEFAULT_SETTINGS, ...nextSettings }
  writeCachedSettings(settings)
}

async function getSettings(): Promise<AppSettings> {
  const cachedSettings = readCachedSettings()
  if (cachedSettings) {
    settings = cachedSettings
  }

  if (isMockMode()) {
    return { ...settings }
  }

  const res = await apiRequest<AppSettings>('/api/settings')
  setSettingsCache({ ...DEFAULT_SETTINGS, ...res.data })
  return { ...settings }
}

async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  if (isMockMode()) {
    setSettingsCache({ ...settings, ...data })
    return { ...settings }
  }

  try {
    const res = await apiRequest<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    setSettingsCache({ ...DEFAULT_SETTINGS, ...res.data })
  }
  catch (error) {
    if (isNetworkError(error)) {
      // Keep settings editable when backend is temporarily offline.
      setSettingsCache({ ...settings, ...data })
      return { ...settings }
    }

    throw normalizeRequestError(error)
  }

  return { ...settings }
}

export const settingsService = {
  getSettings,
  updateSettings,
  getCachedSettings: readCachedSettings,
}
