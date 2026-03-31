import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChatLayoutMode, ModelConfig, Persona } from '@/types'
import { conversationService, modelService, personaService } from '@/services'
import { useConversationStore, useSettingsStore, useUIStore } from '@/stores'
import { LAYOUT_MODE_LABELS } from '@/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function NewConversationDialog() {
  const navigate = useNavigate()
  const { showNewConversationDialog, setShowNewConversationDialog } = useUIStore()
  const { settings } = useSettingsStore()
  const { setConversations } = useConversationStore()
  const [title, setTitle] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [personaId, setPersonaId] = useState('')
  const [modelConfigId, setModelConfigId] = useState('')
  const [layoutMode, setLayoutMode] = useState<ChatLayoutMode>(settings.defaultLayoutMode)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canCreate = useMemo(() => personaId && modelConfigId, [modelConfigId, personaId])

  useEffect(() => {
    if (!showNewConversationDialog)
      return

    async function loadOptions() {
      const [personaItems, modelItems] = await Promise.all([
        personaService.getPersonas(),
        modelService.getModelConfigs(),
      ])
      setPersonas(personaItems)
      setModels(modelItems)
      setPersonaId(prev => prev || personaItems[0]?.id || '')
      const defaultModel = modelItems.find(item => item.isDefault) || modelItems[0]
      setModelConfigId(prev => prev || defaultModel?.id || '')
      setLayoutMode(settings.defaultLayoutMode)
      setTitle('')
    }

    void loadOptions()
  }, [settings.defaultLayoutMode, showNewConversationDialog])

  async function handleSubmit() {
    if (!canCreate)
      return

    setIsSubmitting(true)
    try {
      const selectedPersona = personas.find(item => item.id === personaId)
      const conversation = await conversationService.createConversation({
        title: title.trim() || `${selectedPersona?.name || '新会话'}的对话`,
        personaId,
        modelConfigId,
        layoutMode,
        enabledSkillIds: [],
        enabledMcpServerIds: [],
        pinned: false,
      })
      const conversations = await conversationService.getConversations()
      setConversations(conversations)
      setShowNewConversationDialog(false)
      navigate(`/chat/${conversation.id}`)
    }
    finally {
      setIsSubmitting(false)
    }
  }

  const missingDependencies = personas.length === 0 || models.length === 0

  return (
    <Dialog open={showNewConversationDialog} onOpenChange={setShowNewConversationDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建会话</DialogTitle>
          <DialogDescription>选择一个人设和模型配置，立即开始新的本地对话。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conversation-title">标题</Label>
            <Input
              id="conversation-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="留空则自动生成标题"
            />
          </div>

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

          {missingDependencies && (
            <p className="text-sm text-(--color-muted-foreground)">
              需要先至少创建 1 个人设和 1 个模型配置，才能开始真实会话。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewConversationDialog(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canCreate || isSubmitting}>
            {isSubmitting ? '创建中...' : '创建会话'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
