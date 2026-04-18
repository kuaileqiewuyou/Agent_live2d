import { ApiRequestError } from '@/api/errors'
import { getSuggestedFolderForPath, type FileAccessReason } from '@/utils/file-access'

export interface ForbiddenPathViolation {
  code: 'forbidden_path'
  path: string
  reason: FileAccessReason | 'unknown'
  context?: string
  suggestedFolder?: string
  message: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeReason(value: unknown): FileAccessReason | 'unknown' {
  const text = toNonEmptyString(value)?.toLowerCase()
  if (!text) return 'unknown'
  if (text === 'in_blacklist') return 'in_blacklist'
  if (text === 'not_in_allowlist') return 'not_in_allowlist'
  return 'unknown'
}

function parsePathFromMessage(message: string): string {
  const direct = message.match(/forbidden[_\s]path:\s*(.+?)(?:(?:\.\s)|(?:\s\|)|$)/i)
  if (direct?.[1]) return direct[1].trim()

  const fallback = message.match(/forbidden\s+path:\s*(.+?)(?:(?:\.\s)|(?:\s\|)|$)/i)
  if (fallback?.[1]) return fallback[1].trim()

  return ''
}

function inferReasonFromMessage(message: string): FileAccessReason | 'unknown' {
  const lowered = message.toLowerCase()
  if (lowered.includes('blacklist') || lowered.includes('黑名单')) return 'in_blacklist'
  if (lowered.includes('allowlist') || lowered.includes('白名单')) return 'not_in_allowlist'
  return 'unknown'
}

function readDetailsFromError(error: unknown): Record<string, unknown> | null {
  if (error instanceof ApiRequestError) {
    return asRecord(error.details)
  }

  const record = asRecord(error)
  if (!record) return null
  return asRecord(record.details) || asRecord(record.data)
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()
  const record = asRecord(error)
  if (!record) return ''
  return toNonEmptyString(record.message) || ''
}

function extractCode(error: unknown): string {
  if (error instanceof ApiRequestError) return (error.code || '').trim().toLowerCase()

  const record = asRecord(error)
  if (!record) return ''
  const ownCode = toNonEmptyString(record.code)
  if (ownCode) return ownCode.toLowerCase()

  const data = asRecord(record.data)
  return (toNonEmptyString(data?.code) || '').toLowerCase()
}

export function parseForbiddenPathViolation(error: unknown): ForbiddenPathViolation | null {
  const code = extractCode(error)
  const message = extractMessage(error)
  const details = readDetailsFromError(error)

  const isForbiddenCode = code === 'forbidden_path'
  const hasForbiddenMessage = /forbidden[_\s]path/i.test(message)
  if (!isForbiddenCode && !hasForbiddenMessage) {
    return null
  }

  const detailPath = toNonEmptyString(details?.path) || toNonEmptyString(details?.targetPath)
  const parsedPath = detailPath || parsePathFromMessage(message)
  if (!parsedPath) return null

  const detailReason = normalizeReason(details?.reason)
  const reason = detailReason !== 'unknown' ? detailReason : inferReasonFromMessage(message)
  const context = toNonEmptyString(details?.context) || undefined
  const suggestedFolder = toNonEmptyString(details?.suggestedFolder)
    || toNonEmptyString(details?.suggested_folder)
    || getSuggestedFolderForPath(parsedPath)

  return {
    code: 'forbidden_path',
    path: parsedPath,
    reason,
    context,
    suggestedFolder,
    message: message || `forbidden_path: ${parsedPath}`,
  }
}
