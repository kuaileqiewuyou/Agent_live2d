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
  LongTermMemory,
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
import { deriveToolUsage, type StreamToolResultMeta } from '@/pages/chat/toolUsage'

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

function formatShortTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
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
              <div className="text-xs text-(--color-muted-foreground)">当前人设</div>
              <div className="mt-1 truncate text-sm font-medium">{personaName || '未绑定人设'}</div>
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
      return
    }

    setCurrentConversationId(conversationId)
    void loadConversation(conversationId)
  }, [conversationId, loadConversation, setCurrentConversationId, setMessages])

  const skillNames = useMemo(() => skills.map(skill => skill.name), [skills])
  const mcpNames = useMemo(() => mcpServers.map(server => server.name), [mcpServers])

  const runStreamingTurn = useCallback(async (
    content: string,
    options?: {
      metadata?: Record<string, unknown>
      manualToolRequests?: ManualToolRequest[]
      mode?: 'send' | 'regenerate'
    },
  ) => {
    if (!conversationId || isSending) return

    setIsSending(true)
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
    let streamAcceptedByServer = false

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

    addMessage(tempUserMessage)
    addMessage(createTransientMessage(conversationId, thinkingId, 'system', '正在分析你的问题...'))
    addMessage(tempAssistantMessage)

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
            })
            const toolMessageId = `temp-tool-${nonce}-${payload.type}-${payload.name}`
            const existing = useConversationStore.getState().messages.find(message => message.id === toolMessageId)
            if (existing) {
              updateMessage(toolMessageId, {
                content: payload.result,
                toolStatus: 'success',
                metadata: { ...existing.metadata, title: payload.title, summary: payload.summary },
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
      await handleStreamFailure({
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
          console.error('stream-interrupted refresh failed:', error)
        },
      })
      console.error('流式发送失败：', streamError)
    }
    finally {
      setIsSending(false)
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
    finally {
      setIsSending(false)
    }
  }, [conversationId, setIsSending])

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

  const lastMessage = messages[messages.length - 1]
  const showRegenerate = lastMessage?.role === 'assistant' && lastMessage?.status === 'done'
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
                state={isSending ? 'thinking' : 'idle'}
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
