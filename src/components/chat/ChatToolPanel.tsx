import { AlertTriangle, Cable, Play, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Wrench } from 'lucide-react'
import type {
  MCPServer,
  ManualToolFailureHint,
  ManualToolInputParams,
  ManualToolParamType,
  ManualToolRequest,
  Skill,
} from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, generateId } from '@/utils'
import {
  buildManualToolValidationErrorMessage,
  formatManualToolBackendValidationIssue,
  getInvalidTypedParams,
  type ManualToolBackendValidationIssue,
} from '@/components/chat/toolDraft'

interface ChatToolPanelProps {
  skills: Skill[]
  mcpServers: MCPServer[]
  selectedRequests: ManualToolRequest[]
  recentToolFailures?: ManualToolFailureHint[]
  backendValidationIssues?: ManualToolBackendValidationIssue[]
  conversationTitle?: string
  personaName?: string
  disabled?: boolean
  onChange: (requests: ManualToolRequest[]) => void
  onQuickSend: (request: ManualToolRequest, defaultContent: string) => void
  onOpenConversationSettings?: () => void
  onOpenMcpCenter?: () => void
}

interface ToolParamFieldDef {
  key: string
  label: string
  placeholder: string
  help?: string
  required?: boolean
  dataType?: ManualToolParamType
  enumOptions?: string[]
}

interface ToolItem {
  kind: 'skill' | 'mcp'
  id: string
  name: string
  description: string
  fieldDefs: ToolParamFieldDef[]
}

type ParsedToolParams = Record<string, string>

const DEFAULT_SKILL_FIELDS: ToolParamFieldDef[] = [
  { key: 'goal', label: '目标', placeholder: '例如：本轮希望 Tool 完成什么？', dataType: 'string' },
  { key: 'scope', label: '范围', placeholder: '例如：时间范围、输入边界、约束条件', dataType: 'string' },
  { key: 'output', label: '输出', placeholder: '例如：返回格式、字段结构、语言要求', dataType: 'string' },
  { key: 'notes', label: '备注', placeholder: '可选补充信息', dataType: 'string' },
]

const DEFAULT_MCP_FIELDS: ToolParamFieldDef[] = [
  { key: 'goal', label: '查询目标', placeholder: '例如：本次要获取哪些信息？', dataType: 'string' },
  { key: 'scope', label: '查询范围', placeholder: '例如：时间窗口、数据范围、过滤条件', dataType: 'string' },
  { key: 'output', label: '输出要求', placeholder: '例如：列表、摘要、结构化结果', dataType: 'string' },
  { key: 'notes', label: '备注', placeholder: '可选补充信息', dataType: 'string' },
]

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

function prettifyKey(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function resolveFieldType(item: Record<string, unknown>): ManualToolParamType {
  if (Array.isArray(item.enum) && item.enum.length > 0) {
    return 'enum'
  }

  const rawType = item.type
  if (typeof rawType === 'string') {
    if (rawType === 'number' || rawType === 'integer') return 'number'
    if (rawType === 'boolean') return 'boolean'
    return 'string'
  }

  if (Array.isArray(rawType)) {
    if (rawType.includes('number') || rawType.includes('integer')) return 'number'
    if (rawType.includes('boolean')) return 'boolean'
  }

  return 'string'
}

function getFieldTypeTag(type: ManualToolParamType) {
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'enum') return 'enum'
  return 'string'
}

function hasAnyInputParams(params?: ManualToolInputParams) {
  if (!params) return false
  return Object.values(params).some(value => typeof value === 'string' && value.trim())
}

function toParsedToolParams(params?: ManualToolInputParams): ParsedToolParams {
  if (!params) return {}
  const parsed: ParsedToolParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) parsed[key] = value.trim()
  }
  return parsed
}

function toInputParams(params: ParsedToolParams): ManualToolInputParams {
  const normalized: ManualToolInputParams = {}
  for (const [key, value] of Object.entries(params)) {
    const trimmed = value.trim()
    if (trimmed) normalized[key] = trimmed
  }
  return normalized
}

