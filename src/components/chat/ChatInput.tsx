import { useRef, useCallback, type KeyboardEvent } from 'react'
import {
  Send,
  Square,
  RefreshCw,
  Paperclip,
  Trash2,
  Bot,
  Cpu,
  Zap,
  Cable,
} from 'lucide-react'
import { cn } from '@/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ChatInputProps {
  onSend: (content: string) => void
  onStop?: () => void
  onRegenerate?: () => void
  onClearContext?: () => void
  isSending: boolean
  personaName?: string
  modelName?: string
  skillCount?: number
  mcpCount?: number
}

export function ChatInput({
  onSend,
  onStop,
  onRegenerate,
  onClearContext,
  isSending,
  personaName,
  modelName,
  skillCount = 0,
  mcpCount = 0,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 6 * 24 // approx 6 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  const handleSend = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const content = el.value.trim()
    if (!content || isSending) return
    onSend(content)
    el.value = ''
    el.style.height = 'auto'
  }, [onSend, isSending])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="border-t border-(--color-border) bg-(--color-background)">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-(--color-muted-foreground) border-b border-(--color-border)/50">
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
            {skillCount} 技能
          </span>
        )}
        {mcpCount > 0 && (
          <span className="flex items-center gap-1">
            <Cable className="h-3 w-3" />
            {mcpCount} MCP
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {/* Left tools */}
        <div className="flex items-center gap-1 pb-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-(--color-muted-foreground)"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>附加文件</p>
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
                  onClick={onClearContext}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>清除上下文</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            className={cn(
              'w-full resize-none rounded-xl border border-(--color-input) bg-(--color-card) px-4 py-3 text-sm leading-6',
              'placeholder:text-(--color-muted-foreground)',
              'focus:outline-none focus:ring-2 focus:ring-(--color-ring) focus:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'min-h-[48px] max-h-[144px]',
            )}
            placeholder="输入消息..."
            rows={1}
            disabled={isSending}
            onInput={autoResize}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 pb-1">
          {onRegenerate && !isSending && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-(--color-muted-foreground)"
                    onClick={onRegenerate}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>重新生成</p>
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
                    onClick={handleSend}
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
