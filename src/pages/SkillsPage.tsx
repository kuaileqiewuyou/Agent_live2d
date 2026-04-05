import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import type { Skill } from '@/types'
import { skillService } from '@/services'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { SkillCard } from '@/features/skills/SkillCard'

const SkillDetailDialog = lazy(async () => {
  const module = await import('@/features/skills/SkillDetailDialog')
  return { default: module.SkillDetailDialog }
})

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    skillService.getSkills().then(setSkills)
  }, [])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    skills.forEach(skill => skill.tags.forEach(tag => tagSet.add(tag)))
    return Array.from(tagSet)
  }, [skills])

  const filteredSkills = useMemo(() => {
    let result = skills

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(
        skill =>
          skill.name.toLowerCase().includes(query)
          || skill.description.toLowerCase().includes(query)
          || skill.tags.some(tag => tag.toLowerCase().includes(query)),
      )
    }

    if (activeTab === 'enabled') {
      result = result.filter(skill => skill.enabled)
    }
    else if (activeTab === 'disabled') {
      result = result.filter(skill => !skill.enabled)
    }
    else if (activeTab !== 'all') {
      result = result.filter(skill => skill.tags.includes(activeTab))
    }

    return result
  }, [activeTab, search, skills])

  const enabledCount = useMemo(
    () => skills.filter(skill => skill.enabled).length,
    [skills],
  )

  async function handleToggle(id: string, enabled: boolean) {
    const updated = await skillService.toggleSkill(id, enabled)
    setSkills(prev =>
      prev.map(skill => (skill.id === updated.id ? updated : skill)),
    )
    if (selectedSkill?.id === id) {
      setSelectedSkill(updated)
    }
  }

  function handleViewDetail(skill: Skill) {
    setSelectedSkill(skill)
    setDetailOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-4 px-6 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary)/10">
              <Sparkles className="h-5 w-5 text-(--color-primary)" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Skill 中心</h1>
              <p className="text-xs text-(--color-muted-foreground)">
                管理和配置 AI 助手的扩展 Skill
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="px-3 py-1 text-xs">
            已启用 {enabledCount} 个 Skill
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted-foreground)" />
          <Input
            placeholder="搜索 Skill 名称、描述或标签..."
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground)"
            >
              全部
            </TabsTrigger>
            <TabsTrigger
              value="enabled"
              className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground)"
            >
              已启用
            </TabsTrigger>
            <TabsTrigger
              value="disabled"
              className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground)"
            >
              未启用
            </TabsTrigger>
            {allTags.map(tag => (
              <TabsTrigger
                key={tag}
                value={tag}
                className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground)"
              >
                {tag}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-0" />
        </Tabs>
      </div>

      <ScrollArea className="flex-1 px-6">
        <div className="grid grid-cols-1 gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSkills.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onViewDetail={handleViewDetail}
            />
          ))}
        </div>

        {filteredSkills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-(--color-muted-foreground)">
            <Sparkles className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">没有找到匹配的 Skill</p>
          </div>
        )}
      </ScrollArea>

      {detailOpen && selectedSkill && (
        <Suspense fallback={null}>
          <SkillDetailDialog
            skill={selectedSkill}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            onToggle={handleToggle}
          />
        </Suspense>
      )}
    </div>
  )
}