function parseToolParams(inputText?: string): ParsedToolParams {
  const params: ParsedToolParams = {}
  if (!inputText?.trim()) return params

  const unmatchedLines: string[] = []
  const lines = inputText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const line of lines) {
    const match = line.match(/^([^:：]+)\s*[:：]\s*(.+)$/)
    if (!match) {
      unmatchedLines.push(line)
      continue
    }
    const [, rawKey, rawValue] = match
    const key = normalizeLegacyKey(rawKey)
    const value = rawValue.trim()
    if (value) params[key] = value
  }

  if (unmatchedLines.length > 0) {
    const notes = unmatchedLines.join('\n').trim()
    if (notes) params.notes = params.notes ? `${params.notes}\n${notes}` : notes
  }

  return params
}

function composeToolParams(params: ParsedToolParams, orderedKeys: string[] = []) {
  const lines: string[] = []
  const used = new Set<string>()

  for (const key of orderedKeys) {
    const value = params[key]
    if (value && value.trim()) {
      lines.push(`${key}: ${value.trim()}`)
      used.add(key)
    }
  }

  for (const key of Object.keys(params).sort()) {
    if (used.has(key)) continue
    const value = params[key]
    if (value && value.trim()) lines.push(`${key}: ${value.trim()}`)
  }

  return lines.join('\n')
}

function getMissingRequiredFields(request: ManualToolRequest) {
  const required = Array.isArray(request.requiredFields)
    ? request.requiredFields.map(item => item.trim()).filter(Boolean)
    : []
  if (required.length === 0) return []

  const fromText = parseToolParams(request.inputText)
  const fromParams = request.inputParams ? toParsedToolParams(request.inputParams) : {}
  const combined = { ...fromText, ...fromParams }

  return required.filter((key) => {
    const value = combined[key]
    return !(typeof value === 'string' && value.trim())
  })
}

function getSkillFieldDefs(skill: Skill): ToolParamFieldDef[] {
  const schema = skill.configSchema
  if (!schema || typeof schema !== 'object') return DEFAULT_SKILL_FIELDS

  const schemaObject = schema as Record<string, unknown>
  const propertiesRaw = schemaObject.properties
  if (!propertiesRaw || typeof propertiesRaw !== 'object') return DEFAULT_SKILL_FIELDS

  const properties = propertiesRaw as Record<string, unknown>
  const requiredSet = new Set(
    Array.isArray(schemaObject.required)
      ? schemaObject.required.filter(item => typeof item === 'string')
      : [],
  )

  const defs = Object.entries(properties).map(([key, raw]) => {
    const item = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const label = typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : prettifyKey(key)
    const help = typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : undefined
    const dataType = resolveFieldType(item)
    const enumOptions = Array.isArray(item.enum)
      ? item.enum
        .filter(value => ['string', 'number', 'boolean'].includes(typeof value))
        .map(value => String(value))
      : undefined
    const placeholder = dataType === 'number'
      ? `请输入数值（${label}）`
      : dataType === 'boolean'
        ? '请选择 true / false'
        : dataType === 'enum'
          ? `请选择 ${label}`
          : (help || `请输入 ${label}`)
    return {
      key,
      label,
      placeholder,
      help,
      required: requiredSet.has(key),
      dataType,
      enumOptions,
    } satisfies ToolParamFieldDef
  })

  return defs.length > 0 ? defs : DEFAULT_SKILL_FIELDS
}

function buildRequest(
  type: 'skill' | 'mcp',
  targetId: string,
  label: string,
  fieldDefs: ToolParamFieldDef[],
  previous?: ManualToolRequest,
): ManualToolRequest {
  const parsed = previous?.inputParams
    ? toParsedToolParams(previous.inputParams)
    : parseToolParams(previous?.inputText)

  const requiredFields = fieldDefs
    .filter(field => field.required)
    .map(field => field.key)
  const fieldTypes = fieldDefs.reduce<Record<string, ManualToolParamType>>((acc, field) => {
    acc[field.key] = field.dataType || 'string'
    return acc
  }, {})
  const fieldOptions = fieldDefs.reduce<Record<string, string[]>>((acc, field) => {
    if (field.dataType === 'enum' && field.enumOptions && field.enumOptions.length > 0) {
      acc[field.key] = field.enumOptions
    }
    return acc
  }, {})

  return {
    id: previous?.id || generateId(),
    type,
    targetId,
    label,
    inputText: composeToolParams(parsed, fieldDefs.map(field => field.key)),
    inputParams: toInputParams(parsed),
    autoExecute: previous?.autoExecute ?? false,
    requiredFields: requiredFields.length > 0 ? requiredFields : undefined,
    fieldTypes,
    fieldOptions: Object.keys(fieldOptions).length > 0 ? fieldOptions : undefined,
  }
}

