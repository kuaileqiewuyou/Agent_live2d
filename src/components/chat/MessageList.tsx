import { useRef, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/utils'
import type { Message, ChatLayoutMode } from '@/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from '@/components/chat/MessageBubble'

interface MessageListProps {
  messages: Message[]
  layoutMode: ChatLayoutMode
  isLoading?: boolean
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-(--color-muted-foreground)">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--color-muted)">
        <MessageCircle className="h-8 w-8" />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium">开始新的对话吧</p>
        <p className="mt-1 text-sm">发送一条消息来开始交流</p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-(--color-muted) animate-pulse shrink-0" />
          <div className="flex flex-col gap-2 flex-1">
            <div
              className="h-4 rounded bg-(--color-muted) animate-pulse"
              style={{ width: `${40 + i * 15}%` }}
            />
            <div
              className="h-4 rounded bg-(--color-muted) animate-pulse"
              style={{ width: `${30 + i * 10}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MessageList({ messages, layoutMode, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) {
    return (
      <ScrollArea className="flex-1">
        <LoadingSkeleton />
      </ScrollArea>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1">
        <EmptyState />
      </div>
    )
  }

  return (
    <ScrollArea className={cn('flex-1')}>
      <div className="flex flex-col gap-1 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} layoutMode={layoutMode} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
