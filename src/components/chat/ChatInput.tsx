import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, useState } from 'react'
import {
  Bot,
  Cable,
  Cpu,
  Paperclip,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react'
import type { MCPServer, ManualToolRequest, Skill } from '@/types'
import { cn } from '@/utils'
import { Button } from '@/components/ui/button'
import { ChatToolPanel } from '@/components/chat/ChatToolPanel'
import {
  buildToolFallbackContent,
  getComposerDraftForConversation,
  getInvalidTypedParams,
  getMissingRequiredParams,
  getToolDraftForConversation,
  hasToolParams,
  persistComposerDraftForConversation,
  persistToolDraftForConversation,
} from '@/components/chat/toolDraft'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useNotificationStore } from '@/stores'

interface SendOptions {
  manualToolRequests?: ManualToolRequest[]
}

interface ChatInputProps {
  conversationId?: string
  conversationTitle?: string
  onSend: (content: string, options?: SendOptions) => void
  onStop?: () => void
  onRegenerate?: () => void
  onClearContext?: () => void
  isSending: boolean
  personaName?: string
  modelName?: string
  skillCount?: number
  mcpCount?: number
  enabledSkills?: Skill[]
  enabledMcpServers?: MCPServer[]
  placeholder?: string
}

export function ChatInput({
  conversationId,
  conversationTitle,
  onSend,
  onStop,
  onRegenerate,
  onClearContext,
  isSending,
  personaName,
  modelName,
  skillCount = 0,
  mcpCount = 0,
  enabledSkills = [],
  enabledMcpServers = [],
  placeholder = '输入消息...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pushNotification = useNotificationStore((state) => state.push)
  const [toolPanelOpen, setToolPanelOpen] = useState(false)
  const [selectedRequests, setSelectedRequests] = useState<ManualToolRequest[]>([])
  const [composerText, setComposerText] = useState('')
  const [hydratedConversationId, setHydratedConversationId] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationId) {
      setSelectedRequests([])
      setComposerText('')
      setHydratedConversationId(null)
      return
    }
    const nextToolDraft = getToolDraftForConversation(conversationId)
    const nextComposerDraft = getComposerDraftForConversation(conversationId)
    setSelectedRequests(nextToolDraft)
    setComposerText(nextComposerDraft)
    setHydratedConversationId(conversationId)
  }, [conversationId])

  useEffect(() => {
    if (!conversationId || hydratedConversationId !== conversationId) return
    persistToolDraftForConversation(conversationId, selectedRequests)
  }, [conversationId, hydratedConversationId, selectedRequests])

  useEffect(() => {
    if (!conversationId || hydratedConversationId !== conversationId) return
    persistComposerDraftForConversation(conversationId, composerText)
  }, [composerText, conversationId, hydratedConversationId])

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    const maxHeight = 6 * 24
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    autoResize()
  }, [autoResize, composerText])

  const clearComposer = useCallback(() => {
    setComposerText('')
  }, [])

  const hasTools = enabledSkills.length > 0 || enabledMcpServers.length > 0

  const selectedInputCount = useMemo(
    () => selectedRequests.filter(request => hasToolParams(request)).length,
    [selectedRequests],
  )

  const requestsWithMissingRequired = useMemo(
    () => selectedRequests
      .map(request => ({ request, missing: getMissingRequiredParams(request) }))
      .filter(item => item.missing.length > 0),
    [selectedRequests],
  )

  const requestsWithInvalidTyped = useMemo(
    () => selectedRequests
      .map(request => ({ request, invalid: getInvalidTypedParams(request) }))
      .filter(item => item.invalid.length > 0),
    [selectedRequests],
  )

  const helperText = useMemo(() => {
    if (selectedRequests.length === 0) return null

    const missingCount = requestsWithMissingRequired.length
    const invalidCount = requestsWithInvalidTyped.length
    const base = `已选择 ${selectedRequests.length} 个 Tool（${selectedInputCount} 个带参数）`
    if (missingCount > 0) {
      return `${base}；${missingCount} 个缺少必填参数。`
    }
    if (invalidCount > 0) {
      return `${base}；${invalidCount} 个参数类型不正确。`
    }
    return `${base}；未输入消息时会自动生成一条兜底指令。`
  }, [requestsWithInvalidTyped.length, requestsWithMissingRequired.length, selectedInputCount, selectedRequests.length])

  const handleSend = useCallback((overrides?: {
    content?: string
    manualToolRequests?: ManualToolRequest[]
  }) => {
    const element = textareaRef.current
    if (!element) return

    const manualToolRequests = overrides?.manualToolRequests ?? selectedRequests
    const missingRequired = manualToolRequests
      .map(request => ({ request, missing: getMissingRequiredParams(request) }))
      .filter(item => item.missing.length > 0)
    const invalidTyped = manualToolRequests
      .map(request => ({ request, invalid: getInvalidTypedParams(request) }))
      .filter(item => item.invalid.length > 0)

    if (missingRequired.length > 0) {
      setToolPanelOpen(true)
      pushNotification({
        type: 'error',
        title: 'Tool 参数不完整',
        description: `${missingRequired.length} 个 Tool 缺少必填参数，请先补充后再发送。`,
      })
      return
    }
    if (invalidTyped.length > 0) {
      setToolPanelOpen(true)
      pushNotification({
        type: 'error',
        title: 'Tool 参数格式错误',
        description: `${invalidTyped.length} 个 Tool 的参数类型不正确，请修正后再发送。`,
      })
      return
    }

    const rawContent = overrides?.content ?? composerText
    const content = rawContent.trim() || buildToolFallbackContent(manualToolRequests, conversationTitle)
    if (!content || isSending) return

    onSend(content, {
      manualToolRequests: manualToolRequests.length > 0 ? manualToolRequests : undefined,
    })

    clearComposer()
    setSelectedRequests([])
    setToolPanelOpen(false)
  }, [clearComposer, composerText, conversationTitle, isSending, onSend, pushNotification, selectedRequests])

  const handleQuickSend = useCallback((request: ManualToolRequest, defaultContent: string) => {
    const currentDraft = composerText.trim()
    handleSend({
      content: currentDraft || defaultContent,
      manualToolRequests: [request],
    })
  }, [composerText, handleSend])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="border-t border-(--color-border) bg-(--color-background)">
      <div className="flex items-center gap-3 border-b border-(--color-border)/50 px-4 py-1.5 text-xs text-(--color-muted-foreground)">
        {personaName && (
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {personaName}
          </span>
        )}
        {modelName && (
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            {modelName}
          </span>
        )}
        {skillCount > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {skillCount} 个 Skill
          </span>
        )}
        {mcpCount > 0 && (
          <span className="flex items-center gap-1">
            <Cable className="h-3 w-3" />
            {mcpCount} 个 MCP
          </span>
        )}
      </div>

      <div className="relative flex items-end gap-2 p-3">
        {toolPanelOpen && (
          <ChatToolPanel
            skills={enabledSkills}
            mcpServers={enabledMcpServers}
            selectedRequests={selectedRequests}
            conversationTitle={conversationTitle}
            personaName={personaName}
            disabled={isSending}
            onChange={setSelectedRequests}
            onQuickSend={handleQuickSend}
          />
        )}

        <div className="flex items-center gap-1 pb-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={toolPanelOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 text-(--color-muted-foreground)"
                  aria-label="打开工具面板"
                  onClick={() => setToolPanelOpen(current => !current)}
                  disabled={isSending || !hasTools}
                >
                  <Wrench className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>打开工具面板</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-(--color-muted-foreground)"
                  aria-label="附件能力预留"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>附件能力预留</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-(--color-muted-foreground)"
                  aria-label="清空当前界面消息"
                  onClick={onClearContext}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>清空当前界面消息</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            aria-label="聊天输入框"
            className={cn(
              'min-h-[48px] max-h-[144px] w-full resize-none rounded-xl border border-(--color-input) bg-(--color-card) px-4 py-3 text-sm leading-6',
              'placeholder:text-(--color-muted-foreground)',
              'focus:outline-none focus:ring-2 focus:ring-(--color-ring) focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            placeholder={placeholder}
            rows={1}
            disabled={isSending}
            value={composerText}
            onChange={event => setComposerText(event.target.value)}
            onKeyDown={handleKeyDown}
          />

          {selectedRequests.length > 0 && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRequests.map(request => {
                  const missingRequired = getMissingRequiredParams(request)
                  const invalidTyped = getInvalidTypedParams(request)
                  return (
                    <button
                      key={request.id}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-muted)/50 px-2.5 py-1 text-xs text-(--color-foreground)"
                      onClick={() => setSelectedRequests(current => current.filter(item => item.id !== request.id))}
                    >
                      {request.type === 'skill' ? <Sparkles className="h-3 w-3" /> : <Cable className="h-3 w-3" />}
                      <span>{request.label}</span>
                      {hasToolParams(request) && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-(--color-background) px-1.5 py-0.5 text-[10px] text-(--color-muted-foreground)">
                          <SlidersHorizontal className="h-2.5 w-2.5" />
                          参数
                        </span>
                      )}
                      {missingRequired.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-(--color-destructive)/10 px-1.5 py-0.5 text-[10px] text-(--color-destructive)">
                          缺少必填
                        </span>
                      )}
                      {invalidTyped.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                          类型错误
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {helperText && (
                <div className="mt-2 text-xs text-(--color-muted-foreground)">
                  {helperText}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 pb-1">
          {onRegenerate && !isSending && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-(--color-muted-foreground)"
                    aria-label="重新生成上一条回复"
                    onClick={onRegenerate}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>重新生成上一条回复</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {isSending ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    aria-label="停止生成"
                    onClick={onStop}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>停止生成</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    aria-label="发送消息"
                    onClick={() => handleSend()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>发送消息</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  )
}
