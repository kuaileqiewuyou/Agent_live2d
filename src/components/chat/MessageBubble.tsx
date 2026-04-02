import { lazy, Suspense, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Loader2,
  PlugZap,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react'
import { cn } from '@/utils'
import type { ChatLayoutMode, ManualToolInputParams, Message } from '@/types'
import { normalizeToolLabel } from '@/pages/chat/toolUsage'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const MarkdownRenderer = lazy(async () => {
  const module = await import('@/components/chat/MarkdownRenderer')
  return { default: module.MarkdownRenderer }
})

interface MessageBubbleProps {
  message: Message
  layoutMode: ChatLayoutMode
}

interface ToolReference {
  type?: 'skill' | 'mcp'
  name?: string
  label?: string
  title?: string
  summary?: string
  result?: string
  manual?: boolean
  inputText?: string
  inputParams?: ManualToolInputParams
}

interface ManualToolRequestMeta {
  type?: 'skill' | 'mcp'
  label?: string
  inputText?: string
  inputParams?: ManualToolInputParams
}

interface ToolUsageMeta {
  manualCount?: number
  automaticCount?: number
  totalCount?: number
}

interface ToolReferenceSummaryProps {
  references: ToolReference[]
  manualToolRequests: ManualToolRequestMeta[]
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : ''
  const code = String(children).replace(/\n$/, '')

  if (!className) {
    return (
      <code className="rounded bg-(--color-muted) px-1.5 py-0.5 text-sm font-mono">
        {children}
      </code>
    )
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-(--color-border)">
      <div className="flex items-center justify-between bg-(--color-muted) px-4 py-1.5 text-xs text-(--color-muted-foreground)">
        <span className="font-mono">{lang || '代码'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs opacity-0 transition-opacity group-hover/code:opacity-100"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-(--color-muted)/50 p-4 text-sm">
        <code className={className}>{code}</code>
      </pre>
    </div>
  )
}

function StatusIndicator({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'streaming':
      return (
        <span className="inline-flex items-center gap-0.5 text-(--color-muted-foreground)">
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
        </span>
      )
    case 'sending':
      return <Clock className="h-3 w-3 text-(--color-muted-foreground)" />
    case 'error':
      return <AlertTriangle className="h-3 w-3 text-(--color-destructive)" />
    default:
      return null
  }
}

function ToolStatusBadge({ status }: { status: Message['toolStatus'] }) {
  switch (status) {
    case 'calling':
      return (
        <Badge variant="outline" className="gap-1 border-yellow-500/50 text-yellow-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          调用中
        </Badge>
      )
    case 'success':
      return (
        <Badge variant="success" className="gap-1">
          <Check className="h-3 w-3" />
          成功
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          失败
        </Badge>
      )
    default:
      return null
  }
}

function ToolTypeBadge({ type }: { type?: string }) {
  if (type === 'skill') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Sparkles className="h-3 w-3" />
        Skill
      </Badge>
    )
  }

  if (type === 'mcp') {
    return (
      <Badge variant="outline" className="gap-1">
        <PlugZap className="h-3 w-3" />
        MCP
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1">
      <Cpu className="h-3 w-3" />
      Tool
    </Badge>
  )
}

function MarkdownFallback({ content }: { content: string }) {
  return <div className="whitespace-pre-wrap break-words">{content}</div>
}

function containsMarkdown(content: string) {
  return /(^|\n)(#{1,6}\s|\d+\.\s|[-*+]\s|>|\|)|```|`[^`]+`|\*\*|__|\[[^\]]+\]\([^)]+\)/m.test(content)
}

function getToolReferenceLabel(reference: ToolReference) {
  return normalizeToolLabel(reference.label || reference.name || reference.title)
}

function getToolReferences(message: Message): ToolReference[] {
  const raw = message.metadata?.toolResults
  return Array.isArray(raw) ? raw as ToolReference[] : []
}

function getToolUsage(message: Message): ToolUsageMeta | null {
  const raw = message.metadata?.toolUsage
  if (!raw || typeof raw !== 'object') return null
  return raw as ToolUsageMeta
}

const TOOL_PARAM_LABEL_MAP: Record<string, string> = {
  goal: '目标',
  scope: '范围',
  output: '输出',
  notes: '备注',
}
const TOOL_PARAM_ORDER: string[] = ['goal', 'scope', 'output', 'notes']

function normalizeInputParams(raw: unknown): ManualToolInputParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const params = raw as Record<string, unknown>
  const normalized: ManualToolInputParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) normalized[key] = value.trim()
  }
  return Object.keys(normalized).length ? normalized : undefined
}

