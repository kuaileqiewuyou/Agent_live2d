import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import type { Conversation, Persona } from '@/types'
import { conversationService, personaService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { PersonaCard } from '@/features/persona/PersonaCard'
import { PersonaDialog } from '@/features/persona/PersonaDialog'

interface UsageConversationPreview {
  id: string
  title: string
}

function isPersonaDeleteConflict(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('Persona is used by')
}

function buildPersonaUsageDetails(personas: Persona[], conversations: Conversation[]) {
  const countMap: Record<string, number> = {}
  const conversationMap: Record<string, UsageConversationPreview[]> = {}

  for (const persona of personas) {
    countMap[persona.id] = 0
    conversationMap[persona.id] = []
  }

  for (const conversation of conversations) {
    const personaId = conversation.personaId
    if (!personaId) {
      continue
    }

    countMap[personaId] = (countMap[personaId] || 0) + 1

    const previews = conversationMap[personaId] || []
    if (
      conversation.title
      && previews.length < 2
      && !previews.some(item => item.id === conversation.id)
    ) {
      previews.push({
        id: conversation.id,
        title: conversation.title,
      })
      conversationMap[personaId] = previews
    }
  }

  return { countMap, conversationMap }
}

function navigateToPersonaConversations(
  navigate: ReturnType<typeof useNavigate>,
  persona: Persona,
) {
  const params = new URLSearchParams({
    personaId: persona.id,
    personaName: persona.name,
  })
  navigate(`/chat?${params.toString()}`)
}

export function PersonaPage() {
  const navigate = useNavigate()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaUsageMap, setPersonaUsageMap] = useState<Record<string, number>>({})
  const [personaUsageConversationsMap, setPersonaUsageConversationsMap]
    = useState<Record<string, UsageConversationPreview[]>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null)
  const pushNotification = useNotificationStore((state) => state.push)

  const loadPersonas = useCallback(async () => {
    try {
      setLoading(true)
      const [personaItems, conversations] = await Promise.all([
        personaService.getPersonas(),
        conversationService.getConversations(),
      ])

      const usage = buildPersonaUsageDetails(personaItems, conversations)
      setPersonas(personaItems)
      setPersonaUsageMap(usage.countMap)
      setPersonaUsageConversationsMap(usage.conversationMap)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载 Persona 失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setLoading(false)
    }
  }, [pushNotification])

  useEffect(() => {
    void loadPersonas()
  }, [loadPersonas])

  const handleCreate = () => {
    setEditingPersona(null)
    setDialogOpen(true)
  }

  const handleEdit = (persona: Persona) => {
    setEditingPersona(persona)
    setDialogOpen(true)
  }

  const handleManageUsage = (persona: Persona) => {
    navigateToPersonaConversations(navigate, persona)
  }

  const handleOpenUsageConversation = (conversationId: string, persona: Persona) => {
    const params = new URLSearchParams({
      personaId: persona.id,
      personaName: persona.name,
    })
    navigate(`/chat/${conversationId}?${params.toString()}`)
  }

  const handleDelete = async (persona: Persona) => {
    if (deletingPersonaId === persona.id) {
      return
    }

    const usageCount = personaUsageMap[persona.id] || 0
    const usageConversations = personaUsageConversationsMap[persona.id] || []
    const usageTitles = usageConversations.map(item => item.title)

    if (usageCount > 0) {
      const titlePreview
        = usageTitles.length > 0 ? `（例如：${usageTitles.join(' / ')}）` : ''
      pushNotification({
        type: 'error',
        title: '删除 Persona 失败',
        description: `${persona.name} 当前被 ${usageCount} 个会话使用${titlePreview}`,
        action: {
          label: '去会话处理',
          onClick: () => navigateToPersonaConversations(navigate, persona),
        },
      })
      return
    }

    if (!confirm(`确定要删除 Persona「${persona.name}」吗？此操作不可撤销。`)) {
      return
    }

    try {
      setDeletingPersonaId(persona.id)
      await personaService.deletePersona(persona.id)
      await loadPersonas()
      pushNotification({
        type: 'success',
        title: 'Persona 已删除',
        description: persona.name,
      })
    }
    catch (error) {
      if (isPersonaDeleteConflict(error)) {
        pushNotification({
          type: 'error',
          title: '删除 Persona 失败',
          description: error.message,
          action: {
            label: '去会话处理',
            onClick: () => navigateToPersonaConversations(navigate, persona),
          },
        })
      }
      else {
        pushNotification({
          type: 'error',
          title: '删除 Persona 失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
        })
      }
    }
    finally {
      setDeletingPersonaId(null)
    }
  }

  const handleSubmit = async (
    data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    try {
      if (editingPersona) {
        await personaService.updatePersona(editingPersona.id, data)
        pushNotification({
          type: 'success',
          title: 'Persona 已更新',
          description: data.name,
        })
      }
      else {
        await personaService.createPersona(data)
        pushNotification({
          type: 'success',
          title: 'Persona 已创建',
          description: data.name,
        })
      }

      setDialogOpen(false)
      await loadPersonas()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: editingPersona ? '更新 Persona 失败' : '创建 Persona 失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
      throw error
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-(--color-border) px-6 py-4">
        <h1 className="text-xl font-semibold">人设管理</h1>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新建 Persona
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-(--color-muted-foreground)">
            加载中...
          </div>
        ) : personas.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-(--color-muted-foreground)">
            <Users className="h-12 w-12 opacity-40" />
            <p className="text-lg">暂无 Persona</p>
            <p className="text-sm">点击“新建 Persona”创建你的第一个角色。</p>
            <Button variant="outline" onClick={handleCreate} className="mt-2">
              <Plus className="h-4 w-4" />
              新建 Persona
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {personas.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                usageCount={personaUsageMap[persona.id] || 0}
                usageConversations={personaUsageConversationsMap[persona.id] || []}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onManageUsage={handleManageUsage}
                onOpenUsageConversation={handleOpenUsageConversation}
                isDeleting={deletingPersonaId === persona.id}
              />
            ))}
          </div>
        )}
      </div>

      <PersonaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        persona={editingPersona}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
