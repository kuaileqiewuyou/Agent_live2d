import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Brain,
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquareHeart,
  Plus,
  ScrollText,
  Settings2,
  Sparkles,
} from 'lucide-react'
import {
  conversationService,
  mcpService,
  memoryService,
  messageService,
  modelService,
  personaService,
  skillService,
} from '@/services'
import { useConversationStore, useNotificationStore } from '@/stores'
import type {
  ChatLayoutMode,
  Conversation,
  Live2DState,
  LongTermMemory,
  ManualToolFailureHint,
  ManualToolExecutionState,
  ManualToolInputParams,
  ManualToolRequest,
  MCPServer,
  Message,
  Skill,
} from '@/types'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatLayout } from '@/components/chat/ChatLayout'
import { ChatModeToggle } from '@/components/chat/ChatModeToggle'
import { Live2DStage } from '@/components/live2d/Live2DStage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { handleStreamFailure } from '@/pages/chat/streamFailureHandler'
import { deriveToolUsage, normalizeToolLabel, type StreamToolResultMeta } from '@/pages/chat/toolUsage'
import { canRegenerateFromMessages } from '@/pages/chat/regenerateState'
import { mergeTransientTurnMessages } from '@/pages/chat/transientTurn'
import { ApiRequestError } from '@/api/errors'
import { parseManualToolBackendValidationIssues } from '@/components/chat/toolDraft'
import { isMemoryVectorFallbackError } from '@/utils/memory-fallback'

const ConversationSettingsDialog = lazy(async () => {
  const module = await import('@/components/chat/ConversationSettingsDialog')
  return { default: module.ConversationSettingsDialog }
})

interface MemoryActionFeedback {
  type: 'summary' | 'remember'
  title: string
  description: string
  at: string
}

const CONVERSATION_META_UPDATED_EVENT = 'conversation-meta-updated'

function isExpectedUserInputError(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.code === 'validation_error') return true
    if (error.status === 422) return true
  }

  if (!(error instanceof Error)) return false
  const message = error.message.trim().toLowerCase()
  if (!message) return false

  return ['invalid params', 'validation', 'unprocessable', 'should be a'].some(keyword => message.includes(keyword))
}

function extractManualToolValidationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const message = error.message.trim()
  if (!message) return null
  return parseManualToolBackendValidationIssues(message).length > 0 ? message : null
}

function formatShortTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface AssistantToolResultMeta {
  type?: 'skill' | 'mcp'
  name?: string
  label?: string
  title?: string
  summary?: string
  result?: string
  error?: boolean | string
  manual?: boolean
  inputText?: string
  inputParams?: Record<string, unknown>
}

interface AssistantManualToolRequestMeta {
  type?: 'skill' | 'mcp'
  targetId?: string
  label?: string
  inputText?: string
  inputParams?: Record<string, unknown>
}

function getManualToolExecutionKey(type: 'skill' | 'mcp', targetId: string) {
  return `${type}:${targetId}`
}

function normalizeInputParams(raw: unknown): ManualToolInputParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const next: ManualToolInputParams = {}
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim()
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function toFailureReason(result: AssistantToolResultMeta): ManualToolFailureHint['reason'] {
  const summaryText = `${result.summary || ''} ${result.result || ''} ${typeof result.error === 'string' ? result.error : ''}`.toLowerCase()
  if (summaryText.includes('未在当前会话启用') || summaryText.includes('not enabled')) return 'not_enabled'
  if (summaryText.includes('invalid params') || summaryText.includes('validation')) return 'invalid_params'
  if (summaryText.includes('超时') || summaryText.includes('timeout') || summaryText.includes('连接') || summaryText.includes('error') || summaryText.includes('失败')) {
    return 'execution_error'
  }
  return 'unknown'
}

function isFailedManualToolResult(result: AssistantToolResultMeta) {
  if (!result.manual) return false
  if (result.error === true) return true
  if (typeof result.error === 'string' && result.error.trim()) return true

  const text = `${result.summary || ''} ${result.result || ''}`.toLowerCase()
  return ['失败', 'error', 'not enabled', '未在当前会话启用', 'invalid params', 'validation'].some(keyword => text.includes(keyword))
}

