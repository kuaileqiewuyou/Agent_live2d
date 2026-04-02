import { useCallback, useEffect, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import type { Persona } from '@/types'
import { personaService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { PersonaCard } from '@/features/persona/PersonaCard'
import { PersonaDialog } from '@/features/persona/PersonaDialog'

export function PersonaPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const pushNotification = useNotificationStore((state) => state.push)

  const loadPersonas = useCallback(async () => {
    try {
      setLoading(true)
      const data = await personaService.getPersonas()
      setPersonas(data)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载人设失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
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

  const handleDelete = async (persona: Persona) => {
    if (!confirm(`确定要删除人设“${persona.name}”吗？此操作不可撤销。`)) {
      return
    }

    try {
      await personaService.deletePersona(persona.id)
      await loadPersonas()
      pushNotification({
        type: 'success',
        title: '人设已删除',
        description: persona.name,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '删除人设失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
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
          title: '人设已更新',
          description: data.name,
        })
      }
      else {
        await personaService.createPersona(data)
        pushNotification({
          type: 'success',
          title: '人设已创建',
          description: data.name,
        })
      }

      setDialogOpen(false)
      await loadPersonas()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: editingPersona ? '更新人设失败' : '创建人设失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
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
          新建人设
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
            <p className="text-lg">暂无人设</p>
            <p className="text-sm">点击“新建人设”创建你的第一个 AI 角色。</p>
            <Button variant="outline" onClick={handleCreate} className="mt-2">
              <Plus className="h-4 w-4" />
              新建人设
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {personas.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                onEdit={handleEdit}
                onDelete={handleDelete}
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
