import { useState } from 'react'
import { History, X } from 'lucide-react'
import { cn } from '@/utils'
import type { Message, ChatLayoutMode } from '@/types'
import { Button } from '@/components/ui/button'
import { MessageList } from '@/components/chat/MessageList'
import { MessageBubble } from '@/components/chat/MessageBubble'

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
    .filter((m) => m.role === 'assistant' && m.status !== 'error')
    .at(-1)

  if (!lastAssistant) return null

  return (
    <div className="absolute top-6 left-[38%] max-w-md max-h-[60%] z-10">
      <div className="relative">
        <div className="rounded-2xl bg-(--color-card) border border-(--color-border) shadow-lg px-5 py-4 text-sm leading-relaxed overflow-y-auto max-h-[55vh]">
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            {lastAssistant.content}
          </div>
        </div>
        {/* Tail pointing toward character */}
        <div className="absolute bottom-4 -left-2 w-4 h-4 rotate-45 bg-(--color-card) border-l border-b border-(--color-border)" />
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

  // Chat mode layout (WeChat-style)
  if (layoutMode === 'chat') {
    return (
      <div className="flex h-full">
        <div className="flex flex-1 flex-col min-w-0">
          <MessageList
            messages={messages}
            layoutMode="chat"
            isLoading={isLoading}
          />
          {inputSlot}
        </div>

        <div className="hidden lg:flex w-[300px] shrink-0 flex-col border-l border-(--color-border) bg-(--color-muted)/20">
          <div className="flex flex-1 items-center justify-center">
            {live2dSlot}
          </div>
          {sidePanel}
        </div>
      </div>
    )
  }

  // Companion mode layout
  return (
    <div className="flex flex-1 flex-col min-w-0 h-full relative">
      {/* Main stage area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Live2D character — center-left */}
        <div className="absolute inset-0 flex items-center justify-start pl-[10%]">
          {live2dSlot}
        </div>

        {/* Single speech bubble — top-right of character */}
        <CompanionSpeechBubble messages={messages} />

        {/* Chat history toggle — top-left */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'absolute top-4 left-4 z-20 gap-2 rounded-full bg-(--color-background)/80 backdrop-blur-sm shadow-sm',
            historyOpen && 'hidden',
          )}
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-4 w-4" />
          聊天记录
        </Button>

        {/* Chat history panel overlay — top-left */}
        <div
          className={cn(
            'absolute top-4 left-4 z-30 w-[360px] flex flex-col rounded-2xl border border-(--color-border) bg-(--color-background)/95 backdrop-blur-md shadow-xl transition-all duration-200',
            historyOpen
              ? 'opacity-100 translate-y-0 h-[70%]'
              : 'opacity-0 -translate-y-2 pointer-events-none h-0',
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border) shrink-0">
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
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-1 p-2">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} layoutMode="chat" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input at bottom */}
      {inputSlot}
    </div>
  )
}
