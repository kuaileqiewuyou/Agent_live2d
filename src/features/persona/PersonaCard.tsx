import { Brain, Edit2, MessageSquare, Route, Trash2 } from 'lucide-react'
import type { Persona } from '@/types'
import { LAYOUT_MODE_LABELS } from '@/constants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'

interface UsageConversation {
  id: string
  title: string
}

interface PersonaCardProps {
  persona: Persona
  onEdit: (persona: Persona) => void
  onDelete: (persona: Persona) => void
  onManageUsage: (persona: Persona) => void
  onOpenUsageConversation: (conversationId: string, persona: Persona) => void
  usageCount?: number
  usageConversations?: UsageConversation[]
  isDeleting?: boolean
}

export function PersonaCard({
  persona,
  onEdit,
  onDelete,
  onManageUsage,
  onOpenUsageConversation,
  usageCount = 0,
  usageConversations = [],
  isDeleting = false,
}: PersonaCardProps) {
  const isInUse = usageCount > 0

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <Avatar className="h-14 w-14">
          {persona.avatar && <AvatarImage src={persona.avatar} alt={persona.name} />}
          <AvatarFallback className="text-lg">
            {persona.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <h3 className="text-base font-semibold leading-tight">{persona.name}</h3>
          <p className="line-clamp-2 text-sm text-(--color-muted-foreground)">
            {persona.description}
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {persona.personalityTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {persona.personalityTags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {persona.speakingStyle && (
          <p className="line-clamp-2 text-xs text-(--color-muted-foreground)">
            {persona.speakingStyle}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-(--color-muted-foreground)">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {LAYOUT_MODE_LABELS[persona.defaultLayoutMode]}
          </span>
          {persona.longTermMemoryEnabled && (
            <span className="inline-flex items-center gap-1">
              <Brain className="h-3.5 w-3.5" />
              <span>长期记忆</span>
            </span>
          )}
          {isInUse && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Route className="h-3 w-3" />
              {usageCount} Conversations
            </Badge>
          )}
        </div>

        {isInUse && usageConversations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-(--color-muted-foreground)">占用 Conversation 预览：</p>
            <div className="flex flex-wrap gap-1.5">
              {usageConversations.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="max-w-full rounded border border-(--color-border) px-2 py-0.5 text-[11px] text-(--color-muted-foreground) transition hover:bg-(--color-muted)"
                  title={item.title}
                  onClick={() => onOpenUsageConversation(item.id, persona)}
                >
                  <span className="block max-w-[180px] truncate">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 border-t border-(--color-border) pt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onEdit(persona)}
          disabled={isDeleting}
        >
          <Edit2 className="h-3.5 w-3.5" />
          编辑
        </Button>
        {isInUse ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onManageUsage(persona)}
          >
            <Route className="h-3.5 w-3.5" />
            去会话处理
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-(--color-destructive) hover:bg-(--color-destructive) hover:text-(--color-destructive-foreground)"
            onClick={() => onDelete(persona)}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? '删除中...' : '删除'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