function createSkillDefaultContent(skillName: string, conversationTitle?: string, personaName?: string) {
  const context = conversationTitle ? `会话「${conversationTitle}」` : '当前会话'
  const personaHint = personaName ? `，并保持 Persona「${personaName}」的说话风格` : ''
  return `请优先调用「${skillName}」，结合${context}的上下文帮我处理这次任务${personaHint}。`
}

function createMcpDefaultContent(serverName: string, conversationTitle?: string) {
  const context = conversationTitle ? `会话「${conversationTitle}」` : '当前会话'
  return `请调用 MCP 服务「${serverName}」，为${context}获取这次需要的信息。`
}

function getFailureSummaryText(failure: ManualToolFailureHint) {
  if (failure.summary?.trim()) return failure.summary.trim()
  if (failure.reason === 'not_enabled') return '该 Tool 当前未在会话中启用。'
  if (failure.reason === 'invalid_params') return '参数校验失败，请补全或修正字段后重试。'
  if (failure.reason === 'execution_error') return '执行过程中出现错误，请检查连接状态后重试。'
  return '上一次调用未成功，请根据提示修复后重试。'
}

function getFailureSuggestionText(failure: ManualToolFailureHint) {
  if (failure.type === 'skill') {
    if (failure.reason === 'not_enabled') return '建议先在会话设置中启用该 Skill，再重新附加本轮。'
    if (failure.reason === 'invalid_params') return '建议先补全必填参数并修正参数类型，再执行。'
    return '建议先重新附加到本轮，必要时检查 Skill 配置后再试。'
  }

  if (failure.reason === 'not_enabled') return '建议先确认会话已绑定该 MCP 服务，再重试。'
  return '建议先检查 MCP 连接状态与配置，再重试。'
}

function isTextareaField(key: string) {
  return key.toLowerCase() === 'notes'
}

function withRequest(requests: ManualToolRequest[], request: ManualToolRequest) {
  const index = requests.findIndex(item => item.id === request.id)
  if (index === -1) return [...requests, request]

  const next = [...requests]
  next[index] = request
  return next
}

