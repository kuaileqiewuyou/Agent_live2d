export const LEGACY_FILE_ACCESS_FOLDERS_KEY = 'agent-live2d-file-access-folders'

export type FileAccessReason = 'in_blacklist' | 'not_in_allowlist'

export interface FileAccessDecision {
  allowed: boolean
  reason?: FileAccessReason
  path?: string
  suggestedFolder?: string
}

export interface FileAccessPolicy {
  allowAll?: boolean | null
  folders?: string[]
  blacklist?: string[]
}

export function isLocalAbsolutePath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed) return false
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
  if (/^\\\\/.test(trimmed)) return true
  if (trimmed.startsWith('/')) return true
  return false
}

function isWindowsStylePath(path: string): boolean {
  return /^[a-zA-Z]:\//.test(path) || path.startsWith('//')
}

export function normalizeFileAccessFolderPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''

  let normalized = trimmed.replace(/\\/g, '/')
  if (normalized.startsWith('//')) {
    normalized = `//${normalized.slice(2).replace(/\/+/g, '/')}`
  }
  else {
    normalized = normalized.replace(/\/+/g, '/')
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = `${normalized[0].toUpperCase()}:${normalized.slice(2)}`
  }

  const isDriveRoot = /^[a-zA-Z]:\/$/.test(normalized)
  const isUnixRoot = normalized === '/'
  if (!isDriveRoot && !isUnixRoot) {
    normalized = normalized.replace(/\/+$/, '')
  }

  return normalized
}

export function normalizeFileAccessFolders(folders: string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const item of folders) {
    const normalizedPath = normalizeFileAccessFolderPath(item)
    if (!normalizedPath || !isLocalAbsolutePath(normalizedPath)) continue
    const key = isWindowsStylePath(normalizedPath) ? normalizedPath.toLowerCase() : normalizedPath
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(normalizedPath)
  }

  return normalized
}

export function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const normalizedTarget = normalizeFileAccessFolderPath(targetPath)
  const normalizedFolder = normalizeFileAccessFolderPath(folderPath)
  if (!normalizedTarget || !normalizedFolder) return false

  const caseInsensitive = isWindowsStylePath(normalizedTarget) || isWindowsStylePath(normalizedFolder)
  const target = caseInsensitive ? normalizedTarget.toLowerCase() : normalizedTarget
  const folder = caseInsensitive ? normalizedFolder.toLowerCase() : normalizedFolder

  if (target === folder) return true
  return target.startsWith(`${folder}/`)
}

export function getSuggestedFolderForPath(targetPath: string): string {
  const normalized = normalizeFileAccessFolderPath(targetPath)
  if (!normalized || !isLocalAbsolutePath(normalized)) return ''

  if (/^[a-zA-Z]:\/$/.test(normalized) || normalized === '/') return normalized

  if (/[\\/]$/.test(targetPath.trim())) return normalized

  const segments = normalized.split('/')
  const baseName = segments[segments.length - 1] || ''
  if (!baseName.includes('.')) {
    return normalized
  }
  segments.pop()
  return segments.join('/') || normalized
}

function normalizePolicy(policy?: FileAccessPolicy) {
  const allowAll = policy?.allowAll
  const folders = normalizeFileAccessFolders(policy?.folders || [])
  const blacklist = normalizeFileAccessFolders(policy?.blacklist || [])
  return { allowAll, folders, blacklist }
}

export function evaluateFileAccessPermission(targetPath: string, policy?: FileAccessPolicy): FileAccessDecision {
  if (!isLocalAbsolutePath(targetPath)) {
    return { allowed: true }
  }

  const normalizedTarget = normalizeFileAccessFolderPath(targetPath)
  if (!normalizedTarget) {
    return { allowed: true }
  }

  const suggestedFolder = getSuggestedFolderForPath(normalizedTarget)
  const { allowAll, folders, blacklist } = normalizePolicy(policy)

  if (blacklist.some(folder => isPathWithinFolder(normalizedTarget, folder))) {
    return {
      allowed: false,
      reason: 'in_blacklist',
      path: normalizedTarget,
      suggestedFolder,
    }
  }

  // Legacy behavior: when allowAll is not set, empty allow-list means compatible pass-through.
  if (allowAll == null) {
    if (folders.length === 0) {
      return {
        allowed: true,
        path: normalizedTarget,
        suggestedFolder,
      }
    }
    const matched = folders.some(folder => isPathWithinFolder(normalizedTarget, folder))
    return {
      allowed: matched,
      reason: matched ? undefined : 'not_in_allowlist',
      path: normalizedTarget,
      suggestedFolder,
    }
  }

  if (allowAll) {
    return {
      allowed: true,
      path: normalizedTarget,
      suggestedFolder,
    }
  }

  const matched = folders.some(folder => isPathWithinFolder(normalizedTarget, folder))
  return {
    allowed: matched,
    reason: matched ? undefined : 'not_in_allowlist',
    path: normalizedTarget,
    suggestedFolder,
  }
}

export function hasFileAccessPermission(
  targetPath: string,
  folders: string[],
  policy?: Omit<FileAccessPolicy, 'folders'>,
): boolean {
  return evaluateFileAccessPermission(targetPath, {
    ...policy,
    folders,
  }).allowed
}

export function readLegacyFileAccessFolders(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(LEGACY_FILE_ACCESS_FOLDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const folders = parsed.filter((item): item is string => typeof item === 'string')
    return normalizeFileAccessFolders(folders)
  }
  catch {
    return []
  }
}
