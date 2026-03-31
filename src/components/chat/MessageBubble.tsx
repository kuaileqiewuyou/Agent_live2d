import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Copy,
  Check,
  Bot,
  User,
  Wrench,
  Loader2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils'
import type { Message, ChatLayoutMode } from '@/types'
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

interface MessageBubbleProps {
  message: Message
  layoutMode: ChatLayoutMode
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
    <div className="group/code relative my-2 rounded-lg overflow-hidden border border-(--color-border)">
      <div className="flex items-center justify-between bg-(--color-muted) px-4 py-1.5 text-xs text-(--color-muted-foreground)">
        <span className="font-mono">{lang || '代码'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs opacity-0 group-hover/code:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
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
          <span className="animate-bounce [animation-delay:0ms] h-1 w-1 rounded-full bg-current" />
          <span className="animate-bounce [animation-delay:150ms] h-1 w-1 rounded-full bg-current" />
          <span className="animate-bounce [animation-delay:300ms] h-1 w-1 rounded-full bg-current" />
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

export function MessageBubble({ message, layoutMode }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // System messages
  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-2">
        <div className="rounded-full bg-(--color-muted) px-4 py-1.5 text-xs text-(--color-muted-foreground)">
          {message.content}
        </div>
      </div>
    )
  }

  // Tool messages
  if (message.role === 'tool') {
    return (
      <div className="flex justify-start py-1.5 px-4">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-2 text-sm hover:bg-(--color-accent) transition-colors w-full text-left">
              <Wrench className="h-4 w-4 text-(--color-muted-foreground) shrink-0" />
              <span className="font-medium truncate">{message.toolName || '工具调用'}</span>
              <ToolStatusBadge status={message.toolStatus} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 ml-6 rounded-lg border border-(--color-border) bg-(--color-muted)/30 p-3 text-xs font-mono whitespace-pre-wrap break-all text-(--color-muted-foreground)">
              {message.content}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  // Error messages
  if (message.status === 'error' && message.role === 'assistant') {
    return (
      <div className="flex justify-start py-1.5 px-4">
        <div className="flex gap-3 max-w-[80%]">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-red-100 text-red-600 text-xs">
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

  // Companion mode: assistant messages as floating speech bubbles
  if (isCompanionBubble) {
    return (
      <div className="flex justify-center py-2">
        <div className="relative max-w-xs">
          <div className="rounded-2xl bg-(--color-card) border border-(--color-border) shadow-lg px-4 py-3 text-sm">
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ className, children }) => (
                    <CodeBlock className={className}>{children}</CodeBlock>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            <StatusIndicator status={message.status} />
          </div>
          {/* Speech bubble tail */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-(--color-card) border-r border-b border-(--color-border)" />
        </div>
      </div>
    )
  }

  // Standard chat mode messages
  return (
    <div
      className={cn(
        'group flex gap-3 py-1.5 px-4',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
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

      {/* Content */}
      <div
        className={cn(
          'flex flex-col max-w-[75%]',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {/* Sender name for agent type */}
        {message.senderType === 'agent' && message.senderName && (
          <span className="text-xs text-(--color-muted-foreground) mb-1 px-1">
            {message.senderName}
          </span>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-(--color-primary) text-(--color-primary-foreground) rounded-tr-sm'
              : 'bg-(--color-card) border border-(--color-border) text-(--color-card-foreground) rounded-tl-sm',
          )}
        >
          {/* Reasoning section */}
          {message.reasoning && (
            <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity mb-2 w-full text-left">
                  {reasoningOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span>推理过程</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mb-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2 text-xs leading-relaxed opacity-80 whitespace-pre-wrap">
                  {message.reasoning}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Message content */}
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ className, children }) => (
                    <CodeBlock className={className}>{children}</CodeBlock>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Status indicator */}
          <StatusIndicator status={message.status} />

          {/* Copy button on hover */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'absolute -bottom-3 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-(--color-background) border border-(--color-border) shadow-sm',
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
