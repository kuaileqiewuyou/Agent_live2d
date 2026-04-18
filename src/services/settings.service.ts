import { apiRequest, isMockMode } from '@/api'
import { isNetworkError, normalizeRequestError } from '@/api/errors'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'
import { normalizeFileAccessFolders, readLegacyFileAccessFolders } from '@/utils'

const STORAGE_KEY = 'agent-live2d-settings'
const FILE_ACCESS_MIGRATION_KEY = 'agent-live2d-file-access-migrated-v1'
let settings: AppSettings = { ...DEFAULT_SETTINGS }

function normalizeAppSettings(raw: Partial<AppSettings>): AppSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...raw,
  }

  const fileAccessFolders = normalizeFileAccessFolders(merged.fileAccessFolders || [])
  const fileAccessBlacklist = normalizeFileAccessFolders(merged.fileAccessBlacklist || [])
  const fileAccessAllowAll = typeof merged.fileAccessAllowAll === 'boolean'
    ? merged.fileAccessAllowAll
    : fileAccessFolders.length === 0

  return {
    ...merged,
    fileAccessMode: 'compat',
    fileAccessAllowAll,
    fileAccessFolders,
    fileAccessBlacklist,
  }
}

function readCachedSettings(): AppSettings | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return normalizeAppSettings(JSON.parse(stored))
  }
  catch {
    return null
  }
}

function writeCachedSettings(nextSettings: AppSettings) {
  if (typeof window === 'undefined') return

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings))
}

function setSettingsCache(nextSettings: Partial<AppSettings>) {
  settings = normalizeAppSettings(nextSettings)
  writeCachedSettings(settings)
}

function markFileAccessMigrated() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FILE_ACCESS_MIGRATION_KEY, '1')
}

function isFileAccessMigrated(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(FILE_ACCESS_MIGRATION_KEY) === '1'
}

async function maybeMigrateLegacyFileAccessFolders(remoteSettings: AppSettings): Promise<AppSettings> {
  if (isMockMode()) return remoteSettings

  const alreadyConfigured = (
    remoteSettings.fileAccessAllowAll === false
    || remoteSettings.fileAccessFolders.length > 0
    || remoteSettings.fileAccessBlacklist.length > 0
  )
  if (alreadyConfigured) {
    markFileAccessMigrated()
    return remoteSettings
  }

  if (isFileAccessMigrated()) return remoteSettings

  const legacyFolders = readLegacyFileAccessFolders()
  if (legacyFolders.length === 0) {
    markFileAccessMigrated()
    return remoteSettings
  }

  const mergedSettings = normalizeAppSettings({
    ...remoteSettings,
    fileAccessAllowAll: false,
    fileAccessFolders: legacyFolders,
  })

  try {
    const res = await apiRequest<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        fileAccessMode: 'compat',
        fileAccessAllowAll: false,
        fileAccessFolders: legacyFolders,
      }),
    })
    const normalized = normalizeAppSettings(res.data)
    markFileAccessMigrated()
    return normalized
  }
  catch {
    // Keep migration result in memory even when backend is temporarily unreachable.
    return mergedSettings
  }
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
  const remoteSettings = normalizeAppSettings(res.data)
  const mergedSettings = await maybeMigrateLegacyFileAccessFolders(remoteSettings)
  setSettingsCache(mergedSettings)
  return { ...settings }
}

async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const normalizedPayload = {
    ...data,
    fileAccessMode: 'compat' as const,
    fileAccessAllowAll: typeof data.fileAccessAllowAll === 'boolean' ? data.fileAccessAllowAll : undefined,
    fileAccessFolders: data.fileAccessFolders
      ? normalizeFileAccessFolders(data.fileAccessFolders)
      : undefined,
    fileAccessBlacklist: data.fileAccessBlacklist
      ? normalizeFileAccessFolders(data.fileAccessBlacklist)
      : undefined,
  }

  if (isMockMode()) {
    setSettingsCache({
      ...settings,
      ...normalizedPayload,
      fileAccessMode: 'compat',
      fileAccessAllowAll: normalizedPayload.fileAccessAllowAll ?? settings.fileAccessAllowAll,
      fileAccessFolders: normalizedPayload.fileAccessFolders ?? settings.fileAccessFolders,
      fileAccessBlacklist: normalizedPayload.fileAccessBlacklist ?? settings.fileAccessBlacklist,
    })
    return { ...settings }
  }

  try {
    const res = await apiRequest<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(normalizedPayload),
    })
    setSettingsCache(res.data)
    markFileAccessMigrated()
  }
  catch (error) {
    if (isNetworkError(error)) {
      // Keep settings editable when backend is temporarily offline.
      setSettingsCache({
        ...settings,
        ...normalizedPayload,
        fileAccessMode: 'compat',
        fileAccessAllowAll: normalizedPayload.fileAccessAllowAll ?? settings.fileAccessAllowAll,
        fileAccessFolders: normalizedPayload.fileAccessFolders ?? settings.fileAccessFolders,
        fileAccessBlacklist: normalizedPayload.fileAccessBlacklist ?? settings.fileAccessBlacklist,
      })
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
