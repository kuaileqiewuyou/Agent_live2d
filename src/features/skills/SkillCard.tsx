import {
  BarChart3,
  BookOpen,
  Code,
  Globe,
  Image,
  Languages,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { Skill } from '@/types'
import { cn } from '@/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const ICON_MAP: Record<string, LucideIcon> = {
  'mdi:web': Globe,
  'mdi:code-braces': Code,
  'mdi:image-auto-adjust': Image,
  'mdi:book-search-outline': BookOpen,
  'mdi:translate': Languages,
  'mdi:chart-bar': BarChart3,
}

const ICON_COLOR_MAP: Record<string, string> = {
  'mdi:web': 'bg-blue-500/10 text-blue-500',
  'mdi:code-braces': 'bg-emerald-500/10 text-emerald-500',
  'mdi:image-auto-adjust': 'bg-purple-500/10 text-purple-500',
  'mdi:book-search-outline': 'bg-amber-500/10 text-amber-500',
  'mdi:translate': 'bg-cyan-500/10 text-cyan-500',
  'mdi:chart-bar': 'bg-rose-500/10 text-rose-500',
}

interface SkillCardProps {
  skill: Skill
  onToggle: (id: string, enabled: boolean) => void
  onViewDetail: (skill: Skill) => void
}

export function SkillCard({ skill, onToggle, onViewDetail }: SkillCardProps) {
  const iconKey = skill.icon || ''
  const IconComponent = ICON_MAP[iconKey] || Sparkles
  const iconColor = ICON_COLOR_MAP[iconKey] || 'bg-gray-500/10 text-gray-500'

  return (
    <Card
      className={cn(
        'group relative cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        !skill.enabled && 'opacity-60',
      )}
      onClick={() => onViewDetail(skill)}
    >
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl',
              iconColor,
            )}
          >
            <IconComponent className="h-5.5 w-5.5" />
          </div>
          <div onClick={event => event.stopPropagation()}>
            <Switch
              checked={skill.enabled}
              onCheckedChange={checked => onToggle(skill.id, checked)}
            />
          </div>
        </div>

        <h3 className="mb-1.5 text-sm font-semibold transition-colors group-hover:text-(--color-primary)">
          {skill.name}
        </h3>

        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-(--color-muted-foreground)">
          {skill.description}
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {skill.tags.slice(0, 3).map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-5 px-1.5 py-0 text-[10px] font-normal"
            >
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-(--color-border) pt-2">
          <span className="text-[11px] text-(--color-muted-foreground)">
            v{skill.version} · {skill.author}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-(--color-primary) hover:text-(--color-primary)"
            onClick={(event) => {
              event.stopPropagation()
              onViewDetail(skill)
            }}
          >
            查看详情
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
