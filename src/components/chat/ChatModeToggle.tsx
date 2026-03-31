import { MessageSquare, Heart } from 'lucide-react'
import { cn } from '@/utils'
import type { ChatLayoutMode } from '@/types'
import { Button } from '@/components/ui/button'

interface ChatModeToggleProps {
  mode: ChatLayoutMode
  onModeChange: (mode: ChatLayoutMode) => void
}

export function ChatModeToggle({ mode, onModeChange }: ChatModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-(--color-border) bg-(--color-muted)/50 p-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 rounded-md px-3 text-xs font-medium transition-all',
          mode === 'chat'
            ? 'bg-(--color-background) text-(--color-foreground) shadow-sm'
            : 'text-(--color-muted-foreground) hover:text-(--color-foreground)',
        )}
        onClick={() => onModeChange('chat')}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        聊天模式
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 rounded-md px-3 text-xs font-medium transition-all',
          mode === 'companion'
            ? 'bg-(--color-background) text-(--color-foreground) shadow-sm'
            : 'text-(--color-muted-foreground) hover:text-(--color-foreground)',
        )}
        onClick={() => onModeChange('companion')}
      >
        <Heart className="h-3.5 w-3.5" />
        陪伴模式
      </Button>
    </div>
  )
}
