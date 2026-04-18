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
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const previousTailRef = useRef<{ id: string, status: Message['status'] } | null>(null)

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return

    const viewport = root.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if (!viewport) return

    const tail = messages.at(-1)
    if (!tail) return

    const previousTail = previousTailRef.current
    const isFirstRender = previousTail === null
    const isStreamingTail = tail.role === 'assistant' && tail.status === 'streaming'
    const sameStreamingTail = Boolean(
      previousTail
      && previousTail.id === tail.id
      && previousTail.status === 'streaming'
      && isStreamingTail,
    )
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const nearBottom = distanceToBottom <= 96

    // Keep following stream only when user is already near bottom.
    if (isFirstRender || nearBottom || sameStreamingTail) {
      const behavior: ScrollBehavior = sameStreamingTail || isFirstRender ? 'auto' : 'smooth'
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }

    previousTailRef.current = { id: tail.id, status: tail.status }
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
    <ScrollArea ref={scrollRootRef} className={cn('flex-1 overflow-x-hidden')}>
      <div className="flex flex-col gap-1 overflow-x-hidden py-4">
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} layoutMode={layoutMode} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
