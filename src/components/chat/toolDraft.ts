import type { ManualToolRequest } from '@/types'

export const TOOL_DRAFT_STORAGE_KEY = 'agent-live2d-tool-drafts'
export const COMPOSER_DRAFT_STORAGE_KEY = 'agent-live2d-composer-drafts'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
type StorageLike = StorageReader & StorageWriter
type ToolDraftMap = Record<string, ManualToolRequest[]>
type ComposerDraftMap = Record<string, string>

type ParsedParams = Record<string, string>

export type ManualToolValidationIssueCode = 'required' | 'number' | 'boolean' | 'enum' | 'unknown'

export interface ManualToolBackendValidationIssue {
  requestIndex: number
  field: string
  code: ManualToolValidationIssueCode
  detail?: string
  raw: string
}

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

export function buildManualToolValidationErrorMessage(
  request: ManualToolRequest,
  requestIndex = 0,
): string | null {
  const issues: string[] = []
  const missingFields = getMissingRequiredParams(request)
  for (const field of missingFields) {
    issues.push(`${field} is required`)
  }

  const fieldTypes = request.fieldTypes || {}
  const keys = Object.keys(fieldTypes)
  if (keys.length > 0) {
    const fromText = parseTextParams(request.inputText)
    const params = { ...fromText, ...(request.inputParams || {}) }

    for (const key of keys) {
      const rawType = fieldTypes[key]
      const raw = params[key]
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (!value) continue

      if (rawType === 'number') {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) {
          issues.push(`${key} should be a number`)
        }
        continue
      }

      if (rawType === 'boolean') {
        if (parseBoolean(value) === null) {
          issues.push(`${key} should be true/false`)
        }
        continue
      }

      if (rawType === 'enum') {
        const options = request.fieldOptions?.[key] || []
        if (options.length > 0 && !options.includes(value)) {
          issues.push(`${key} should be one of ${options.join(', ')}`)
        }
      }
    }
  }

  if (issues.length === 0) return null
  return `manualToolRequests[${requestIndex}] invalid params: ${issues.join('; ')}`
}

function toIssueCode(rawIssue: string): { field: string, code: ManualToolValidationIssueCode, detail?: string } | null {
  const issue = rawIssue.trim()
  if (!issue) return null

  let match = issue.match(/^(.+?)\s+is required$/i)
  if (match) {
    return { field: match[1].trim(), code: 'required' }
  }

  match = issue.match(/^(.+?)\s+should be a number$/i)
  if (match) {
    return { field: match[1].trim(), code: 'number' }
  }

  match = issue.match(/^(.+?)\s+should be true\/false$/i)
  if (match) {
    return { field: match[1].trim(), code: 'boolean' }
  }

  match = issue.match(/^(.+?)\s+should be one of\s+(.+)$/i)
  if (match) {
    return { field: match[1].trim(), code: 'enum', detail: match[2].trim() }
  }

  const unknownMatch = issue.match(/^([A-Za-z0-9_.-]+)\b/)
  if (unknownMatch) {
    return { field: unknownMatch[1].trim(), code: 'unknown' }
  }

  return null
}

export function parseManualToolBackendValidationIssues(message: string): ManualToolBackendValidationIssue[] {
  const normalized = message.trim()
  if (!normalized) return []

  const prefixMatch = normalized.match(/^manualToolRequests\[(\d+)\]\s+invalid params:\s*(.+)$/i)
  if (!prefixMatch) return []

  const requestIndex = Number(prefixMatch[1])
  if (!Number.isInteger(requestIndex) || requestIndex < 0) return []

  const issuePart = prefixMatch[2].trim()
  if (!issuePart) return []

  const issues = issuePart
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)

  const parsedIssues: ManualToolBackendValidationIssue[] = []
  for (const issue of issues) {
    const parsed = toIssueCode(issue)
    if (!parsed) continue
    parsedIssues.push({
      requestIndex,
      field: parsed.field,
      code: parsed.code,
      ...(parsed.detail ? { detail: parsed.detail } : {}),
      raw: issue,
    })
  }
  return parsedIssues
}

export function formatManualToolBackendValidationIssue(issue: ManualToolBackendValidationIssue): string {
  if (issue.code === 'required') {
    return `${issue.field} 为必填项`
  }
  if (issue.code === 'number') {
    return `${issue.field} 需要 number 类型`
  }
  if (issue.code === 'boolean') {
    return `${issue.field} 需要 true/false`
  }
  if (issue.code === 'enum') {
    return `${issue.field} 需为以下值之一：${issue.detail || ''}`.trim()
  }
  return `${issue.field} 参数不合法`
}

export function buildManualToolBackendValidationHint(message: string): string | null {
  const issues = parseManualToolBackendValidationIssues(message)
  if (issues.length === 0) return null
  const first = issues[0]
  const indexLabel = first.requestIndex + 1
  const issueText = issues.slice(0, 2).map(formatManualToolBackendValidationIssue).join('；')
  return `Tool #${indexLabel} 参数校验失败：${issueText}`
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
