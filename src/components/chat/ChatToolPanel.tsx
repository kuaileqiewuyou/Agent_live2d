import { AlertTriangle, Cable, Play, RefreshCw, Settings2, Sparkles, Wrench } from 'lucide-react'
import type {
  MCPServer,
  ManualToolExecutionState,
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
  toolExecutionStates?: ManualToolExecutionState[]
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
  required?: boolean
  dataType?: ManualToolParamType
  enumOptions?: string[]
  help?: string
}

interface ToolItem {
  kind: 'skill' | 'mcp'
  id: string
  name: string
  description: string
  fields: ToolParamFieldDef[]
}

type ParsedToolParams = Record<string, string>

const SKILL_FIELDS: ToolParamFieldDef[] = [
  { key: 'goal', label: '目标', placeholder: '例如：总结异常', dataType: 'string' },
  { key: 'scope', label: '范围', placeholder: '例如：最近 7 天', dataType: 'string' },
  { key: 'output', label: '输出', placeholder: '例如：JSON 列表', dataType: 'string' },
  { key: 'notes', label: '备注', placeholder: '可选补充', dataType: 'string' },
]

const MCP_FIELDS: ToolParamFieldDef[] = [
  { key: 'goal', label: '查询目标', placeholder: '例如：获取服务状态', dataType: 'string' },
  { key: 'scope', label: '查询范围', placeholder: '例如：仅 production', dataType: 'string' },
  { key: 'output', label: '输出要求', placeholder: '例如：结构化结果', dataType: 'string' },
  { key: 'notes', label: '备注', placeholder: '可选补充', dataType: 'string' },
]

const LEGACY_KEY_MAP: Record<string, string> = {
  目标: 'goal',
  查询目标: 'goal',
  范围: 'scope',
  输出: 'output',
  备注: 'notes',
}

function normalizeKey(key: string) {
  return LEGACY_KEY_MAP[key.trim()] || key.trim()
}

function toParsed(params?: ManualToolInputParams): ParsedToolParams {
  const next: ParsedToolParams = {}
  if (!params) return next
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) next[key] = value.trim()
  }
  return next
}

function toInput(params: ParsedToolParams): ManualToolInputParams {
  const next: ManualToolInputParams = {}
  for (const [key, value] of Object.entries(params)) {
    const trimmed = value.trim()
    if (trimmed) next[key] = trimmed
  }
  return next
}

function parseText(inputText?: string): ParsedToolParams {
  if (!inputText?.trim()) return {}
  const parsed: ParsedToolParams = {}
  const notes: string[] = []
  for (const line of inputText.split(/\r?\n/).map(v => v.trim()).filter(Boolean)) {
    const match = line.match(/^([^:=：]+)\s*[:=：]\s*(.+)$/)
    if (!match) {
      notes.push(line)
      continue
    }
    const key = normalizeKey(match[1])
    parsed[key] = match[2].trim()
  }
  if (notes.length) parsed.notes = parsed.notes ? `${parsed.notes}\n${notes.join('\n')}` : notes.join('\n')
  return parsed
}

function composeText(params: ParsedToolParams, orderedKeys: string[]) {
  const lines: string[] = []
  const used = new Set<string>()
  for (const key of orderedKeys) {
    const value = params[key]
    if (value?.trim()) {
      lines.push(`${key}: ${value.trim()}`)
      used.add(key)
    }
  }
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (used.has(key) || !value.trim()) continue
    lines.push(`${key}: ${value.trim()}`)
  }
  return lines.join('\n')
}

function missingRequired(request: ManualToolRequest) {
  const required = request.requiredFields || []
  if (required.length === 0) return []
  const combined = { ...parseText(request.inputText), ...toParsed(request.inputParams) }
  return required.filter(key => !combined[key]?.trim())
}

function getStatusBadge(status: ManualToolExecutionState['status']) {
  if (status === 'queued') return { text: '排队中', className: 'border-slate-300 bg-slate-50 text-slate-600' }
  if (status === 'running') return { text: '执行中', className: 'border-blue-300 bg-blue-50 text-blue-700' }
  if (status === 'success') return { text: '成功', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' }
  return { text: '失败', className: 'border-red-300 bg-red-50 text-red-700' }
}

function buildFieldsFromSchema(skill: Skill): ToolParamFieldDef[] {
  const schema = skill.configSchema as Record<string, unknown> | undefined
  if (!schema || typeof schema !== 'object' || !schema.properties || typeof schema.properties !== 'object') return SKILL_FIELDS
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required.filter(v => typeof v === 'string') : [])
  const properties = schema.properties as Record<string, unknown>
  const fields = Object.entries(properties).map(([key, raw]) => {
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const type = Array.isArray(value.enum) && value.enum.length > 0
      ? 'enum'
      : value.type === 'number' || value.type === 'integer'
        ? 'number'
        : value.type === 'boolean'
          ? 'boolean'
          : 'string'
    return {
      key,
      label: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : key,
      placeholder: typeof value.description === 'string' && value.description.trim() ? value.description.trim() : `请输入 ${key}`,
      required: requiredSet.has(key),
      dataType: type,
      enumOptions: Array.isArray(value.enum) ? value.enum.map(v => String(v)) : undefined,
      help: typeof value.description === 'string' ? value.description.trim() : undefined,
    } satisfies ToolParamFieldDef
  })
  return fields.length ? fields : SKILL_FIELDS
}

