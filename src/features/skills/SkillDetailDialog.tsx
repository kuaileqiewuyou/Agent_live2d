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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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

const SCOPE_LABELS: Record<string, string> = {
  conversation: '对话',
  agent: '智能体',
}

interface SkillDetailDialogProps {
  skill: Skill | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (id: string, enabled: boolean) => void
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  onToggle,
}: SkillDetailDialogProps) {
  if (!skill) return null

  const iconKey = skill.icon || ''
  const IconComponent = ICON_MAP[iconKey] || Sparkles
  const iconColor = ICON_COLOR_MAP[iconKey] || 'bg-gray-500/10 text-gray-500'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-xl',
                iconColor,
              )}
            >
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-base">{skill.name}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                v{skill.version} · {skill.author}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description */}
          <div>
            <Label className="text-xs text-(--color-muted-foreground) mb-1.5 block">
              描述
            </Label>
            <p className="text-sm leading-relaxed">{skill.description}</p>
          </div>

          <Separator />

          {/* Summary */}
          <div>
            <Label className="text-xs text-(--color-muted-foreground) mb-1.5 block">
              说明
            </Label>
            <p className="text-sm leading-relaxed">{skill.summary}</p>
          </div>

          <Separator />

          {/* Tags */}
          <div>
            <Label className="text-xs text-(--color-muted-foreground) mb-1.5 block">
              标签
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Scope */}
          <div>
            <Label className="text-xs text-(--color-muted-foreground) mb-1.5 block">
              适用范围
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {skill.scope.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {SCOPE_LABELS[s] || s}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">启用技能</Label>
              <p className="text-xs text-(--color-muted-foreground)">
                {skill.enabled ? '该技能已启用' : '该技能已停用'}
              </p>
            </div>
            <Switch
              checked={skill.enabled}
              onCheckedChange={(checked) => onToggle(skill.id, checked)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
