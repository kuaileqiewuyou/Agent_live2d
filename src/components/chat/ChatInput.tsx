import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, useState } from 'react'
import {
  AlertTriangle,
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
import type { MCPServer, ManualToolExecutionState, ManualToolFailureHint, ManualToolRequest, Skill } from '@/types'
import { cn, createSurfaceTintColor } from '@/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChatToolPanel } from '@/components/chat/ChatToolPanel'
import {
  buildManualToolBackendValidationHint,
  buildManualToolValidationErrorMessage,
  buildToolFallbackContent,
  formatManualToolBackendValidationIssue,
  getComposerDraftForConversation,
  getInvalidTypedParams,
  getMissingRequiredParams,
  getToolDraftForConversation,
  hasToolParams,
  parseManualToolBackendValidationIssues,
  persistComposerDraftForConversation,
  persistToolDraftForConversation,
} from '@/components/chat/toolDraft'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useChatAppearanceStore, useNotificationStore } from '@/stores'
import { useBackendHealth } from '@/hooks'

interface SendOptions {
  manualToolRequests?: ManualToolRequest[]
}

interface RuntimeModelOption {
  id: string
  name: string
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
  toolExecutionStates?: ManualToolExecutionState[]
  recentToolFailures?: ManualToolFailureHint[]
  backendValidationMessage?: string | null
  onOpenConversationSettings?: () => void
  onOpenMcpCenter?: () => void
  isContextLoading?: boolean
  streamStatusText?: string | null
  placeholder?: string
  runtimeModelOptions?: RuntimeModelOption[]
  selectedRuntimeModelId?: string
  onRuntimeModelChange?: (modelConfigId: string) => void
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
  skillCount,
  mcpCount,
  enabledSkills = [],
  enabledMcpServers = [],
  toolExecutionStates = [],
  recentToolFailures = [],
  backendValidationMessage = null,
  onOpenConversationSettings,
  onOpenMcpCenter,
  isContextLoading = false,
  streamStatusText = null,
  placeholder = '输入消息...',
  runtimeModelOptions = [],
  selectedRuntimeModelId,
  onRuntimeModelChange,
}: ChatInputProps) {

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pushNotification = useNotificationStore((state) => state.push)
  const {
    isReachable: isBackendReachable,
    hasChecked: hasBackendChecked,
    checking: isBackendChecking,
    lastCheckedAt,
    retry: retryBackendHealth,
  } = useBackendHealth()
  const inputOpacity = useChatAppearanceStore((state) => state.inputOpacity)
  const [toolPanelOpen, setToolPanelOpen] = useState(false)
  const [selectedRequests, setSelectedRequests] = useState<ManualToolRequest[]>([])
  const [composerText, setComposerText] = useState('')
  const [hydratedConversationId, setHydratedConversationId] = useState<string | null>(null)

  const enabledSkillIds = useMemo(
    () => new Set(enabledSkills.map(skill => skill.id)),
    [enabledSkills],
  )
  const enabledMcpIds = useMemo(
    () => new Set(enabledMcpServers.map(server => server.id)),
    [enabledMcpServers],
  )

  const filterUnavailableRequests = useCallback((requests: ManualToolRequest[]) => {
    const hasAvailabilityCatalog = enabledSkillIds.size > 0 || enabledMcpIds.size > 0
    const canInferNoEnabledTools = skillCount === 0 && mcpCount === 0
    if (!hasAvailabilityCatalog && !canInferNoEnabledTools) {
      return requests
    }

    return requests.filter((request) => {
      if (request.type === 'skill') return enabledSkillIds.has(request.targetId)
      if (request.type === 'mcp') return enabledMcpIds.has(request.targetId)
      return false
    })
  }, [enabledMcpIds, enabledSkillIds, mcpCount, skillCount])

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
    if (isContextLoading) return

    const filtered = filterUnavailableRequests(selectedRequests)
    if (filtered.length === selectedRequests.length) return

    setSelectedRequests(filtered)
  }, [
    conversationId,
    filterUnavailableRequests,
    hydratedConversationId,
    isContextLoading,
    selectedRequests,
  ])

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
  const backendValidationIssues = useMemo(
    () => parseManualToolBackendValidationIssues(backendValidationMessage || ''),
    [backendValidationMessage],
  )
  const backendValidationHint = useMemo(
    () => buildManualToolBackendValidationHint(backendValidationMessage || ''),
    [backendValidationMessage],
  )

  const helperText = useMemo(() => {
    if (selectedRequests.length === 0) return null

    const missingCount = requestsWithMissingRequired.length
    const invalidCount = requestsWithInvalidTyped.length
    const base = `已选择 ${selectedRequests.length} 个 Tool，${selectedInputCount} 个带参数`

    if (missingCount > 0) {
      return `${base}，${missingCount} 个缺少必填参数。`
    }
    if (invalidCount > 0) {
      return `${base}，${invalidCount} 个参数类型不正确。`
    }
    return `${base}；未输入消息时会自动生成一条兜底指令。`
  }, [requestsWithInvalidTyped.length, requestsWithMissingRequired.length, selectedInputCount, selectedRequests.length])

  const toolValidationStatus = useMemo(() => {
    if (selectedRequests.length === 0) return null

    const missingCount = requestsWithMissingRequired.length
    const invalidCount = requestsWithInvalidTyped.length

    if (missingCount > 0) {
      return {
        tone: 'error' as const,
        text: `Tool 参数未完成：${missingCount} 个 Tool 缺少必填项`,
      }
    }

    if (invalidCount > 0) {
      return {
        tone: 'warn' as const,
        text: `Tool 参数类型错误：${invalidCount} 个 Tool 需要修正`,
      }
    }

    return {
      tone: 'ok' as const,
      text: 'Tool 参数已通过校验，可直接发送（消息留空时会自动生成兜底指令）。',
    }
  }, [requestsWithInvalidTyped.length, requestsWithMissingRequired.length, selectedRequests.length])

  const hasBlockingToolValidationIssue = selectedRequests.length > 0
    && (requestsWithMissingRequired.length > 0 || requestsWithInvalidTyped.length > 0)
  const showBackendOffline = hasBackendChecked && !isBackendReachable
  const sendDisabled = hasBlockingToolValidationIssue || showBackendOffline

  const backendCheckedAtText = useMemo(() => {
    if (!lastCheckedAt) return '未检查'
    return new Date(lastCheckedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [lastCheckedAt])

  const inputContainerStyle = useMemo(
    () => ({
      backgroundColor: createSurfaceTintColor('--color-background', inputOpacity),
    }),
    [inputOpacity],
  )

  const textareaSurfaceStyle = useMemo(
    () => ({
      backgroundColor: createSurfaceTintColor('--color-card', inputOpacity),
    }),
    [inputOpacity],
  )

  const handleSend = useCallback((overrides?: {
    content?: string
    manualToolRequests?: ManualToolRequest[]
  }) => {
    if (showBackendOffline) {
      pushNotification({
        type: 'error',
        title: '后端暂不可达',
        description: '消息发送已暂停，请先点击重试连接恢复后端连接。',
      })
      return
    }

    const manualToolRequests = overrides?.manualToolRequests ?? selectedRequests
    const missingRequired = manualToolRequests
      .map(request => ({ request, missing: getMissingRequiredParams(request) }))
      .filter(item => item.missing.length > 0)
    const invalidTyped = manualToolRequests
      .map(request => ({ request, invalid: getInvalidTypedParams(request) }))
      .filter(item => item.invalid.length > 0)

    if (missingRequired.length > 0) {
      const validationMessage = manualToolRequests
        .map((request, index) => buildManualToolValidationErrorMessage(request, index))
        .find((item): item is string => Boolean(item))
      setToolPanelOpen(true)
      pushNotification({
        type: 'error',
        title: 'Tool 参数不完整',
        description: validationMessage || `${missingRequired.length} 个 Tool 缺少必填参数，请先补全后再发送。`,
      })
      return
    }

    if (invalidTyped.length > 0) {
      const validationMessage = manualToolRequests
        .map((request, index) => buildManualToolValidationErrorMessage(request, index))
        .find((item): item is string => Boolean(item))
      setToolPanelOpen(true)
      pushNotification({
        type: 'error',
        title: 'Tool 参数格式错误',
        description: validationMessage || `${invalidTyped.length} 个 Tool 的参数类型不正确，请修正后再发送。`,
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
    setToolPanelOpen(false)
  }, [clearComposer, composerText, conversationTitle, isSending, onSend, pushNotification, selectedRequests, showBackendOffline])

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
    <div
      className="border-t border-(--color-border) bg-(--color-background)/80 backdrop-blur-sm"
      style={inputContainerStyle}
    >
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
        {(skillCount ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {skillCount} 个 Skill
          </span>
        )}
        {(mcpCount ?? 0) > 0 && (
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
            toolExecutionStates={toolExecutionStates}
            selectedRequests={selectedRequests}
            recentToolFailures={recentToolFailures}
            backendValidationIssues={backendValidationIssues}
            conversationTitle={conversationTitle}
            personaName={personaName}
            disabled={isSending}
            onChange={setSelectedRequests}
            onQuickSend={handleQuickSend}
            onOpenConversationSettings={onOpenConversationSettings}
            onOpenMcpCenter={onOpenMcpCenter}
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
                  aria-label="打开 Tool Panel"
                  onClick={() => setToolPanelOpen(current => !current)}
                  disabled={isSending || !hasTools || showBackendOffline}
                >
                  <Wrench className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>打开 Tool Panel</p>
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
                  aria-label="附件（暂未开放）"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>附件（暂未开放）</p>
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
                  aria-label="清空当前上下文"
                  onClick={onClearContext}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>清空当前上下文</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="relative flex-1">
          {runtimeModelOptions.length > 0 && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="shrink-0 text-xs text-(--color-muted-foreground)">本条模型</span>
              <Select
                value={selectedRuntimeModelId}
                onValueChange={onRuntimeModelChange}
                disabled={isSending || !onRuntimeModelChange}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {runtimeModelOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showBackendOffline && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">后端连接异常，发送已暂停</span>
                </div>
                <div className="mt-0.5 text-[11px] text-amber-800/90">
                  最近检查：{backendCheckedAtText}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 border-amber-300 bg-amber-100/80 px-2 text-[11px] text-amber-900 hover:bg-amber-200"
                disabled={isBackendChecking}
                onClick={() => void retryBackendHealth()}
              >
                {isBackendChecking ? '重试中...' : '重试连接'}
              </Button>
            </div>
          )}

          {streamStatusText && (
            <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-(--color-muted-foreground)">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-primary)/80" />
              <span className="truncate">{streamStatusText}</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            aria-label="聊天输入框"
            className={cn(
              'min-h-[48px] max-h-[144px] w-full resize-none rounded-xl border border-(--color-input) bg-(--color-card)/80 px-4 py-3 text-sm leading-6 backdrop-blur-sm',
              'placeholder:text-(--color-muted-foreground)',
              'focus:outline-none focus:ring-2 focus:ring-(--color-ring) focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            style={textareaSurfaceStyle}
            placeholder={placeholder}
            rows={1}
            disabled={isSending}
            value={composerText}
            onChange={event => setComposerText(event.target.value)}
            onKeyDown={handleKeyDown}
          />

          {selectedRequests.length > 0 && (
            <>
              {backendValidationHint && (
                <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800">
                  <div className="font-medium">{backendValidationHint}</div>
                  <div className="mt-0.5">
                    {backendValidationIssues.slice(0, 3).map((issue, index) => (
                      <span key={`${issue.requestIndex}-${issue.field}-${index}`} className="mr-2 inline-block">
                        {formatManualToolBackendValidationIssue(issue)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {toolValidationStatus && (
                <div
                  className={cn(
                    'mb-2 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]',
                    toolValidationStatus.tone === 'error' && 'border-(--color-destructive)/40 bg-(--color-destructive)/10 text-(--color-destructive)',
                    toolValidationStatus.tone === 'warn' && 'border-amber-400/40 bg-amber-500/10 text-amber-700',
                    toolValidationStatus.tone === 'ok' && 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700',
                  )}
                >
                  <span className="min-w-0 truncate">{toolValidationStatus.text}</span>
                  {toolValidationStatus.tone !== 'ok' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-[11px]"
                      onClick={() => setToolPanelOpen(true)}
                    >
                      查看详情
                    </Button>
                  )}
                </div>
              )}

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
                    aria-label="重新生成上一条回答"
                    onClick={onRegenerate}
                    disabled={showBackendOffline}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>重新生成上一条回答</p>
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
                    aria-label={
                      showBackendOffline
                        ? '后端离线，暂不可发送'
                        : hasBlockingToolValidationIssue
                          ? 'Tool 参数未完成，暂不可发送'
                          : '发送消息'
                    }
                    disabled={sendDisabled}
                    onClick={() => handleSend()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showBackendOffline
                      ? '后端离线，请先点击重试连接'
                      : hasBlockingToolValidationIssue
                        ? '请先修正 Tool 参数后再发送'
                        : '发送消息'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  )
}


