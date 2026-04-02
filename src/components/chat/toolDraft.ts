import type { ManualToolRequest } from '@/types'

export const TOOL_DRAFT_STORAGE_KEY = 'agent-live2d-tool-drafts'
export const COMPOSER_DRAFT_STORAGE_KEY = 'agent-live2d-composer-drafts'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
type StorageLike = StorageReader & StorageWriter
type ToolDraftMap = Record<string, ManualToolRequest[]>
type ComposerDraftMap = Record<string, string>

type ParsedParams = Record<string, string>

const LEGACY_KEY_MAP: Record<string, string> = {
  目标: 'goal',
  查询目标: 'goal',
  范围: 'scope',
  时间范围: 'scope',
  输出: 'output',
  输出格式: 'output',
  备注: 'notes',
}

function normalizeLegacyKey(raw: string) {
  const normalized = raw.trim()
  return LEGACY_KEY_MAP[normalized] || normalized
}

function parseTextParams(inputText?: string): ParsedParams {
  if (!inputText?.trim()) return {}

  const parsed: ParsedParams = {}
  const lines = inputText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const match = line.match(/^([^:：]+)\s*[:：]\s*(.+)$/)
    if (!match) continue
    const [, rawKey, rawValue] = match
    const key = normalizeLegacyKey(rawKey)
    const value = rawValue.trim()
    if (value) parsed[key] = value
  }

  return parsed
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function hasToolParams(request: ManualToolRequest) {
  if (request.inputText?.trim()) return true
  if (!request.inputParams) return false
  return Object.values(request.inputParams).some(value => typeof value === 'string' && value.trim())
}

export function getMissingRequiredParams(request: ManualToolRequest): string[] {
  const required = Array.isArray(request.requiredFields)
    ? request.requiredFields.map(item => item.trim()).filter(Boolean)
    : []
  if (required.length === 0) return []

  const fromText = parseTextParams(request.inputText)
  const params = { ...fromText, ...(request.inputParams || {}) }

  return required.filter((key) => {
    const value = params[key]
    return !(typeof value === 'string' && value.trim())
  })
}

export function getInvalidTypedParams(request: ManualToolRequest): string[] {
  const fieldTypes = request.fieldTypes || {}
  const keys = Object.keys(fieldTypes)
  if (keys.length === 0) return []

  const fromText = parseTextParams(request.inputText)
  const params = { ...fromText, ...(request.inputParams || {}) }

  return keys.filter((key) => {
    const type = fieldTypes[key]
    const raw = params[key]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) return false

    if (type === 'number') {
      const numeric = Number(value)
      return !Number.isFinite(numeric)
    }

    if (type === 'boolean') {
      return parseBoolean(value) === null
    }

    if (type === 'enum') {
      const options = request.fieldOptions?.[key] || []
      if (options.length === 0) return false
      return !options.includes(value)
    }

    return false
  })
}

export function buildToolFallbackContent(
  requests: ManualToolRequest[],
  conversationTitle?: string,
) {
  if (requests.length === 0) return ''
  const labels = requests.map(request => `「${request.label}」`).join('、')
  const context = conversationTitle ? `会话「${conversationTitle}」` : '当前会话'
  return `请优先调用 ${labels}，结合 ${context} 的上下文帮我处理这次任务。`
}

export function readToolDraftMap(storage?: StorageLike | null): ToolDraftMap {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return {}

  try {
    const raw = targetStorage.getItem(TOOL_DRAFT_STORAGE_KEY)
    return raw ? JSON.parse(raw) as ToolDraftMap : {}
  }
  catch {
    return {}
  }
}

export function writeToolDraftMap(nextMap: ToolDraftMap, storage?: StorageLike | null) {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return
  targetStorage.setItem(TOOL_DRAFT_STORAGE_KEY, JSON.stringify(nextMap))
}

export function getToolDraftForConversation(conversationId: string, storage?: StorageLike | null) {
  return readToolDraftMap(storage)[conversationId] || []
}

export function persistToolDraftForConversation(
  conversationId: string,
  requests: ManualToolRequest[],
  storage?: StorageLike | null,
) {
  const nextMap = readToolDraftMap(storage)
  if (requests.length === 0) {
    delete nextMap[conversationId]
  }
  else {
    nextMap[conversationId] = requests
  }
  writeToolDraftMap(nextMap, storage)
}

export function readComposerDraftMap(storage?: StorageLike | null): ComposerDraftMap {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return {}

  try {
    const raw = targetStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY)
    return raw ? JSON.parse(raw) as ComposerDraftMap : {}
  }
  catch {
    return {}
  }
}

export function writeComposerDraftMap(nextMap: ComposerDraftMap, storage?: StorageLike | null) {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return
  targetStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, JSON.stringify(nextMap))
}

export function getComposerDraftForConversation(conversationId: string, storage?: StorageLike | null) {
  return readComposerDraftMap(storage)[conversationId] || ''
}

export function persistComposerDraftForConversation(
  conversationId: string,
  content: string,
  storage?: StorageLike | null,
) {
  const nextMap = readComposerDraftMap(storage)
  if (!content.trim()) {
    delete nextMap[conversationId]
  }
  else {
    nextMap[conversationId] = content
  }
  writeComposerDraftMap(nextMap, storage)
}