export function ChatToolPanel({
  skills,
  mcpServers,
  selectedRequests,
  recentToolFailures = [],
  backendValidationIssues = [],
  conversationTitle,
  personaName,
  disabled = false,
  onChange,
  onQuickSend,
  onOpenConversationSettings,
  onOpenMcpCenter,
}: ChatToolPanelProps) {
  const toolItems: ToolItem[] = [
    ...skills.map(skill => ({
      kind: 'skill' as const,
      id: skill.id,
      name: skill.name,
      description: skill.description,
      fieldDefs: getSkillFieldDefs(skill),
    })),
    ...mcpServers.map(server => ({
      kind: 'mcp' as const,
      id: server.id,
      name: server.name,
      description: server.description,
      fieldDefs: DEFAULT_MCP_FIELDS,
    })),
  ]
  const toolItemMap = new Map(toolItems.map(item => [`${item.kind}:${item.id}`, item] as const))

  const toggleRequest = (item: ToolItem) => {
    const existing = selectedRequests.find(request => request.type === item.kind && request.targetId === item.id)
    if (existing) {
      onChange(selectedRequests.filter(request => request.id !== existing.id))
      return
    }
    onChange([...selectedRequests, buildRequest(item.kind, item.id, item.name, item.fieldDefs)])
  }

  const updateParamField = (request: ManualToolRequest, fieldKey: string, value: string, orderedKeys: string[]) => {
    const current = request.inputParams
      ? toParsedToolParams(request.inputParams)
      : parseToolParams(request.inputText)
    const next: ParsedToolParams = { ...current, [fieldKey]: value }

    onChange(
      selectedRequests.map(item => (
        item.id === request.id
          ? {
              ...item,
              inputText: composeToolParams(next, orderedKeys),
              inputParams: toInputParams(next),
            }
          : item
      )),
    )
  }

  const buildRetryRequest = (failure: ManualToolFailureHint) => {
    if (!failure.targetId) return null

    const item = toolItemMap.get(`${failure.type}:${failure.targetId}`)
    if (!item) return null

    const existing = selectedRequests.find(request => request.type === item.kind && request.targetId === item.id)
    const previous: ManualToolRequest = existing || {
      id: generateId(),
      type: item.kind,
      targetId: item.id,
      label: item.name,
      inputText: failure.inputText,
      inputParams: failure.inputParams,
    }
    return buildRequest(item.kind, item.id, item.name, item.fieldDefs, previous)
  }

  const clearAll = () => onChange([])
  const filledInputCount = selectedRequests.filter(request => (
    request.inputText?.trim() || hasAnyInputParams(request.inputParams)
  )).length
  const missingRequiredCount = selectedRequests.filter(request => getMissingRequiredFields(request).length > 0).length
  const invalidTypedCount = selectedRequests.filter(request => getInvalidTypedParams(request).length > 0).length
  const hasValidationIssues = missingRequiredCount > 0 || invalidTypedCount > 0

  const quickActions = [
    ...skills.slice(0, 3).map(skill => ({
      type: 'skill' as const,
      targetId: skill.id,
      label: skill.name,
      description: skill.description,
      fieldDefs: getSkillFieldDefs(skill),
      defaultContent: createSkillDefaultContent(skill.name, conversationTitle, personaName),
    })),
    ...mcpServers.slice(0, 3).map(server => ({
      type: 'mcp' as const,
      targetId: server.id,
      label: server.name,
      description: server.description,
      fieldDefs: DEFAULT_MCP_FIELDS,
      defaultContent: createMcpDefaultContent(server.name, conversationTitle),
    })),
  ]

  return (
    <Card className="absolute right-0 bottom-full left-0 z-20 mb-3 shadow-lg">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">工具面板</div>
            <div className="mt-1 text-xs text-(--color-muted-foreground)">
              为本轮附加 Tool，或直接触发快捷动作。
            </div>
            {selectedRequests.length > 0 && (
              <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                已选择 {selectedRequests.length} 个，{filledInputCount} 个已填参数，{missingRequiredCount} 个缺少必填，{invalidTypedCount} 个类型错误。
              </div>
            )}
          </div>
          {selectedRequests.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll} disabled={disabled}>
              清空
            </Button>
          )}
        </div>

        {selectedRequests.length > 0 && hasValidationIssues && (
          <div className="rounded-md border border-(--color-destructive)/40 bg-(--color-destructive)/10 px-2.5 py-1.5 text-[11px] text-(--color-destructive)">
            参数未完成：请先补全必填项并修正类型错误，再发送本轮消息。
          </div>
        )}

        {recentToolFailures.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              最近一次 Tool 调用有失败，可按下列步骤修复
            </div>
            <div className="space-y-2">
              {recentToolFailures.slice(0, 3).map((failure, index) => {
                const retryRequest = buildRetryRequest(failure)
                const hasBlockingIssue = retryRequest
                  ? getMissingRequiredFields(retryRequest).length > 0 || getInvalidTypedParams(retryRequest).length > 0
                  : false
                const retryLabel = retryRequest?.label || failure.label
                const retryContent = failure.type === 'skill'
                  ? createSkillDefaultContent(retryLabel, conversationTitle, personaName)
                  : createMcpDefaultContent(retryLabel, conversationTitle)

                return (
                  <div key={`${failure.type}-${failure.label}-${index}`} className="rounded-md border border-amber-300/50 bg-white/70 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={failure.type === 'skill' ? 'secondary' : 'outline'}>
                        {failure.type === 'skill' ? 'Skill' : 'MCP'}
                      </Badge>
                      <span className="font-medium text-amber-900">{failure.label}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-amber-900/90">
                      {getFailureSummaryText(failure)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-amber-900/80">
                      {getFailureSuggestionText(failure)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {retryRequest && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-amber-300 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-100"
                          disabled={disabled}
                          onClick={() => onChange(withRequest(selectedRequests, retryRequest))}
                        >
                          重新附加到本轮
                        </Button>
                      )}
                      {retryRequest && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={disabled}
                          onClick={() => {
                            if (hasBlockingIssue) {
                              onChange(withRequest(selectedRequests, retryRequest))
                              return
                            }
                            onQuickSend({ ...retryRequest, autoExecute: true }, retryContent)
                          }}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          一键重试
                        </Button>
                      )}
                      {failure.type === 'skill' && onOpenConversationSettings && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-amber-900"
                          disabled={disabled}
                          onClick={onOpenConversationSettings}
                        >
                          <Settings2 className="mr-1 h-3 w-3" />
                          打开会话设置
                        </Button>
                      )}
                      {failure.type === 'mcp' && onOpenMcpCenter && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-amber-900"
                          disabled={disabled}
                          onClick={onOpenMcpCenter}
                        >
                          <Settings2 className="mr-1 h-3 w-3" />
                          打开 MCP 页面
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {quickActions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-(--color-muted-foreground)">
              <Play className="h-3.5 w-3.5" />
              快捷动作
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {quickActions.map(action => (
                <button
                  key={`${action.type}-${action.targetId}`}
                  type="button"
                  className={cn(
                    'rounded-xl border border-(--color-border) bg-(--color-card) px-3 py-2 text-left transition-colors',
                    'hover:bg-(--color-muted)/40 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                  disabled={disabled}
                  onClick={() => {
                    const existing = selectedRequests.find(request => (
                      request.type === action.type && request.targetId === action.targetId
                    ))
                    const request = buildRequest(action.type, action.targetId, action.label, action.fieldDefs, existing)
                    const missingRequired = getMissingRequiredFields(request)
                    const invalidTyped = getInvalidTypedParams(request)

                    if (missingRequired.length > 0 || invalidTyped.length > 0) {
                      onChange(withRequest(selectedRequests, request))
                      return
                    }

                    onQuickSend({ ...request, autoExecute: true }, action.defaultContent)
                  }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {action.type === 'skill' ? (
                      <Sparkles className="h-4 w-4 text-(--color-primary)" />
                    ) : (
                      <Cable className="h-4 w-4 text-(--color-primary)" />
                    )}
                    <span>{action.label}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-(--color-muted-foreground)">
                    {action.description || '直接执行该 Tool。'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-(--color-muted-foreground)">
            <Wrench className="h-3.5 w-3.5" />
            附加到本轮
          </div>

          <div className="space-y-2">
            {toolItems.map(item => {
              const existing = selectedRequests.find(request => request.type === item.kind && request.targetId === item.id)
              const fields = existing?.inputParams
                ? toParsedToolParams(existing.inputParams)
                : parseToolParams(existing?.inputText)
              const orderedKeys = item.fieldDefs.map(field => field.key)
              const missingRequired = existing ? getMissingRequiredFields(existing) : []
              const invalidTyped = existing ? getInvalidTypedParams(existing) : []
              const requestIndex = existing
                ? selectedRequests.findIndex(request => request.id === existing.id)
                : -1
              const backendRequestIssues = requestIndex >= 0
                ? backendValidationIssues.filter(issue => issue.requestIndex === requestIndex)
                : []
              const validationMessage = existing
                ? buildManualToolValidationErrorMessage(existing, Math.max(0, requestIndex))
                : null

              return (
                <div key={`${item.kind}-${item.id}`} className="rounded-xl border border-(--color-border) px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {item.kind === 'skill' ? (
                          <Sparkles className="h-4 w-4 text-(--color-primary)" />
                        ) : (
                          <Cable className="h-4 w-4 text-(--color-primary)" />
                        )}
                        <span className="text-sm font-medium">{item.name}</span>
                        <Badge variant={item.kind === 'skill' ? 'secondary' : 'outline'}>
                          {item.kind === 'skill' ? 'Skill' : 'MCP'}
                        </Badge>
                        {(existing?.inputText?.trim() || hasAnyInputParams(existing?.inputParams)) && (
                          <Badge variant="outline">已填参数</Badge>
                        )}
                        {missingRequired.length > 0 && (
                          <Badge variant="destructive">缺少必填 {missingRequired.length}</Badge>
                        )}
                        {invalidTyped.length > 0 && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                            类型错误 {invalidTyped.length}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-(--color-muted-foreground)">
                        {item.description || '已在当前会话启用。'}
                      </div>
                    </div>
                    <Button
                      variant={existing ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => toggleRequest(item)}
                      disabled={disabled}
                    >
                      {existing ? '已选择' : '添加'}
                    </Button>
                  </div>

                  {existing && (
                    <div className="mt-3 rounded-lg border border-(--color-border)/60 bg-(--color-muted)/20 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-(--color-muted-foreground)">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        参数（必填优先）
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {item.fieldDefs.map((field) => {
                          const fieldType = field.dataType || 'string'
                          const value = fields[field.key] || ''
                          const hasTypeError = invalidTyped.includes(field.key)
                          const hasMissingRequired = missingRequired.includes(field.key)
                          const backendFieldIssue = backendRequestIssues.find(issue => issue.field === field.key)

                          return (
                            <label key={`${item.id}-${field.key}`} className="flex flex-col gap-1">
                              <span className="flex items-center gap-1 text-[11px] text-(--color-muted-foreground)">
                                <span>
                                  {field.label}
                                  {field.required ? ' *' : ''}
                                </span>
                                <span className="rounded bg-(--color-muted) px-1.5 py-0.5 text-[10px] uppercase">
                                  {getFieldTypeTag(fieldType)}
                                </span>
                              </span>

                              {fieldType === 'boolean' ? (
                                <select
                                  value={value}
                                  onChange={event => updateParamField(existing, field.key, event.target.value, orderedKeys)}
                                  className={cn(
                                    'h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs',
                                    'focus:outline-none focus:ring-2 focus:ring-(--color-ring)',
                                    hasMissingRequired && 'border-(--color-destructive) focus:ring-(--color-destructive)/40',
                                    hasTypeError && 'border-amber-500 focus:ring-amber-400',
                                  )}
                                  disabled={disabled}
                                >
                                  <option value="">未设置</option>
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : fieldType === 'enum' ? (
                                <select
                                  value={value}
                                  onChange={event => updateParamField(existing, field.key, event.target.value, orderedKeys)}
                                  className={cn(
                                    'h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs',
                                    'focus:outline-none focus:ring-2 focus:ring-(--color-ring)',
                                    hasMissingRequired && 'border-(--color-destructive) focus:ring-(--color-destructive)/40',
                                    hasTypeError && 'border-amber-500 focus:ring-amber-400',
                                  )}
                                  disabled={disabled}
                                >
                                  <option value="">未设置</option>
                                  {(field.enumOptions || []).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : isTextareaField(field.key) && fieldType === 'string' ? (
                                <textarea
                                  value={value}
                                  onChange={event => updateParamField(existing, field.key, event.target.value, orderedKeys)}
                                  placeholder={field.placeholder}
                                  className={cn(
                                    'min-h-[56px] w-full resize-y rounded-lg border border-(--color-input) bg-(--color-background) px-3 py-2 text-sm',
                                    'placeholder:text-(--color-muted-foreground)',
                                    'focus:outline-none focus:ring-2 focus:ring-(--color-ring)',
                                    hasMissingRequired && 'border-(--color-destructive) focus:ring-(--color-destructive)/40',
                                    hasTypeError && 'border-amber-500 focus:ring-amber-400',
                                  )}
                                  disabled={disabled}
                                />
                              ) : (
                                <input
                                  type={fieldType === 'number' ? 'number' : 'text'}
                                  value={value}
                                  onChange={event => updateParamField(existing, field.key, event.target.value, orderedKeys)}
                                  placeholder={field.placeholder}
                                  className={cn(
                                    'h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs',
                                    'placeholder:text-(--color-muted-foreground)',
                                    'focus:outline-none focus:ring-2 focus:ring-(--color-ring)',
                                    hasMissingRequired && 'border-(--color-destructive) focus:ring-(--color-destructive)/40',
                                    hasTypeError && 'border-amber-500 focus:ring-amber-400',
                                  )}
                                  disabled={disabled}
                                />
                              )}

                              {field.help && <span className="text-[10px] text-(--color-muted-foreground)">{field.help}</span>}
                              {hasMissingRequired && (
                                <span className="text-[10px] text-(--color-destructive)">必填参数不能为空。</span>
                              )}
                              {hasTypeError && (
                                <span className="text-[10px] text-amber-700">参数格式不正确，请按字段类型填写。</span>
                              )}
                              {backendFieldIssue && (
                                <span className="text-[10px] text-amber-800">
                                  后端校验：{formatManualToolBackendValidationIssue(backendFieldIssue)}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>

                      {backendRequestIssues.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-800">
                          后端返回：{backendRequestIssues.map(issue => formatManualToolBackendValidationIssue(issue)).join('；')}
                        </div>
                      )}
                      {validationMessage && (
                        <div className="mt-2 text-[11px] text-(--color-destructive)">
                          {validationMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


