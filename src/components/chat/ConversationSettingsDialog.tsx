import { useEffect, useMemo, useState } from 'react'
import { Brain, Cable, CheckCircle2, Pin, ScrollText, Sparkles } from 'lucide-react'
import {
  conversationService,
  mcpService,
  modelService,
  personaService,
  skillService,
} from '@/services'
import { LAYOUT_MODE_LABELS } from '@/constants'
import { useConversationStore, useNotificationStore } from '@/stores'
import type {
  ChatLayoutMode,
  Conversation,
  LongTermMemory,
  MCPServer,
  ModelConfig,
  Persona,
  Skill,
  UpdateConversationInput,
} from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface MemoryActionFeedback {
  type: 'summary' | 'remember'
  title: string
  description: string
  at: string
}

interface ConversationSettingsDialogProps {
  open: boolean
  conversation: Conversation | null
  relatedMemories?: LongTermMemory[]
  memoryCount?: number
  latestUserMessagePreview?: string | null
  isSummarizingMemory?: boolean
  isSavingMemory?: boolean
  memoryFeedback?: MemoryActionFeedback | null
  onOpenChange: (open: boolean) => void
  onSaved: (conversation: Conversation) => void
  onOpenMemoryCenter?: () => void
  onSummarizeMemory?: () => void
  onRememberLatest?: () => void
  onDedupeMessages?: () => void
  isDedupingMessages?: boolean
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id)
    ? list.filter(item => item !== id)
    : [...list, id]
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ConversationSettingsDialog({
  open,
  conversation,
  relatedMemories = [],
  memoryCount = 0,
  latestUserMessagePreview,
  isSummarizingMemory = false,
  isSavingMemory = false,
  memoryFeedback = null,
  onOpenChange,
  onSaved,
  onOpenMemoryCenter,
  onSummarizeMemory,
  onRememberLatest,
  onDedupeMessages,
  isDedupingMessages = false,
}: ConversationSettingsDialogProps) {
  const pushNotification = useNotificationStore((state) => state.push)
  const setConversations = useConversationStore((state) => state.setConversations)

  const [title, setTitle] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [modelConfigId, setModelConfigId] = useState('')
  const [layoutMode, setLayoutMode] = useState<ChatLayoutMode>('chat')
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<string[]>([])
  const [pinned, setPinned] = useState(false)

  const [personas, setPersonas] = useState<Persona[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const availableSkills = useMemo(() => skills.filter(skill => skill.enabled), [skills])
  const availableMcpServers = useMemo(() => mcpServers.filter(server => server.enabled), [mcpServers])
  const visibleMemories = useMemo(() => relatedMemories.slice(0, 3), [relatedMemories])
  const canSubmit = Boolean(conversation && personaId && modelConfigId) && !isLoading

  useEffect(() => {
    if (!open || !conversation) return

    const currentConversation = conversation

    async function loadOptions() {
      try {
        setIsLoading(true)
        const [personaItems, modelItems, skillItems, mcpItems] = await Promise.all([
          personaService.getPersonas(),
          modelService.getModelConfigs(),
          skillService.getSkills(),
          mcpService.getMcpServers(),
        ])

        setPersonas(personaItems)
        setModels(modelItems)
        setSkills(skillItems)
        setMcpServers(mcpItems)
        setTitle(currentConversation.title)
        setPersonaId(currentConversation.personaId)
        setModelConfigId(currentConversation.modelConfigId)
        setLayoutMode(currentConversation.layoutMode)
        setSelectedSkillIds(currentConversation.enabledSkillIds)
        setSelectedMcpServerIds(currentConversation.enabledMcpServerIds)
        setPinned(currentConversation.pinned)
      }
      catch (error) {
        pushNotification({
          type: 'error',
          title: '加载会话设置失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
      finally {
        setIsLoading(false)
      }
    }

    void loadOptions()
  }, [conversation, open, pushNotification])

  async function handleSubmit() {
    if (!conversation || !canSubmit) return

    setIsSubmitting(true)
    try {
      const payload: UpdateConversationInput = {
        title: title.trim() || conversation.title,
        personaId,
        modelConfigId,
        layoutMode,
        enabledSkillIds: selectedSkillIds,
        enabledMcpServerIds: selectedMcpServerIds,
        pinned,
      }

      const updatedConversation = await conversationService.updateConversation(conversation.id, payload)
      const conversations = await conversationService.getConversations()
      setConversations(conversations)
      onSaved(updatedConversation)
      onOpenChange(false)
      pushNotification({
        type: 'success',
        title: '会话设置已更新',
        description: updatedConversation.title,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '保存会话设置失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>会话设置</DialogTitle>
          <DialogDescription>
            调整当前会话绑定的人设、模型、Skill、MCP 服务，并直接操作记忆能力。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)]">
          <div className="space-y-5 px-6 pb-2">
            <div className="space-y-2">
              <Label htmlFor="conversation-settings-title">会话标题</Label>
              <Input
                id="conversation-settings-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="输入会话标题"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>人设</Label>
                <Select value={personaId} onValueChange={setPersonaId}>
                  <SelectTrigger>
                    <SelectValue placeholder={personas.length ? '选择人设' : '请先创建人设'} />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map(persona => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>模型配置</Label>
                <Select value={modelConfigId} onValueChange={setModelConfigId}>
                  <SelectTrigger>
                    <SelectValue placeholder={models.length ? '选择模型配置' : '请先创建模型配置'} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>布局模式</Label>
                <Select value={layoutMode} onValueChange={(value: ChatLayoutMode) => setLayoutMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LAYOUT_MODE_LABELS) as [ChatLayoutMode, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-card) px-4 py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pin className="h-4 w-4 text-(--color-primary)" />
                    置顶当前会话
                  </div>
                  <p className="text-xs text-(--color-muted-foreground)">
                    置顶后会优先显示在左侧会话列表顶部。
                  </p>
                </div>
                <Switch checked={pinned} onCheckedChange={setPinned} />
              </div>
            </div>

            <div className="rounded-xl border border-(--color-border) bg-(--color-card) p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4 text-(--color-primary)" />
                    会话记忆
                  </div>
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    这里会显示当前会话已关联的长期记忆，并提供常用的记忆操作。
                  </p>
                </div>
                <Badge variant="secondary">{memoryCount} 条关联记忆</Badge>
              </div>

              {memoryFeedback && (
                <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {memoryFeedback.title}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-(--color-muted-foreground)">
                    {memoryFeedback.description}
                  </div>
                  <div className="mt-1 text-[11px] text-(--color-muted-foreground)">
                    最近更新：{formatDateTime(memoryFeedback.at)}
                  </div>
                </div>
              )}

              <div className="mb-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={onOpenMemoryCenter} disabled={!onOpenMemoryCenter}>
                  查看全部记忆
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onSummarizeMemory}
                  disabled={!onSummarizeMemory || isSummarizingMemory}
                >
                  <ScrollText className="mr-1 h-3.5 w-3.5" />
                  {isSummarizingMemory ? '生成摘要中...' : '为当前会话生成摘要'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onRememberLatest}
                  disabled={!onRememberLatest || isSavingMemory || !latestUserMessagePreview}
                >
                  <Brain className="mr-1 h-3.5 w-3.5" />
                  {isSavingMemory ? '写入记忆中...' : '记住最近一条用户消息'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="conversation-dedupe-btn"
                  onClick={onDedupeMessages}
                  disabled={!onDedupeMessages || isDedupingMessages}
                >
                  {isDedupingMessages ? '清理中...' : '清理重复回合'}
                </Button>
              </div>

              <div className="mb-3 rounded-lg border border-dashed border-(--color-border) px-3 py-3 text-xs text-(--color-muted-foreground)">
                {latestUserMessagePreview
                  ? `最近一条用户消息：${latestUserMessagePreview}`
                  : '当前会话还没有用户消息，暂时无法手动写入长期记忆。'}
              </div>

              {visibleMemories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-(--color-border) px-3 py-5 text-center text-xs text-(--color-muted-foreground)">
                  当前还没有可展示的关联记忆。
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleMemories.map(memory => (
                    <div key={memory.id} className="rounded-lg border border-(--color-border) p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{memory.memoryScope}</Badge>
                        {memory.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline">#{tag}</Badge>
                        ))}
                        <span className="text-[11px] text-(--color-muted-foreground)">
                          {formatDateTime(memory.updatedAt)}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-xs leading-5 text-(--color-muted-foreground)">
                        {memory.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">启用 Skill</Label>
                  <p className="text-xs text-(--color-muted-foreground)">
                    这里只显示全局已启用的 Skill，你可以按会话继续筛选。
                  </p>
                </div>
                <Badge variant="secondary">{selectedSkillIds.length} 个已选择</Badge>
              </div>
              {availableSkills.length === 0 ? (
                <p className="text-sm text-(--color-muted-foreground)">当前没有可用 Skill，请先在 Skill 页面启用。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableSkills.map(skill => {
                    const selected = selectedSkillIds.includes(skill.id)
                    return (
                      <Button
                        key={skill.id}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setSelectedSkillIds(current => toggleId(current, skill.id))}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {skill.name}
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">启用 MCP 服务</Label>
                  <p className="text-xs text-(--color-muted-foreground)">
                    这里只显示全局已启用的 MCP 服务，你可以按会话继续筛选。
                  </p>
                </div>
                <Badge variant="secondary">{selectedMcpServerIds.length} 个已选择</Badge>
              </div>
              {availableMcpServers.length === 0 ? (
                <p className="text-sm text-(--color-muted-foreground)">当前没有可用 MCP 服务，请先在 MCP 页面启用。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableMcpServers.map(server => {
                    const selected = selectedMcpServerIds.includes(server.id)
                    return (
                      <Button
                        key={server.id}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="gap-2"
                        onClick={() => setSelectedMcpServerIds(current => toggleId(current, server.id))}
                      >
                        <Cable className="h-3.5 w-3.5" />
                        {server.name}
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>

            {isLoading && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-card) px-4 py-3 text-sm text-(--color-muted-foreground)">
                正在加载会话设置...
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 pb-6 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? '保存中...' : '保存设置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