function deriveRecentToolFailures(messages: Message[]): ManualToolFailureHint[] {
  const latestAssistant = [...messages].reverse().find(message => {
    if (message.role !== 'assistant') return false
    const toolResults = message.metadata?.toolResults
    return Array.isArray(toolResults) && toolResults.length > 0
  })
  if (!latestAssistant) return []

  const rawToolResults = Array.isArray(latestAssistant.metadata?.toolResults)
    ? latestAssistant.metadata?.toolResults as AssistantToolResultMeta[]
    : []
  const failedResults = rawToolResults.filter(isFailedManualToolResult)
  if (failedResults.length === 0) return []

  const rawManualRequests = Array.isArray(latestAssistant.metadata?.manualToolRequests)
    ? latestAssistant.metadata?.manualToolRequests as AssistantManualToolRequestMeta[]
    : []
  const requestByLabel = new Map(
    rawManualRequests
      .filter(item => Boolean(item?.label))
      .map(item => [normalizeToolLabel(item.label || ''), item] as const),
  )

  const failures: ManualToolFailureHint[] = []
  for (const result of failedResults) {
    const normalizedLabel = normalizeToolLabel(result.label || result.name || result.title || '')
    if (!normalizedLabel) continue

    const request = requestByLabel.get(normalizedLabel)
    const type = result.type || request?.type
    if (type !== 'skill' && type !== 'mcp') continue

    failures.push({
      type,
      label: normalizedLabel,
      ...(request?.targetId ? { targetId: request.targetId } : {}),
      summary: result.summary || (typeof result.error === 'string' ? result.error : undefined),
      reason: toFailureReason(result),
      inputText: result.inputText || request?.inputText,
      inputParams: normalizeInputParams(result.inputParams || request?.inputParams),
    })
  }

  const seen = new Set<string>()
  return failures.filter((item) => {
    const key = `${item.type}:${item.targetId || item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

function EmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-(--color-muted-foreground)">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-(--color-primary)/10 bg-gradient-to-br from-(--color-primary)/10 to-(--color-primary)/5">
          <MessageSquareHeart className="h-12 w-12 text-(--color-primary)/40" />
        </div>
        <div className="absolute -right-1 -bottom-1 h-6 w-6 animate-pulse rounded-full bg-(--color-primary)/20" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-(--color-foreground)/80">
          选择一个会话开始聊天
        </h2>
        <p className="mt-2 text-sm">
          从左侧列表打开已有会话，或者先创建一个新的对话。
        </p>
      </div>
    </div>
  )
}

function createTransientMessage(
  conversationId: string,
  id: string,
  role: 'system' | 'tool',
  content: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    status: 'done',
    senderType: role === 'tool' ? 'tool' : 'system',
    senderName: role === 'tool' ? '工具' : '系统',
    createdAt: new Date().toISOString(),
    attachments: [],
    metadata: { transient: true },
    ...overrides,
  }
}

function dropTransientMessages(messages: Message[]) {
  return messages.filter(message => !message.metadata?.transient)
}

interface SessionOverviewProps {
  personaName?: string
  modelName?: string
  skillCount: number
  mcpCount: number
  memoryCount: number
  layoutMode: ChatLayoutMode
  memoryFeedback: MemoryActionFeedback | null
}

function SessionOverview({
  personaName,
  modelName,
  skillCount,
  mcpCount,
  memoryCount,
  layoutMode,
  memoryFeedback,
}: SessionOverviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="mx-4 mt-2 border-(--color-border)/80 shadow-none">
      <CardContent className="p-2">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-(--color-muted)/40"
          onClick={() => setOpen(current => !current)}
        >
          <div className="min-w-0">
            <div className="text-xs font-medium">会话概览</div>
          </div>
          <div className="ml-3 flex items-center gap-1 text-[11px] text-(--color-muted-foreground)">
            <span>{open ? '收起详情' : '展开详情'}</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {open && (
          <div className="grid gap-3 px-1.5 pt-2 md:grid-cols-[1.3fr,1fr,1fr,1fr,1.2fr]">
            <div className="min-w-0">
              <div className="text-xs text-(--color-muted-foreground)">当前 Persona</div>
              <div className="mt-1 truncate text-sm font-medium">{personaName || '未绑定 Persona'}</div>
              <div className="mt-2 text-xs text-(--color-muted-foreground)">当前模型</div>
              <div className="mt-1 truncate text-sm">{modelName || '未绑定模型'}</div>
            </div>

            <div>
              <div className="text-xs text-(--color-muted-foreground)">Skill</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-(--color-primary)" />
                {skillCount} 个已启用
              </div>
            </div>

            <div>
              <div className="text-xs text-(--color-muted-foreground)">MCP 服务</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Cable className="h-4 w-4 text-(--color-primary)" />
                {mcpCount} 个已连接
              </div>
            </div>

            <div>
              <div className="text-xs text-(--color-muted-foreground)">会话模式</div>
              <div className="mt-1 text-sm font-medium">{layoutMode === 'companion' ? '陪伴模式' : '聊天模式'}</div>
              <div className="mt-2 text-xs text-(--color-muted-foreground)">关联记忆</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4 text-(--color-primary)" />
                {memoryCount} 条
              </div>
            </div>

            <div className="rounded-xl border border-(--color-border) bg-(--color-muted)/30 px-3 py-2">
              <div className="text-xs text-(--color-muted-foreground)">最近记忆动作</div>
              {memoryFeedback ? (
                <>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {memoryFeedback.title}
                  </div>
                  <div className="mt-1 line-clamp-3 text-xs leading-5 text-(--color-muted-foreground)">
                    {memoryFeedback.description}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-xs leading-5 text-(--color-muted-foreground)">
                  还没有新的记忆动作。你可以在右侧面板或会话设置里生成摘要、写入长期记忆。
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface MemorySidePanelProps {
  memories: LongTermMemory[]
  feedback: MemoryActionFeedback | null
  onOpenMemoryCenter: () => void
  onSummarize: () => void
  onRememberLatest: () => void
  isSummarizing: boolean
  isSavingMemory: boolean
}

function MemorySidePanel({
  memories,
  feedback,
  onOpenMemoryCenter,
  onSummarize,
  onRememberLatest,
  isSummarizing,
  isSavingMemory,
}: MemorySidePanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-(--color-border) p-4">
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-(--color-muted)/40"
        onClick={() => setOpen(current => !current)}
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-(--color-primary)" />
          <span className="text-sm font-medium">关联记忆</span>
          <Badge variant="outline">{memories.length} 条</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-(--color-muted-foreground)">
          <span>{open ? '收起' : '展开'}</span>
          {open ? <ChevronDown className="h-4 w-4 rotate-180" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {!open && feedback && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-(--color-muted-foreground)">
          最近动作：{feedback.title}
        </div>
      )}

      {open && (
        <>
          {feedback && (
            <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {feedback.title}
              </div>
              <div className="mt-1 text-xs leading-5 text-(--color-muted-foreground)">
                {feedback.description}
              </div>
              <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                最近更新：{formatShortTime(feedback.at)}
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-col gap-2">
            <Button size="sm" variant="ghost" onClick={onOpenMemoryCenter}>
              查看全部记忆
            </Button>
            <Button size="sm" variant="outline" onClick={onSummarize} disabled={isSummarizing}>
              {isSummarizing ? '生成摘要中...' : '为当前会话生成摘要'}
            </Button>
            <Button size="sm" onClick={onRememberLatest} disabled={isSavingMemory}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {isSavingMemory ? '写入记忆中...' : '记住最近一条用户消息'}
            </Button>
          </div>

          {memories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--color-border) px-3 py-6 text-center text-xs text-(--color-muted-foreground)">
              <ScrollText className="mx-auto mb-2 h-5 w-5 opacity-40" />
              当前会话还没有可展示的长期记忆。
            </div>
          ) : (
            <div className="space-y-3">
              {memories.slice(0, 4).map(memory => (
                <div key={memory.id} className="rounded-xl border border-(--color-border) bg-(--color-card) p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{memory.memoryScope}</Badge>
                    {memory.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} variant="outline">#{tag}</Badge>
                    ))}
                  </div>
                  <div className="mt-2 line-clamp-4 text-xs leading-5 text-(--color-muted-foreground)">
                    {memory.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const pushNotification = useNotificationStore((state) => state.push)
  const {
    messages,
    isLoadingMessages,
    isSending,
    setConversations,
    setMessages,
    addMessage,
    updateMessage,
    setIsLoadingMessages,
    setIsSending,
    setCurrentConversationId,
  } = useConversationStore()

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [layoutMode, setLayoutMode] = useState<ChatLayoutMode>('chat')
  const [personaName, setPersonaName] = useState<string>()
  const [personaOpeningMessage, setPersonaOpeningMessage] = useState<string>()
  const [personaLive2dModel, setPersonaLive2dModel] = useState<string>()
  const [modelName, setModelName] = useState<string>()
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [relatedMemories, setRelatedMemories] = useState<LongTermMemory[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isSummarizingMemory, setIsSummarizingMemory] = useState(false)
  const [isSavingMemory, setIsSavingMemory] = useState(false)
  const [isDedupingMessages, setIsDedupingMessages] = useState(false)
  const [memoryFeedback, setMemoryFeedback] = useState<MemoryActionFeedback | null>(null)
  const [backendToolValidationMessage, setBackendToolValidationMessage] = useState<string | null>(null)
  const [live2dState, setLive2dState] = useState<Live2DState>('idle')
  const [toolExecutionStates, setToolExecutionStates] = useState<ManualToolExecutionState[]>([])

  const notifyConversationMetaUpdated = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CONVERSATION_META_UPDATED_EVENT))
  }, [])

  const loadConversation = useCallback(async (currentConversationId: string) => {
    try {
      setIsLoadingMessages(true)
      const [conv, conversationItems] = await Promise.all([
        conversationService.getConversation(currentConversationId),
        conversationService.getConversations(),
      ])
      if (!conv) return

      setConversations(conversationItems)
      setConversation(conv)
      setLayoutMode(conv.layoutMode)

      const [msgs, persona, model, allSkills, allMcpServers, allMemories] = await Promise.all([
        messageService.getMessages(currentConversationId),
        personaService.getPersona(conv.personaId),
        modelService.getModelConfig(conv.modelConfigId),
        skillService.getSkills(),
        mcpService.getMcpServers(),
        memoryService.listLongTermMemories(),
      ])

      setMessages(msgs)
      setPersonaName(persona?.name)
      setPersonaOpeningMessage(persona?.openingMessage)
      setPersonaLive2dModel(persona?.live2dModel)
      setModelName(model?.name)
      setSkills(allSkills.filter(skill => conv.enabledSkillIds.includes(skill.id)))
      setMcpServers(allMcpServers.filter(server => conv.enabledMcpServerIds.includes(server.id)))
      setRelatedMemories(
        allMemories.filter(memory =>
          memory.conversationId === conv.id
          || (memory.personaId && memory.personaId === conv.personaId),
        ),
      )
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载会话失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsLoadingMessages(false)
    }
  }, [pushNotification, setConversations, setIsLoadingMessages, setMessages])

  useEffect(() => {
    if (!conversationId) {
      setConversation(null)
      setMessages([])
      setCurrentConversationId(null)
      setSkills([])
      setMcpServers([])
      setRelatedMemories([])
      setPersonaName(undefined)
      setPersonaOpeningMessage(undefined)
      setPersonaLive2dModel(undefined)
      setModelName(undefined)
      setMemoryFeedback(null)
      setBackendToolValidationMessage(null)
      setLive2dState('idle')
      setToolExecutionStates([])
      return
    }

    setCurrentConversationId(conversationId)
    void loadConversation(conversationId)
  }, [conversationId, loadConversation, setCurrentConversationId, setMessages])

  const skillNames = useMemo(() => skills.map(skill => skill.name), [skills])
  const mcpNames = useMemo(() => mcpServers.map(server => server.name), [mcpServers])
  const recentToolFailures = useMemo(() => deriveRecentToolFailures(messages), [messages])

  const runStreamingTurn = useCallback(async (
    content: string,
    options?: {
      metadata?: Record<string, unknown>
      manualToolRequests?: ManualToolRequest[]
      mode?: 'send' | 'regenerate'
    },
  ) => {
    if (!conversationId || isSending) return

    setBackendToolValidationMessage(null)
    setIsSending(true)
    setLive2dState('thinking')
    const nonce = Date.now()
    const turnRequestId = `turn-${conversationId}-${nonce}`
    const streamMetadata: Record<string, unknown> = {
      ...(options?.metadata || {}),
      requestId: turnRequestId,
    }
    const userId = `temp-user-${nonce}`
    const assistantId = `temp-assistant-${nonce}`
    const thinkingId = `temp-thinking-${nonce}`
    const memoryId = `temp-memory-${nonce}`
    const streamToolResults: StreamToolResultMeta[] = []
    const manualRequests = options?.manualToolRequests || []
    let streamAcceptedByServer = false

    if (manualRequests.length > 0) {
      setToolExecutionStates(
        manualRequests.map(request => ({
          type: request.type,
          targetId: request.targetId,
          label: request.label,
          status: 'queued',
          detail: '等待执行',
          updatedAt: new Date().toISOString(),
        })),
      )
    }
    else {
      setToolExecutionStates([])
    }

    const tempUserMessage: Message = {
      id: userId,
      conversationId,
      role: 'user',
      content,
      status: 'done',
      senderType: 'user',
      senderName: '用户',
      attachments: [],
      createdAt: new Date().toISOString(),
      metadata: { transient: true, mode: options?.mode || 'send' },
    }

    const tempAssistantMessage: Message = {
      id: assistantId,
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      senderType: 'assistant',
      senderName: personaName || '助手',
      attachments: [],
      createdAt: new Date().toISOString(),
      metadata: { transient: true, mode: options?.mode || 'send' },
    }

    const currentMessages = useConversationStore.getState().messages
    setMessages(
      mergeTransientTurnMessages(
        currentMessages,
        [
          tempUserMessage,
          createTransientMessage(conversationId, thinkingId, 'system', '正在分析你的问题...'),
          tempAssistantMessage,
        ],
      ),
    )

    try {
      await messageService.streamMessage(
        conversationId,
        content,
        {
          onMessageCreated: () => {
            streamAcceptedByServer = true
          },
          onThinking: (payload) => {
            updateMessage(thinkingId, {
              content: payload.message || '正在分析你的问题...',
            })
          },
          onToolCalling: (payload) => {
            const fallbackMessage = payload.manual
              ? `正在按你的指定调用 ${payload.manualCount || payload.toolCount || 0} 个工具...`
              : `正在自动调用 ${payload.autoCount || payload.toolCount || 0} 个工具能力...`
            updateMessage(thinkingId, {
              content: payload.message || fallbackMessage,
            })
            if (payload.manual) {
              setToolExecutionStates(current => current.map((item) => {
                if (item.status !== 'queued') return item
                return {
                  ...item,
                  status: 'running',
                  detail: '执行中',
                  updatedAt: new Date().toISOString(),
                }
              }))
            }
          },
          onToolResult: (payload) => {
            streamToolResults.push({
              type: payload.type,
              name: payload.name,
              label: payload.label,
              title: payload.title,
              summary: payload.summary,
              result: payload.result,
              manual: payload.manual,
              inputText: payload.inputText,
              inputParams: payload.inputParams,
              error: payload.error,
              toolName: payload.toolName,
              executionMode: payload.executionMode,
            })
            if (payload.manual) {
              const payloadLabel = normalizeToolLabel(payload.label || payload.name || payload.title)
              const payloadKey = getManualToolExecutionKey(payload.type, payload.name)
              setToolExecutionStates(current => current.map((item) => {
                const currentKey = getManualToolExecutionKey(item.type, item.targetId)
                const sameTarget = currentKey === payloadKey
                const sameLabel = normalizeToolLabel(item.label) === payloadLabel
                if (!sameTarget && !sameLabel) return item

                return {
                  ...item,
                  status: payload.error ? 'error' : 'success',
                  detail: payload.error ? (payload.summary || payload.error || '执行失败') : (payload.summary || '执行完成'),
                  updatedAt: new Date().toISOString(),
                }
              }))
            }
            const toolMessageId = `temp-tool-${nonce}-${payload.type}-${payload.name}`
            const existing = useConversationStore.getState().messages.find(message => message.id === toolMessageId)
            if (existing) {
              updateMessage(toolMessageId, {
                content: payload.result,
                toolStatus: 'success',
                metadata: {
                  ...existing.metadata,
                  title: payload.title,
                  summary: payload.summary,
                  error: payload.error,
                  toolName: payload.toolName,
                  executionMode: payload.executionMode,
                  inputText: payload.inputText,
                  inputParams: payload.inputParams,
                },
              })
              return
            }

            addMessage(
              createTransientMessage(
                conversationId,
                toolMessageId,
                'tool',
                payload.result,
                {
                  toolName: payload.name,
                  toolStatus: payload.error ? 'error' : 'success',
                  senderName: payload.manual
                    ? (payload.type === 'mcp' ? '手动调用 MCP 服务' : '手动调用 Skill')
                    : (payload.type === 'mcp' ? '自动调用 MCP 服务' : '自动调用 Skill'),
                  metadata: {
                    transient: true,
                    toolType: payload.type,
                    manual: payload.manual,
                    invocationMode: payload.manual ? 'manual' : 'automatic',
                    title: payload.title,
                    summary: payload.summary,
                    error: payload.error,
                    toolName: payload.toolName,
                    executionMode: payload.executionMode,
                    inputText: payload.inputText,
                    inputParams: payload.inputParams,
                  },
                },
              ),
            )
          },
          onMemorySync: (payload) => {
            const existing = useConversationStore.getState().messages.find(message => message.id === memoryId)
            if (existing) {
              updateMessage(memoryId, { content: payload.message || '正在整理阶段记忆...' })
              return
            }

            addMessage(
              createTransientMessage(
                conversationId,
                memoryId,
                'system',
                payload.message || '正在整理阶段记忆...',
              ),
            )
          },
          onLive2dStateChange: (state) => {
            setLive2dState(state)
          },
          onToken: (token) => {
            const current = useConversationStore
              .getState()
              .messages
              .find(message => message.id === assistantId)

            updateMessage(assistantId, {
              content: `${current?.content || ''}${token}`,
              status: 'streaming',
            })
          },
          onFinalAnswer: async (payload) => {
            const fallbackUsage = deriveToolUsage(streamToolResults)
            const toolUsage = payload.toolUsage || fallbackUsage
            const manualToolRequests = payload.manualToolRequests || options?.manualToolRequests || []
            if (manualToolRequests.length > 0) {
              setToolExecutionStates(current => current.map((item) => {
                if (item.status !== 'queued' && item.status !== 'running') return item
                return {
                  ...item,
                  status: 'success',
                  detail: '执行完成',
                  updatedAt: new Date().toISOString(),
                }
              }))
            }
            updateMessage(assistantId, {
              id: payload.messageId,
              content: payload.content,
              status: 'done',
              metadata: {
                toolResults: streamToolResults,
                toolUsage,
                manualToolRequests,
              },
            })

            try {
              const updatedMessages = await messageService.getMessages(conversationId)
              setMessages(updatedMessages)
              await loadConversation(conversationId)
            }
            catch (refreshError) {
              console.error('final-answer refresh failed:', refreshError)
              pushNotification({
                type: 'info',
                title: '回复已生成，列表刷新失败',
                description: '你可以继续对话，或稍后手动刷新会话列表。',
              })
            }
          },
          onStopped: () => {
            setToolExecutionStates(current => current.map((item) => {
              if (item.status !== 'queued' && item.status !== 'running') return item
              return {
                ...item,
                status: 'error',
                detail: '已停止',
                updatedAt: new Date().toISOString(),
              }
            }))
            const currentMessages = useConversationStore.getState().messages
            const persistedMessages = dropTransientMessages(currentMessages)
            setMessages([
              ...persistedMessages,
              createTransientMessage(conversationId, `stopped-${nonce}`, 'system', '已停止本轮生成。'),
            ])
          },
        },
        {
          metadata: streamMetadata,
          manualToolRequests: options?.manualToolRequests,
        },
      )
    }
    catch (streamError) {
      setLive2dState('error')
      setToolExecutionStates(current => current.map((item) => {
        if (item.status !== 'queued' && item.status !== 'running') return item
        return {
          ...item,
          status: 'error',
          detail: '执行失败',
          updatedAt: new Date().toISOString(),
        }
      }))
      const failureOutcome = await handleStreamFailure({
        streamError,
        streamAcceptedByServer,
        conversationId,
        nonce,
        assistantId,
        content,
        manualToolRequests: options?.manualToolRequests,
        getCurrentMessages: () => useConversationStore.getState().messages,
        setMessages,
        dropTransientMessages,
        createTransientMessage,
        loadConversation,
        sendFallbackMessage: (cid, text, manualToolRequests) => messageService.sendMessage(
          cid,
          text,
          undefined,
          manualToolRequests,
          streamMetadata,
        ),
        updateMessage,
        pushNotification,
        fallbackMetadata: streamMetadata,
        onLoadConversationError: (error) => {
          if (import.meta.env.DEV) {
            console.warn('stream-interrupted refresh failed:', error)
          }
        },
      })
      if (failureOutcome === 'fallback-failed') {
        if (isExpectedUserInputError(streamError)) {
          const manualValidationMessage = extractManualToolValidationMessage(streamError)
          if (manualValidationMessage) {
            setBackendToolValidationMessage(manualValidationMessage)
          }
          if (import.meta.env.DEV) {
            console.info('流式发送失败（输入校验类）：', streamError)
          }
        }
        else {
          console.error('流式发送失败：', streamError)
        }
      }
    }
    finally {
      setIsSending(false)
      setLive2dState((current) => {
        if (current === 'error') {
          setTimeout(() => setLive2dState('idle'), 3000)
          return current
        }
        return 'idle'
      })
    }
  }, [addMessage, conversationId, isSending, loadConversation, personaName, pushNotification, setIsSending, setMessages, updateMessage])

  const handleSend = useCallback(async (
    content: string,
    options?: { manualToolRequests?: ManualToolRequest[] },
  ) => {
    await runStreamingTurn(content, {
      mode: 'send',
      manualToolRequests: options?.manualToolRequests,
    })
  }, [runStreamingTurn])

  const handleStop = useCallback(async () => {
    if (!conversationId) return

    try {
      await messageService.stopMessage(conversationId)
    }
    catch (error) {
      pushNotification({
        type: 'info',
        title: '停止请求未送达',
        description: error instanceof Error ? error.message : '已在本地停止等待，你可以稍后重试。',
      })
    }
    finally {
      setIsSending(false)
    }
  }, [conversationId, pushNotification, setIsSending])

  const handleRegenerate = useCallback(async () => {
    if (!conversationId || messages.length === 0) return

    const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')
    if (!lastUserMessage) {
      pushNotification({
        type: 'error',
        title: '重新生成失败',
        description: '当前会话里还没有可重试的用户消息。',
      })
      return
    }

    await runStreamingTurn(lastUserMessage.content, {
      mode: 'regenerate',
      metadata: { regenerated: true },
    })
  }, [conversationId, messages, pushNotification, runStreamingTurn])

  const handleClearContext = useCallback(() => {
    setMessages([])
    pushNotification({
      type: 'info',
      title: '已清空当前界面消息',
      description: '这不会删除数据库中的历史消息，刷新后仍会重新加载。',
    })
  }, [pushNotification, setMessages])

  const handleModeChange = useCallback(async (mode: ChatLayoutMode) => {
    setLayoutMode(mode)
    if (!conversationId) return

    try {
      await conversationService.updateConversation(conversationId, { layoutMode: mode })
      setConversation(current => current ? { ...current, layoutMode: mode } : current)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '切换布局失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }, [conversationId, pushNotification])

  const handleSettingsSaved = useCallback(async (updatedConversation: Conversation) => {
    setConversation(updatedConversation)
    setLayoutMode(updatedConversation.layoutMode)
    if (conversationId) {
      await loadConversation(conversationId)
    }
  }, [conversationId, loadConversation])

  const handleSummarizeMemory = useCallback(async () => {
    if (!conversationId) return

    setIsSummarizingMemory(true)
    try {
      const result = await memoryService.summarizeConversation(conversationId)
      const feedback: MemoryActionFeedback = {
        type: 'summary',
        title: '会话摘要已更新',
        description: `本次整理了 ${result.sourceMessageCount} 条消息，新的摘要已纳入记忆层。`,
        at: new Date().toISOString(),
      }
      setMemoryFeedback(feedback)
      pushNotification({
        type: 'success',
        title: '摘要已生成',
        description: `已处理 ${result.sourceMessageCount} 条消息。`,
      })
      await loadConversation(conversationId)
      notifyConversationMetaUpdated()
    }
    catch (error) {
      if (isMemoryVectorFallbackError(error)) {
        pushNotification({
          type: 'info',
          title: '记忆服务已降级',
          description: '向量服务暂不可用，本轮聊天不受影响，你可以继续对话。',
        })
        return
      }
      pushNotification({
        type: 'error',
        title: '生成摘要失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSummarizingMemory(false)
    }
  }, [conversationId, loadConversation, notifyConversationMetaUpdated, pushNotification])

  const handleRememberLatest = useCallback(async () => {
    if (!conversationId || !conversation) return

    const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
    if (!latestUserMessage) {
      pushNotification({
        type: 'info',
        title: '没有可写入的内容',
        description: '当前会话里还没有用户消息。',
      })
      return
    }

    setIsSavingMemory(true)
    try {
      await memoryService.createLongTermMemory({
        conversationId,
        personaId: conversation.personaId,
        memoryScope: 'conversation',
        content: latestUserMessage.content,
        tags: ['manual', 'chat'],
        metadata: { source: 'chat_manual_save', messageId: latestUserMessage.id },
      })
      const preview = latestUserMessage.content.length > 48
        ? `${latestUserMessage.content.slice(0, 48)}...`
        : latestUserMessage.content
      setMemoryFeedback({
        type: 'remember',
        title: '最新用户消息已记住',
        description: `已写入长期记忆：${preview}`,
        at: new Date().toISOString(),
      })
      pushNotification({
        type: 'success',
        title: '已写入长期记忆',
        description: '最近一条用户消息已保存。',
      })
      await loadConversation(conversationId)
      notifyConversationMetaUpdated()
    }
    catch (error) {
      if (isMemoryVectorFallbackError(error)) {
        pushNotification({
          type: 'info',
          title: '记忆服务已降级',
          description: '长期记忆写入向量索引暂不可用，但不影响继续聊天。',
        })
        return
      }
      pushNotification({
        type: 'error',
        title: '写入长期记忆失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSavingMemory(false)
    }
  }, [conversation, conversationId, loadConversation, messages, notifyConversationMetaUpdated, pushNotification])

  const handleDedupeMessages = useCallback(async () => {
    if (!conversationId) return

    setIsDedupingMessages(true)
    try {
      const result = await messageService.dedupeMessages(conversationId)
      if (result.deletedCount > 0) {
        pushNotification({
          type: 'success',
          title: '已清理重复回合',
          description: `删除 ${result.deletedCount} 条重复消息，压缩了 ${result.deletedTurnCount} 组回合。`,
        })
      }
      else {
        pushNotification({
          type: 'info',
          title: '无需清理',
          description: '当前会话没有检测到可清理的重复回合。',
        })
      }
      await loadConversation(conversationId)
      notifyConversationMetaUpdated()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '清理重复回合失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setIsDedupingMessages(false)
    }
  }, [conversationId, loadConversation, notifyConversationMetaUpdated, pushNotification])

  const handleOpenMemoryCenter = useCallback(() => {
    if (!conversation) {
      navigate('/memory')
      return
    }

    const params = new URLSearchParams()
    params.set('conversationId', conversation.id)
    params.set('personaId', conversation.personaId)
    params.set('memoryScope', 'conversation')
    navigate(`/memory?${params.toString()}`)
  }, [conversation, navigate])

  const handleOpenToolRepairConversationSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleOpenToolRepairMcpCenter = useCallback(() => {
    navigate('/mcp')
  }, [navigate])

  const showRegenerate = canRegenerateFromMessages(messages)
  const latestUserMessagePreview = useMemo(() => {
    const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
    if (!latestUserMessage) return null
    return latestUserMessage.content.length > 80
      ? `${latestUserMessage.content.slice(0, 80)}...`
      : latestUserMessage.content
  }, [messages])

  if (!conversationId) {
    return <EmptyConversation />
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b border-(--color-border) px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-medium">
                  {conversation?.title || '加载中...'}
                </h1>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setSettingsOpen(true)}
                  disabled={!conversation}
                >
                  <Settings2 className="h-4 w-4" />
                  会话设置
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {personaName && <Badge variant="secondary">{personaName}</Badge>}
                {modelName && <Badge variant="outline">{modelName}</Badge>}
                {skillNames.map(name => (
                  <Badge key={name} variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    {name}
                  </Badge>
                ))}
                {mcpNames.map(name => (
                  <Badge key={name} variant="outline" className="gap-1">
                    <Cable className="h-3 w-3" />
                    {name}
                  </Badge>
                ))}
                {relatedMemories.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Brain className="h-3 w-3" />
                    {relatedMemories.length} 条关联记忆
                  </Badge>
                )}
              </div>
            </div>
            <ChatModeToggle mode={layoutMode} onModeChange={handleModeChange} />
          </div>
        </div>

        <SessionOverview
          personaName={personaName}
          modelName={modelName}
          skillCount={conversation?.enabledSkillIds.length || 0}
          mcpCount={conversation?.enabledMcpServerIds.length || 0}
          memoryCount={relatedMemories.length}
          layoutMode={layoutMode}
          memoryFeedback={memoryFeedback}
        />

        <div className="min-h-0 flex-1">
          <ChatLayout
            layoutMode={layoutMode}
            messages={messages}
            isLoading={isLoadingMessages}
            live2dSlot={(
              <Live2DStage
                state={live2dState}
                modelId={personaLive2dModel}
                personaName={personaName}
                openingMessage={personaOpeningMessage}
                compact={layoutMode === 'chat'}
                full={layoutMode === 'companion'}
              />
            )}
            sidePanel={(
              <MemorySidePanel
                memories={relatedMemories}
                feedback={memoryFeedback}
                onOpenMemoryCenter={handleOpenMemoryCenter}
                onSummarize={handleSummarizeMemory}
                onRememberLatest={handleRememberLatest}
                isSummarizing={isSummarizingMemory}
                isSavingMemory={isSavingMemory}
              />
            )}
            inputSlot={(
              <ChatInput
                conversationId={conversationId}
                conversationTitle={conversation?.title}
                onSend={handleSend}
                onStop={handleStop}
                onRegenerate={showRegenerate ? handleRegenerate : undefined}
                onClearContext={handleClearContext}
                isSending={isSending}
                personaName={personaName}
                modelName={modelName}
                skillCount={conversation?.enabledSkillIds.length}
                mcpCount={conversation?.enabledMcpServerIds.length}
                enabledSkills={skills}
                enabledMcpServers={mcpServers}
                toolExecutionStates={toolExecutionStates}
                recentToolFailures={recentToolFailures}
                backendValidationMessage={backendToolValidationMessage}
                onOpenConversationSettings={handleOpenToolRepairConversationSettings}
                onOpenMcpCenter={handleOpenToolRepairMcpCenter}
                isContextLoading={isLoadingMessages}
                placeholder={personaOpeningMessage || '输入消息...'}
              />
            )}
          />
        </div>
      </div>

      {settingsOpen && conversation && (
        <Suspense fallback={null}>
          <ConversationSettingsDialog
            open={settingsOpen}
            conversation={conversation}
            relatedMemories={relatedMemories}
            memoryCount={relatedMemories.length}
            latestUserMessagePreview={latestUserMessagePreview}
            isSummarizingMemory={isSummarizingMemory}
            isSavingMemory={isSavingMemory}
            isDedupingMessages={isDedupingMessages}
            memoryFeedback={memoryFeedback}
            onOpenChange={setSettingsOpen}
            onSaved={handleSettingsSaved}
            onOpenMemoryCenter={handleOpenMemoryCenter}
            onSummarizeMemory={handleSummarizeMemory}
            onRememberLatest={handleRememberLatest}
            onDedupeMessages={handleDedupeMessages}
          />
        </Suspense>
      )}
    </>
  )
}



