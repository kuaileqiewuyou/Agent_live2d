import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Sparkles, Trash2 } from 'lucide-react'
import type { Skill } from '@/types'
import { skillService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BackendHealthStatus } from '@/components/common/BackendHealthStatus'
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
  const pushNotification = useNotificationStore((state) => state.push)
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [isCleaning, setIsCleaning] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSkills() {
      try {
        const items = await skillService.getSkills()
        if (!cancelled) {
          setSkills(items)
        }
      }
      catch (error) {
        if (!cancelled) {
          pushNotification({
            type: 'error',
            title: '加载 Skill 列表失败',
            description: error instanceof Error ? error.message : '请稍后重试。',
          })
        }
      }
    }

    void loadSkills()

    return () => {
      cancelled = true
    }
  }, [pushNotification])

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

  const testSkillCount = useMemo(
    () => skills.filter(isTestSkill).length,
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

  async function handleCleanupTestSkills() {
    const testSkills = skills.filter(isTestSkill)
    if (testSkills.length === 0) {
      pushNotification({
        type: 'info',
        title: '没有可清理的测试 Skill',
        description: '当前列表中未发现带 e2e 标记的测试 Skill。',
      })
      return
    }

    const confirmed = window.confirm(`将删除 ${testSkills.length} 个测试 Skill（e2e），此操作不可恢复，是否继续？`)
    if (!confirmed) return

    setIsCleaning(true)
    try {
      await Promise.all(testSkills.map(skill => skillService.deleteSkill(skill.id)))
      const next = await skillService.getSkills()
      setSkills(next)
      if (selectedSkill && isTestSkill(selectedSkill)) {
        setSelectedSkill(null)
        setDetailOpen(false)
      }
      pushNotification({
        type: 'success',
        title: '测试 Skill 已清理',
        description: `已删除 ${testSkills.length} 个测试 Skill。`,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '清理测试 Skill 失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setIsCleaning(false)
    }
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
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 text-xs">
              已启用 {enabledCount} 个 Skill
            </Badge>
            <Button
              data-testid="cleanup-test-skills-btn"
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => void handleCleanupTestSkills()}
              disabled={isCleaning || testSkillCount === 0}
            >
              {isCleaning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  清理中...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  清理测试 Skill（{testSkillCount}）
                </>
              )}
            </Button>
          </div>
        </div>

        <BackendHealthStatus />

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

function isTestSkill(skill: Skill): boolean {
  const name = skill.name.toLowerCase()
  const description = skill.description.toLowerCase()
  const hasE2ETag = skill.tags.some(tag => tag.toLowerCase() === 'e2e')
  return hasE2ETag || name.includes('e2e') || description.includes('e2e')
}