function getManualToolRequests(message: Message): ManualToolRequestMeta[] {
  const raw = message.metadata?.manualToolRequests
  if (!Array.isArray(raw)) return []
  const items: ManualToolRequestMeta[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : undefined
    if (!label) continue
    items.push({
      type: typeof record.type === 'string' ? record.type as 'skill' | 'mcp' : undefined,
      label,
      inputText: typeof record.inputText === 'string'
        ? record.inputText
        : (typeof record.input_text === 'string' ? record.input_text : undefined),
      inputParams: normalizeInputParams(record.inputParams ?? record.input_params),
    })
  }
  return items
}

function ToolInputParamsBlock({ params, inputText }: { params?: ManualToolInputParams, inputText?: string }) {
  const entries = Object.entries(params || {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => [key, String(value)] as const)
  const orderedKeys = [
    ...TOOL_PARAM_ORDER.filter(key => entries.some(([entryKey]) => entryKey === key)),
    ...entries
      .map(([key]) => key)
      .filter(key => !TOOL_PARAM_ORDER.includes(key))
      .sort(),
  ]
  const items = orderedKeys.map(key => ({
    key,
    label: TOOL_PARAM_LABEL_MAP[key] || key,
    value: params?.[key] || '',
  }))

  if (items.length === 0 && !inputText) return null

  return (
    <div className="mt-2 rounded-md border border-(--color-border) bg-(--color-background)/70 p-2">
      {items.length > 0 && (
        <div className="grid gap-1 text-[11px] text-(--color-muted-foreground)">
          {items.map(item => (
            <div key={item.key} className="flex gap-1.5">
              <span className="font-medium">{item.label}:</span>
              <span className="break-words">{item.value}</span>
            </div>
          ))}
        </div>
      )}
      {inputText && (
        <div className="mt-1 whitespace-pre-wrap text-[11px] text-(--color-muted-foreground)">
          {inputText}
        </div>
      )}
    </div>
  )
}

function ToolReferenceSummary({ references, manualToolRequests }: ToolReferenceSummaryProps) {
  const [open, setOpen] = useState(false)
  const manualReferences = references.filter(reference => Boolean(reference.manual))
  const automaticReferences = references.filter(reference => !reference.manual)
  const manualRequestMap = new Map(
    manualToolRequests
      .filter(item => Boolean(item.label))
      .map(item => [normalizeToolLabel(item.label), item] as const),
  )
  const manualLabels = Array.from(
    new Set(
      [
        ...manualToolRequests.map(item => normalizeToolLabel(item.label)).filter(Boolean),
        ...manualReferences.map(getToolReferenceLabel).filter(Boolean),
      ],
    ),
  )
  const automaticLabels = Array.from(new Set(automaticReferences.map(getToolReferenceLabel).filter(Boolean)))

  if (manualLabels.length + automaticLabels.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="mt-3 flex items-center gap-1 text-left text-xs text-(--color-muted-foreground) opacity-80 transition-opacity hover:opacity-100">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>Tool usage: manual {manualLabels.length} / automatic {automaticLabels.length}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-(--color-border) bg-(--color-muted)/30 p-3">
          {manualLabels.length > 0 && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-background)/70 p-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                <Badge variant="secondary">manual Tool</Badge>
                <span className="text-(--color-muted-foreground)">{manualLabels.length}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {manualLabels.map(label => (
                  <Badge key={`manual-${label}`} variant="outline">{label}</Badge>
                ))}
              </div>
              {manualReferences.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {manualReferences.map((item, index) => {
                    const normalizedLabel = normalizeToolLabel(item.label || item.name || item.title)
                    const request = manualRequestMap.get(normalizedLabel)
                    return (
                      <div key={`manual-ref-${item.type || 'tool'}-${item.name || index}`} className="rounded-md bg-(--color-muted)/40 px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium">{normalizedLabel}</span>
                          <ToolTypeBadge type={item.type} />
                        </div>
                        <div className="mt-1 text-xs text-(--color-muted-foreground)">
                          {item.summary || item.result || '结果已纳入本轮回复。'}
                        </div>
                        <ToolInputParamsBlock
                          params={item.inputParams || request?.inputParams}
                          inputText={item.inputText || request?.inputText}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              {manualReferences.length === 0 && manualToolRequests.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {manualToolRequests.map((item, index) => (
                    <div key={`manual-request-${item.type || 'tool'}-${item.label || index}`} className="rounded-md bg-(--color-muted)/40 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{normalizeToolLabel(item.label) || 'manual Tool'}</span>
                        <ToolTypeBadge type={item.type} />
                      </div>
                      <ToolInputParamsBlock params={item.inputParams} inputText={item.inputText} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {automaticReferences.length > 0 && (
            <div className="rounded-lg border border-(--color-border) bg-(--color-background)/70 p-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                <Badge variant="outline">automatic Tool</Badge>
                <span className="text-(--color-muted-foreground)">{automaticReferences.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {automaticReferences.map((item, index) => (
                  <div key={`auto-ref-${item.type || 'tool'}-${item.name || index}`} className="rounded-md bg-(--color-muted)/40 px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium">{normalizeToolLabel(item.label || item.name || item.title)}</span>
                      <ToolTypeBadge type={item.type} />
                    </div>
                    <div className="mt-1 text-xs text-(--color-muted-foreground)">
                      {item.summary || item.result || '结果已纳入本轮回复。'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function MessageBubble({ message, layoutMode }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)

  const shouldRenderMarkdown = useMemo(
    () => (!message.role || message.role === 'assistant')
      ? containsMarkdown(message.content)
      : false,
    [message.content, message.role],
  )
  const toolReferences = useMemo(() => getToolReferences(message), [message])
  const toolUsage = useMemo(() => getToolUsage(message), [message])
  const manualToolRequests = useMemo(() => getManualToolRequests(message), [message])

  const manualReferenceCount = useMemo(
    () => toolReferences.filter(reference => Boolean(reference.manual)).length,
    [toolReferences],
  )
  const automaticReferenceCount = useMemo(
    () => toolReferences.filter(reference => !reference.manual).length,
    [toolReferences],
  )

  const manualToolCount = useMemo(
    () => (
      typeof toolUsage?.manualCount === 'number'
        ? toolUsage.manualCount
        : Math.max(manualReferenceCount, manualToolRequests.length)
    ),
    [manualReferenceCount, manualToolRequests.length, toolUsage],
  )

  const automaticToolCount = useMemo(
    () => (
      typeof toolUsage?.automaticCount === 'number'
        ? toolUsage.automaticCount
        : automaticReferenceCount
    ),
    [automaticReferenceCount, toolUsage],
  )

  const manualToolLabels = useMemo(
    () => Array.from(new Set([
      ...manualToolRequests.map(item => normalizeToolLabel(item.label)),
      ...toolReferences.filter(item => Boolean(item.manual)).map(getToolReferenceLabel),
    ].filter(Boolean))),
    [manualToolRequests, toolReferences],
  )

  const hasManualToolReferences = manualToolCount > 0 || manualToolRequests.length > 0
  const hasAutomaticToolReferences = automaticToolCount > 0

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-2">
        <div className="rounded-full bg-(--color-muted) px-4 py-1.5 text-xs text-(--color-muted-foreground)">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    const displayLabel = typeof message.metadata?.label === 'string'
      ? message.metadata.label
      : (typeof message.metadata?.name === 'string' ? message.metadata.name : undefined)
    const title = normalizeToolLabel(displayLabel || message.toolName || String(message.metadata?.title || '')) || 'Tool 调用'
    const summary = typeof message.metadata?.summary === 'string'
      ? message.metadata.summary
      : message.content

    return (
      <div className="flex justify-start px-4 py-1.5">
        <Collapsible className="w-full max-w-[80%]">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-2 text-left text-sm transition-colors hover:bg-(--color-accent)">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-muted)">
                <Wrench className="h-4 w-4 text-(--color-muted-foreground)" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{title}</span>
                  <ToolTypeBadge type={String(message.metadata?.toolType || '')} />
                  {Boolean(message.metadata?.manual) && (
                    <Badge variant="secondary">手动触发</Badge>
                  )}
                  <ToolStatusBadge status={message.toolStatus} />
                </div>
                <div className="mt-1 text-xs text-(--color-muted-foreground)">
                  {summary}
                </div>
                {message.senderName && (
                  <div className="mt-1 text-[11px] text-(--color-muted-foreground)/80">
                    来源：{message.senderName}
                  </div>
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 ml-10 whitespace-pre-wrap break-all rounded-lg border border-(--color-border) bg-(--color-muted)/30 p-3 text-xs text-(--color-muted-foreground)">
              {message.content}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  if (message.status === 'error' && message.role === 'assistant') {
    return (
      <div className="flex justify-start px-4 py-1.5">
        <div className="flex max-w-[80%] gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-red-100 text-xs text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'
  const isCompanionBubble = layoutMode === 'companion' && !isUser

  const assistantContent = shouldRenderMarkdown
    ? (
        <Suspense fallback={<MarkdownFallback content={message.content} />}>
          <MarkdownRenderer
            content={message.content}
            code={({ className, children }) => (
              <CodeBlock className={className}>{children}</CodeBlock>
            )}
          />
        </Suspense>
      )
    : <MarkdownFallback content={message.content} />

  if (isCompanionBubble) {
    return (
      <div className="flex justify-center py-2">
        <div className="relative max-w-xs">
          <div className="rounded-2xl border border-(--color-border) bg-(--color-card) px-4 py-3 text-sm shadow-lg">
            {assistantContent}
            <ToolReferenceSummary
              references={toolReferences}
              manualToolRequests={manualToolRequests}
            />
            <StatusIndicator status={message.status} />
          </div>
          <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-r border-b border-(--color-border) bg-(--color-card)" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-1.5',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            'text-xs font-medium',
            isUser
              ? 'bg-(--color-primary) text-(--color-primary-foreground)'
              : 'bg-(--color-secondary) text-(--color-secondary-foreground)',
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          'flex max-w-[75%] flex-col',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {message.senderType === 'agent' && message.senderName && (
          <span className="mb-1 px-1 text-xs text-(--color-muted-foreground)">
            {message.senderName}
          </span>
        )}

        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-tr-sm bg-(--color-primary) text-(--color-primary-foreground)'
              : 'rounded-tl-sm border border-(--color-border) bg-(--color-card) text-(--color-card-foreground)',
          )}
        >
          {message.reasoning && (
            <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
              <CollapsibleTrigger asChild>
                <button className="mb-2 flex w-full items-center gap-1 text-left text-xs opacity-70 transition-opacity hover:opacity-100">
                  {reasoningOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span>推理过程</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mb-2 whitespace-pre-wrap rounded-lg bg-black/5 px-3 py-2 text-xs leading-relaxed opacity-80 dark:bg-white/5">
                  {message.reasoning}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <>
              {hasManualToolReferences && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Wrench className="h-3 w-3" />
                    本轮按你指定调用了 {manualToolCount} 个 manual Tool
                  </Badge>
                  {manualToolLabels.slice(0, 3).map(label => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
              {hasAutomaticToolReferences && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Wrench className="h-3 w-3" />
                    本轮自动调用了 {automaticToolCount} 个 automatic Tool
                  </Badge>
                </div>
              )}
              {assistantContent}
              <ToolReferenceSummary
                references={toolReferences}
                manualToolRequests={manualToolRequests}
              />
            </>
          )}

          <StatusIndicator status={message.status} />

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'absolute -bottom-3 h-6 w-6 rounded-full border border-(--color-border) bg-(--color-background) opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
                    isUser ? '-left-3' : '-right-3',
                  )}
                  onClick={handleCopyMessage}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{copied ? '已复制' : '复制消息'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
