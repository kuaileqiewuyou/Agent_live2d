import { useEffect, useRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/utils'
import type { ChatLayoutMode, Message } from '@/types'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ScrollArea } from '@/components/ui/scroll-area'

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
        <p className="mt-1 text-sm">发送一条消息，看看你的 AI 伙伴会怎么回应。</p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {[1, 2, 3].map((index) => (
        <div key={index} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-(--color-muted)" />
          <div className="flex flex-1 flex-col gap-2">
            <div
              className="h-4 animate-pulse rounded bg-(--color-muted)"
              style={{ width: `${40 + index * 15}%` }}
            />
            <div
              className="h-4 animate-pulse rounded bg-(--color-muted)"
              style={{ width: `${30 + index * 10}%` }}
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
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} layoutMode={layoutMode} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
