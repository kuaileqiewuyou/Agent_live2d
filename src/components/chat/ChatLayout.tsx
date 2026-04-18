import { useState } from 'react'
import { History, X } from 'lucide-react'
import { cn, createSurfaceTintColor } from '@/utils'
import type { ChatLayoutMode, Message } from '@/types'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { MessageList } from '@/components/chat/MessageList'
import { useChatAppearanceStore } from '@/stores'

interface ChatLayoutProps {
  layoutMode: ChatLayoutMode
  messages: Message[]
  live2dSlot: React.ReactNode
  inputSlot: React.ReactNode
  sidePanel?: React.ReactNode
  isLoading?: boolean
}

function CompanionSpeechBubble({ messages }: { messages: Message[] }) {
  const bubbleOpacity = useChatAppearanceStore((state) => state.bubbleOpacity)
  const lastAssistant = messages
    .filter((message) => message.role === 'assistant' && message.status !== 'error')
    .at(-1)

  if (!lastAssistant) return null

  const isStreaming = lastAssistant.status === 'streaming'
  const bubbleStyle = {
    backgroundColor: createSurfaceTintColor('--color-card', bubbleOpacity),
  }

  return (
    <div className="relative max-w-md shrink-0">
      <div
        className={cn(
          'max-h-[45vh] overflow-y-auto rounded-2xl border bg-(--color-card)/80 px-5 py-4 text-sm leading-relaxed shadow-lg backdrop-blur-sm',
          isStreaming ? 'border-(--color-primary)/30' : 'border-(--color-border)',
        )}
        style={bubbleStyle}
      >
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
          {lastAssistant.content || '...'}
        </div>
      </div>
      <div
        className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b border-l border-(--color-border) bg-(--color-card)/80 backdrop-blur-sm"
        style={bubbleStyle}
      />
    </div>
  )
}

export function ChatLayout({
  layoutMode,
  messages,
  live2dSlot,
  inputSlot,
  sidePanel,
  isLoading,
}: ChatLayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (layoutMode === 'chat') {
    return (
      <div className="flex h-full">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList
            messages={messages}
            layoutMode="chat"
            isLoading={isLoading}
          />
          {inputSlot}
        </div>

        <div className="hidden w-[300px] shrink-0 flex-col border-l border-(--color-border) bg-(--color-muted)/20 lg:flex">
          <div className="flex flex-1 items-center justify-center">
            {live2dSlot}
          </div>
          {sidePanel}
        </div>
      </div>
    )
  }

  /* ---- companion mode ---- */
  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* main area: live2d + bubble, flex-based stable layout */}
      <div className="relative flex min-h-0 flex-1 items-end gap-4 overflow-hidden px-6 pb-2 pt-14">
        {/* live2d character — fixed width, anchored to bottom */}
        <div className="flex h-full w-[clamp(200px,35%,400px)] shrink-0 items-end justify-center">
          {live2dSlot}
        </div>

        {/* speech bubble — fills remaining space */}
        <div className="flex min-w-0 flex-1 items-start pt-8">
          <CompanionSpeechBubble messages={messages} />
        </div>

        {/* history toggle */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'absolute left-4 top-4 z-20 gap-2 rounded-full bg-(--color-background)/80 shadow-sm backdrop-blur-sm',
            historyOpen && 'hidden',
          )}
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-4 w-4" />
          聊天记录
        </Button>

        {/* history overlay panel */}
        <div
          className={cn(
            'absolute left-4 top-4 z-30 flex w-[360px] max-w-[calc(100%-2rem)] flex-col rounded-2xl border border-(--color-border) bg-(--color-background)/95 shadow-xl backdrop-blur-md transition-all duration-200',
            historyOpen
              ? 'h-[70%] translate-y-0 opacity-100'
              : 'pointer-events-none h-0 -translate-y-2 opacity-0',
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-(--color-border) px-4 py-3">
            <span className="text-sm font-medium">聊天记录</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHistoryOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 p-2">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} layoutMode="chat" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {inputSlot}
    </div>
  )
}
