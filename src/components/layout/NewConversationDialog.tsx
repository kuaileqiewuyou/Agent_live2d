import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Cable, Sparkles } from 'lucide-react'
import type { ChatLayoutMode, MCPServer, ModelConfig, Persona, Skill } from '@/types'
import {
  conversationService,
  mcpService,
  modelService,
  personaService,
  skillService,
} from '@/services'
import {
  useConversationStore,
  useNotificationStore,
  useSettingsStore,
  useUIStore,
} from '@/stores'
import { LAYOUT_MODE_LABELS } from '@/constants'
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

function toggleId(list: string[], id: string): string[] {
  return list.includes(id)
    ? list.filter(item => item !== id)
    : [...list, id]
}

export function NewConversationDialog() {
  const navigate = useNavigate()
  const pushNotification = useNotificationStore((state) => state.push)
  const { showNewConversationDialog, setShowNewConversationDialog } = useUIStore()
  const { settings } = useSettingsStore()
  const { setConversations } = useConversationStore()

  const [title, setTitle] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [personaId, setPersonaId] = useState('')
  const [modelConfigId, setModelConfigId] = useState('')
  const [layoutMode, setLayoutMode] = useState<ChatLayoutMode>(settings.defaultLayoutMode)
  const [inheritPersonaLongTermMemory, setInheritPersonaLongTermMemory] = useState(true)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)

  const availableSkills = useMemo(
    () => skills.filter(skill => skill.enabled),
    [skills],
  )
  const availableMcpServers = useMemo(
    () => mcpServers.filter(server => server.enabled),
    [mcpServers],
  )
  const canCreate = useMemo(
    () => Boolean(personaId && modelConfigId) && !isLoadingOptions,
    [isLoadingOptions, modelConfigId, personaId],
  )

  useEffect(() => {
    if (!showNewConversationDialog) {
      return
    }

    async function loadOptions() {
      try {
        setIsLoadingOptions(true)
        const [personaItems, modelItems, skillItems, mcpItems] = await Promise.all([
          personaService.getPersonas(),
          modelService.getModelConfigs(),
          skillService.getSkills(),
          mcpService.getMcpServers(),
        ])

        const enabledSkills = skillItems.filter(skill => skill.enabled)
        const enabledMcp = mcpItems.filter(server => server.enabled)
        const defaultModel = modelItems.find(item => item.isDefault) || modelItems[0]
        const defaultPersona = personaItems[0]

        setPersonas(personaItems)
        setModels(modelItems)
        setSkills(skillItems)
        setMcpServers(mcpItems)
        setPersonaId(defaultPersona?.id || '')
        setModelConfigId(defaultModel?.id || '')
        setLayoutMode(defaultPersona?.defaultLayoutMode || settings.defaultLayoutMode)
        setSelectedSkillIds(enabledSkills.map(skill => skill.id))
        setSelectedMcpServerIds(enabledMcp.map(server => server.id))
        setInheritPersonaLongTermMemory(defaultPersona?.longTermMemoryEnabled ?? true)
        setTitle('')
      }
      catch (error) {
        pushNotification({
          type: 'error',
          title: '加载会话创建选项失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
      finally {
        setIsLoadingOptions(false)
      }
    }

    void loadOptions()
  }, [pushNotification, settings.defaultLayoutMode, showNewConversationDialog])

  useEffect(() => {
    const selectedPersona = personas.find(persona => persona.id === personaId)
    if (!selectedPersona) {
      return
    }

    setInheritPersonaLongTermMemory(selectedPersona.longTermMemoryEnabled)
    setLayoutMode(selectedPersona.defaultLayoutMode || settings.defaultLayoutMode)
  }, [personaId, personas, settings.defaultLayoutMode])

  async function handleSubmit() {
    if (!canCreate) {
      return
    }

    setIsSubmitting(true)
    try {
      const selectedPersona = personas.find(item => item.id === personaId)
      const conversation = await conversationService.createConversation({
        title: title.trim() || `${selectedPersona?.name || '新会话'} 的对话`,
        personaId,
        modelConfigId,
        layoutMode,
        enabledSkillIds: selectedSkillIds,
        enabledMcpServerIds: selectedMcpServerIds,
        pinned: false,
        inheritPersonaLongTermMemory,
      })

      const conversations = await conversationService.getConversations()
      setConversations(conversations)
      setShowNewConversationDialog(false)
      navigate(`/chat/${conversation.id}`)
      pushNotification({
        type: 'success',
        title: '会话已创建',
        description: conversation.title,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '创建会话失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSubmitting(false)
    }
  }

  function closeDialog() {
    setShowNewConversationDialog(false)
  }

  const missingDependencies = personas.length === 0 || models.length === 0

  return (
    <Dialog open={showNewConversationDialog} onOpenChange={setShowNewConversationDialog}>
      <DialogContent className="max-h-[90vh] max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>新建会话</DialogTitle>
          <DialogDescription>
            选择人设、模型、Skill 和 MCP 服务，创建一条真实对话链路。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)]">
          <div className="space-y-5 px-6 pb-2">
            <div className="space-y-2">
              <Label htmlFor="conversation-title">标题</Label>
              <Input
                id="conversation-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="留空则自动生成人设相关标题"
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
                  <Brain className="h-4 w-4 text-(--color-primary)" />
                  继承人设长期记忆
                </div>
                <p className="text-xs text-(--color-muted-foreground)">
                  新会话默认不继承短期上下文，但可以注入该人设的长期记忆。
                </p>
              </div>
              <Switch
                checked={inheritPersonaLongTermMemory}
                onCheckedChange={setInheritPersonaLongTermMemory}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">启用 Skill</Label>
                  <p className="text-xs text-(--color-muted-foreground)">
                    仅显示全局已启用的 Skill，可以按会话维度再次筛选。
                  </p>
                </div>
                <Badge variant="secondary">{selectedSkillIds.length} 个已选择</Badge>
              </div>
              {availableSkills.length === 0 ? (
                <p className="text-sm text-(--color-muted-foreground)">
                  当前没有可用 Skill，稍后可在 Skill 页面启用。
                </p>
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
                    仅显示全局已启用的 MCP 服务，会话里可以自由裁剪。
                  </p>
                </div>
                <Badge variant="secondary">{selectedMcpServerIds.length} 个已选择</Badge>
              </div>
              {availableMcpServers.length === 0 ? (
                <p className="text-sm text-(--color-muted-foreground)">
                  当前没有可用 MCP 服务，稍后可在 MCP 页面启用。
                </p>
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

            {missingDependencies && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                需要先至少创建 1 个人设和 1 个模型配置，才能开始真实会话。
              </div>
            )}

            {isLoadingOptions && (
              <div className="rounded-xl border border-(--color-border) bg-(--color-card) px-4 py-3 text-sm text-(--color-muted-foreground)">
                正在加载可选项...
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 pb-6 pt-2">
          <Button variant="outline" onClick={closeDialog}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canCreate || isSubmitting}>
            {isSubmitting ? '创建中...' : '创建会话'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