function buildRequest(item: ToolItem, previous?: ManualToolRequest): ManualToolRequest {
  const parsed = previous?.inputParams ? toParsed(previous.inputParams) : parseText(previous?.inputText)
  const requiredFields = item.fields.filter(field => field.required).map(field => field.key)
  const fieldTypes = Object.fromEntries(item.fields.map(field => [field.key, field.dataType || 'string']))
  const fieldOptions = Object.fromEntries(
    item.fields.filter(field => field.dataType === 'enum' && field.enumOptions?.length).map(field => [field.key, field.enumOptions || []]),
  )
  return {
    id: previous?.id || generateId(),
    type: item.kind,
    targetId: item.id,
    label: item.name,
    inputText: composeText(parsed, item.fields.map(field => field.key)),
    inputParams: toInput(parsed),
    autoExecute: previous?.autoExecute ?? false,
    requiredFields: requiredFields.length ? requiredFields : undefined,
    fieldTypes,
    fieldOptions: Object.keys(fieldOptions).length ? fieldOptions : undefined,
  }
}

function withRequest(requests: ManualToolRequest[], request: ManualToolRequest) {
  const index = requests.findIndex(item => item.id === request.id)
  if (index < 0) return [...requests, request]
  const next = [...requests]
  next[index] = request
  return next
}

