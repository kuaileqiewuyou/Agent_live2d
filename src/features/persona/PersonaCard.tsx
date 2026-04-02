import { Brain, Edit2, MessageSquare, Trash2 } from 'lucide-react'
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

interface PersonaCardProps {
  persona: Persona
  onEdit: (persona: Persona) => void
  onDelete: (persona: Persona) => void
}

export function PersonaCard({ persona, onEdit, onDelete }: PersonaCardProps) {
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
        </div>
      </CardContent>

      <CardFooter className="gap-2 border-t border-(--color-border) pt-4">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(persona)}>
          <Edit2 className="h-3.5 w-3.5" />
          编辑
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-(--color-destructive) hover:bg-(--color-destructive) hover:text-(--color-destructive-foreground)"
          onClick={() => onDelete(persona)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </Button>
      </CardFooter>
    </Card>
  )
}
