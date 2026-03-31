import { useState, useEffect, useMemo } from 'react'
import { Search, Sparkles } from 'lucide-react'
import type { Skill } from '@/types'
import { skillService } from '@/services'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkillCard } from '@/features/skills/SkillCard'
import { SkillDetailDialog } from '@/features/skills/SkillDetailDialog'

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    skillService.getSkills().then(setSkills)
  }, [])

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    skills.forEach((s) => s.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet)
  }, [skills])

  // Filter skills
  const filteredSkills = useMemo(() => {
    let result = skills

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    // Tab filter
    if (activeTab === 'enabled') {
      result = result.filter((s) => s.enabled)
    } else if (activeTab === 'disabled') {
      result = result.filter((s) => !s.enabled)
    } else if (activeTab !== 'all') {
      // Tag filter
      result = result.filter((s) => s.tags.includes(activeTab))
    }

    return result
  }, [skills, search, activeTab])

  const enabledCount = useMemo(
    () => skills.filter((s) => s.enabled).length,
    [skills],
  )

  async function handleToggle(id: string, enabled: boolean) {
    const updated = await skillService.toggleSkill(id, enabled)
    setSkills((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s)),
    )
    // Update selected skill if it's the one being toggled
    if (selectedSkill?.id === id) {
      setSelectedSkill(updated)
    }
  }

  function handleViewDetail(skill: Skill) {
    setSelectedSkill(skill)
    setDetailOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--color-primary)/10">
              <Sparkles className="w-5 h-5 text-(--color-primary)" />
            </div>
            <div>
              <h1 className="text-xl font-bold">技能中心</h1>
              <p className="text-xs text-(--color-muted-foreground)">
                管理和配置 AI 助手的扩展技能
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs px-3 py-1">
            已启用 {enabledCount} 个技能
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--color-muted-foreground)" />
          <Input
            placeholder="搜索技能名称、描述或标签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground) rounded-full px-3 h-7 text-xs"
            >
              全部
            </TabsTrigger>
            <TabsTrigger
              value="enabled"
              className="data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground) rounded-full px-3 h-7 text-xs"
            >
              已启用
            </TabsTrigger>
            <TabsTrigger
              value="disabled"
              className="data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground) rounded-full px-3 h-7 text-xs"
            >
              未启用
            </TabsTrigger>
            {allTags.map((tag) => (
              <TabsTrigger
                key={tag}
                value={tag}
                className="data-[state=active]:bg-(--color-primary) data-[state=active]:text-(--color-primary-foreground) rounded-full px-3 h-7 text-xs"
              >
                {tag}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-0" />
        </Tabs>
      </div>

      {/* Skill Grid */}
      <ScrollArea className="flex-1 px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
          {filteredSkills.map((skill) => (
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
            <Sparkles className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">没有找到匹配的技能</p>
          </div>
        )}
      </ScrollArea>

      {/* Skill Detail Dialog */}
      <SkillDetailDialog
        skill={selectedSkill}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onToggle={handleToggle}
      />
    </div>
  )
}