export function ChatToolPanel({
  skills,
  mcpServers,
  selectedRequests,
  toolExecutionStates = [],
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
  const items: ToolItem[] = [
    ...skills.map(skill => ({ kind: 'skill' as const, id: skill.id, name: skill.name, description: skill.description, fields: buildFieldsFromSchema(skill) })),
    ...mcpServers.map(server => ({ kind: 'mcp' as const, id: server.id, name: server.name, description: server.description, fields: MCP_FIELDS })),
  ]
  const itemMap = new Map(items.map(item => [`${item.kind}:${item.id}`, item] as const))
  const stateMap = new Map(toolExecutionStates.map(state => [`${state.type}:${state.targetId}`, state] as const))

  const selectedCount = selectedRequests.length
  const filledCount = selectedRequests.filter(request => Boolean(request.inputText?.trim()) || Object.keys(request.inputParams || {}).length > 0).length
  const missingCount = selectedRequests.filter(request => missingRequired(request).length > 0).length
  const invalidCount = selectedRequests.filter(request => getInvalidTypedParams(request).length > 0).length
  const hasBlockingIssue = missingCount > 0 || invalidCount > 0

  const quickActions = [
    ...skills.slice(0, 3).map(skill => ({ type: 'skill' as const, targetId: skill.id, label: skill.name, fields: buildFieldsFromSchema(skill), description: skill.description })),
    ...mcpServers.slice(0, 3).map(server => ({ type: 'mcp' as const, targetId: server.id, label: server.name, fields: MCP_FIELDS, description: server.description })),
  ]

  const updateRequest = (requestId: string, updater: (value: ManualToolRequest) => ManualToolRequest) => {
    onChange(selectedRequests.map(item => (item.id === requestId ? updater(item) : item)))
  }

  return (
    <Card className="absolute bottom-full left-0 right-0 z-20 mb-3 shadow-lg">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">工具面板</div>
            <div className="mt-1 text-xs text-(--color-muted-foreground)">为本轮附加 Tool 或执行快捷动作。</div>
            {selectedCount > 0 && (
              <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                已选择 {selectedCount} 个，{filledCount} 个已填参数，{missingCount} 个缺少必填，{invalidCount} 个类型错误。
              </div>
            )}
          </div>
          {selectedCount > 0 && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])} disabled={disabled}>清空</Button>}
        </div>

        {selectedCount > 0 && hasBlockingIssue && (
          <div className="rounded-md border border-(--color-destructive)/40 bg-(--color-destructive)/10 px-2.5 py-1.5 text-[11px] text-(--color-destructive)">
            参数未完成：请先补全必填项并修正类型错误。
          </div>
        )}

        {recentToolFailures.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />最近一轮 Tool 调用存在失败
            </div>
            {recentToolFailures.slice(0, 3).map((failure, index) => (
              <div key={`${failure.type}-${failure.label}-${index}`} className="rounded-md border border-amber-300/50 bg-white/70 px-2.5 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant={failure.type === 'skill' ? 'secondary' : 'outline'}>{failure.type === 'skill' ? 'Skill' : 'MCP'}</Badge>
                  <span className="font-medium text-amber-900">{failure.label}</span>
                </div>
                <div className="mt-1 text-[11px] text-amber-900/90">{failure.summary || '请检查配置与参数后重试。'}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {failure.type === 'skill' && onOpenConversationSettings && <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-amber-900" onClick={onOpenConversationSettings}>打开会话设置</Button>}
                  {failure.type === 'mcp' && onOpenMcpCenter && <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-amber-900" onClick={onOpenMcpCenter}>打开 MCP 页面</Button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {quickActions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-(--color-muted-foreground)"><Play className="h-3.5 w-3.5" />快捷动作</div>
            <div className="grid gap-2 md:grid-cols-2">
              {quickActions.map(action => (
                <button
                  key={`${action.type}-${action.targetId}`}
                  type="button"
                  className={cn('rounded-xl border border-(--color-border) bg-(--color-card) px-3 py-2 text-left transition-colors', 'hover:bg-(--color-muted)/40 disabled:cursor-not-allowed disabled:opacity-50')}
                  disabled={disabled}
                  onClick={() => {
                    const item = itemMap.get(`${action.type}:${action.targetId}`)
                    if (!item) return
                    const existing = selectedRequests.find(request => request.type === action.type && request.targetId === action.targetId)
                    const request = buildRequest(item, existing)
                    const hint = action.type === 'skill'
                      ? `请优先调用「${action.label}」，结合${conversationTitle ? `会话「${conversationTitle}」` : '当前会话'}处理任务${personaName ? `，并保持 Persona「${personaName}」的人设语气` : ''}。`
                      : `请调用 MCP 服务「${action.label}」，基于${conversationTitle ? `会话「${conversationTitle}」` : '当前会话'}获取信息。`
                    if (missingRequired(request).length > 0 || getInvalidTypedParams(request).length > 0) {
                      onChange(withRequest(selectedRequests, request))
                      return
                    }
                    onQuickSend({ ...request, autoExecute: true }, hint)
                  }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">{action.type === 'skill' ? <Sparkles className="h-4 w-4 text-(--color-primary)" /> : <Cable className="h-4 w-4 text-(--color-primary)" />}<span>{action.label}</span></div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-(--color-muted-foreground)">{action.description || '直接执行该 Tool。'}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-(--color-muted-foreground)"><Wrench className="h-3.5 w-3.5" />附加到本轮</div>
          {items.map(item => {
            const existing = selectedRequests.find(request => request.type === item.kind && request.targetId === item.id)
            const execState = stateMap.get(`${item.kind}:${item.id}`)
            const parsed = existing?.inputParams ? toParsed(existing.inputParams) : parseText(existing?.inputText)
            const requiredMissing = existing ? missingRequired(existing) : []
            const invalidTyped = existing ? getInvalidTypedParams(existing) : []
            const requestIndex = existing ? selectedRequests.findIndex(request => request.id === existing.id) : -1
            const backendIssues = requestIndex >= 0 ? backendValidationIssues.filter(issue => issue.requestIndex === requestIndex) : []

            return (
              <div key={`${item.kind}-${item.id}`} className="rounded-xl border border-(--color-border) px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.kind === 'skill' ? <Sparkles className="h-4 w-4 text-(--color-primary)" /> : <Cable className="h-4 w-4 text-(--color-primary)" />}
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge variant={item.kind === 'skill' ? 'secondary' : 'outline'}>{item.kind === 'skill' ? 'Skill' : 'MCP'}</Badge>
                      {existing?.inputText?.trim() && <Badge variant="outline">已填参数</Badge>}
                      {requiredMissing.length > 0 && <Badge variant="destructive">缺少必填 {requiredMissing.length}</Badge>}
                      {invalidTyped.length > 0 && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">类型错误 {invalidTyped.length}</Badge>}
                      {execState && <Badge variant="outline" className={cn(getStatusBadge(execState.status).className)}>{getStatusBadge(execState.status).text}</Badge>}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-(--color-muted-foreground)">{item.description || '该工具已在当前会话启用。'}</div>
                    {execState?.detail && <div className="mt-1 text-[11px] text-(--color-muted-foreground)">阶段详情：{execState.detail}（{new Date(execState.updatedAt).toLocaleTimeString('zh-CN')}）</div>}
                  </div>
                  <Button variant={existing ? 'default' : 'outline'} size="sm" className="h-8 shrink-0" onClick={() => {
                    if (existing) onChange(selectedRequests.filter(request => request.id !== existing.id))
                    else onChange([...selectedRequests, buildRequest(item)])
                  }} disabled={disabled}>{existing ? '已选择' : '添加'}</Button>
                </div>

                {existing && (
                  <div className="mt-3 rounded-lg border border-(--color-border)/60 bg-(--color-muted)/20 p-2.5 space-y-2">
                    <div className="text-[11px] font-medium text-(--color-muted-foreground)">参数（结构化）</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {item.fields.map(field => {
                        const value = parsed[field.key] || ''
                        const hasMissing = requiredMissing.includes(field.key)
                        const hasType = invalidTyped.includes(field.key)
                        const backendIssue = backendIssues.find(issue => issue.field === field.key)
                        return (
                          <label key={`${item.id}-${field.key}`} className="flex flex-col gap-1">
                            <span className="text-[11px] text-(--color-muted-foreground)">{field.label}{field.required ? ' *' : ''}</span>
                            {field.dataType === 'boolean' ? (
                              <select value={value} className={cn('h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-(--color-ring)', hasMissing && 'border-(--color-destructive)', hasType && 'border-amber-500')} onChange={event => updateRequest(existing.id, current => {
                                const next = { ...(current.inputParams ? toParsed(current.inputParams) : parseText(current.inputText)), [field.key]: event.target.value }
                                return { ...current, inputText: composeText(next, item.fields.map(v => v.key)), inputParams: toInput(next) }
                              })} disabled={disabled}><option value="">未设置</option><option value="true">true</option><option value="false">false</option></select>
                            ) : field.dataType === 'enum' ? (
                              <select value={value} className={cn('h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-(--color-ring)', hasMissing && 'border-(--color-destructive)', hasType && 'border-amber-500')} onChange={event => updateRequest(existing.id, current => {
                                const next = { ...(current.inputParams ? toParsed(current.inputParams) : parseText(current.inputText)), [field.key]: event.target.value }
                                return { ...current, inputText: composeText(next, item.fields.map(v => v.key)), inputParams: toInput(next) }
                              })} disabled={disabled}><option value="">未设置</option>{(field.enumOptions || []).map(option => <option key={option} value={option}>{option}</option>)}</select>
                            ) : (
                              <input type={field.dataType === 'number' ? 'number' : 'text'} value={value} placeholder={field.placeholder} className={cn('h-9 w-full rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 text-xs placeholder:text-(--color-muted-foreground) focus:outline-none focus:ring-2 focus:ring-(--color-ring)', hasMissing && 'border-(--color-destructive)', hasType && 'border-amber-500')} onChange={event => updateRequest(existing.id, current => {
                                const next = { ...(current.inputParams ? toParsed(current.inputParams) : parseText(current.inputText)), [field.key]: event.target.value }
                                return { ...current, inputText: composeText(next, item.fields.map(v => v.key)), inputParams: toInput(next) }
                              })} disabled={disabled} />
                            )}
                            {backendIssue && <span className="text-[10px] text-amber-800">后端校验：{formatManualToolBackendValidationIssue(backendIssue)}</span>}
                          </label>
                        )
                      })}
                    </div>

                    <div className="rounded-md border border-(--color-border) bg-(--color-background) p-2">
                      <div className="text-[11px] font-medium text-(--color-muted-foreground)">快速文本参数（每行 `key: value`）</div>
                      <textarea value={existing.inputText || ''} onChange={event => updateRequest(existing.id, current => ({ ...current, inputText: event.target.value, inputParams: toInput(parseText(event.target.value)) }))} placeholder={'goal: 总结\nscope: 最近7天\noutput: JSON'} className="mt-1 min-h-[64px] w-full resize-y rounded-lg border border-(--color-input) bg-(--color-background) px-2.5 py-2 text-xs placeholder:text-(--color-muted-foreground) focus:outline-none focus:ring-2 focus:ring-(--color-ring)" disabled={disabled} />
                    </div>

                    {(backendIssues.length > 0 || buildManualToolValidationErrorMessage(existing, Math.max(requestIndex, 0))) && (
                      <div className="text-[11px] text-(--color-destructive)">
                        {backendIssues.length > 0
                          ? `后端返回：${backendIssues.map(issue => formatManualToolBackendValidationIssue(issue)).join('；')}`
                          : buildManualToolValidationErrorMessage(existing, Math.max(requestIndex, 0))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}


