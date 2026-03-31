import {
  Globe,
  Code,
  Image,
  BookOpen,
  Languages,
  BarChart3,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { Skill } from '@/types'
import { cn } from '@/utils'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

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
        'group relative transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer',
        !skill.enabled && 'opacity-60',
      )}
      onClick={() => onViewDetail(skill)}
    >
      <CardContent className="p-5">
        {/* Icon + Toggle row */}
        <div className="flex items-start justify-between mb-3">
          <div
            className={cn(
              'flex items-center justify-center w-11 h-11 rounded-xl',
              iconColor,
            )}
          >
            <IconComponent className="w-5.5 h-5.5" />
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
          >
            <Switch
              checked={skill.enabled}
              onCheckedChange={(checked) => onToggle(skill.id, checked)}
            />
          </div>
        </div>

        {/* Name */}
        <h3 className="font-semibold text-sm mb-1.5 group-hover:text-(--color-primary) transition-colors">
          {skill.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-(--color-muted-foreground) line-clamp-2 mb-3 leading-relaxed">
          {skill.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-5 font-normal"
            >
              {tag}
            </Badge>
          ))}
        </div>

        {/* Footer: version + author + action */}
        <div className="flex items-center justify-between pt-2 border-t border-(--color-border)">
          <span className="text-[11px] text-(--color-muted-foreground)">
            v{skill.version} · {skill.author}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-(--color-primary) hover:text-(--color-primary)"
            onClick={(e) => {
              e.stopPropagation()
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
