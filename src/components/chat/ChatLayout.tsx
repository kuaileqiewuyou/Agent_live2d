import { useState } from 'react'
import { History, X } from 'lucide-react'
import { cn } from '@/utils'
import type { ChatLayoutMode, Message } from '@/types'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { MessageList } from '@/components/chat/MessageList'

interface ChatLayoutProps {
  layoutMode: ChatLayoutMode
  messages: Message[]
  live2dSlot: React.ReactNode
  inputSlot: React.ReactNode
  sidePanel?: React.ReactNode
  isLoading?: boolean
}

function CompanionSpeechBubble({ messages }: { messages: Message[] }) {
  const lastAssistant = messages
    .filter((message) => message.role === 'assistant' && message.status !== 'error')
    .at(-1)

  if (!lastAssistant) return null

  return (
    <div className="absolute left-[38%] top-6 z-10 max-h-[60%] max-w-md">
      <div className="relative">
        <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-(--color-border) bg-(--color-card) px-5 py-4 text-sm leading-relaxed shadow-lg">
          <div className="prose prose-sm max-w-none break-words dark:prose-invert">
            {lastAssistant.content}
          </div>
        </div>
        <div className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b border-l border-(--color-border) bg-(--color-card)" />
      </div>
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

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-start pl-[10%]">
          {live2dSlot}
        </div>

        <CompanionSpeechBubble messages={messages} />

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

        <div
          className={cn(
            'absolute left-4 top-4 z-30 flex w-[360px] flex-col rounded-2xl border border-(--color-border) bg-(--color-background)/95 shadow-xl backdrop-blur-md transition-all duration-200',
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
