import { useState, useEffect, useCallback } from 'react'
import type { ModelConfig } from '@/types'
import { modelService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { ModelConfigCard } from '@/features/model-config/ModelConfigCard'
import { ModelConfigDialog } from '@/features/model-config/ModelConfigDialog'
import { Plus, Settings2 } from 'lucide-react'

export function ModelConfigPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null)
  const pushNotification = useNotificationStore((state) => state.push)

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await modelService.getModelConfigs()
      setConfigs(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleCreate = () => {
    setEditingConfig(null)
    setDialogOpen(true)
  }

  const handleEdit = (config: ModelConfig) => {
    setEditingConfig(config)
    setDialogOpen(true)
  }

  const handleDelete = async (config: ModelConfig) => {
    if (
      !confirm(`确定要删除配置「${config.name}」吗？此操作不可撤销。`)
    ) {
      return
    }
    try {
      await modelService.deleteModelConfig(config.id)
      await loadConfigs()
      pushNotification({ type: 'success', title: '模型配置已删除', description: config.name })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '删除模型配置失败',
        description: error instanceof Error ? error.message : '请稍后再试',
      })
    }
  }

  const handleSubmit = async (
    data: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    try {
      if (editingConfig) {
        await modelService.updateModelConfig(editingConfig.id, data)
        pushNotification({ type: 'success', title: '模型配置已更新', description: data.name })
      }
      else {
        await modelService.createModelConfig(data)
        pushNotification({ type: 'success', title: '模型配置已创建', description: data.name })
      }
      await loadConfigs()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: editingConfig ? '更新模型配置失败' : '创建模型配置失败',
        description: error instanceof Error ? error.message : '请稍后再试',
      })
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-(--color-border)">
        <h1 className="text-xl font-semibold">模型配置</h1>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新建配置
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-(--color-muted-foreground)">
            加载中...
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-(--color-muted-foreground) gap-3">
            <Settings2 className="h-12 w-12 opacity-40" />
            <p className="text-lg">暂无模型配置</p>
            <p className="text-sm">
              点击「新建配置」添加你的第一个 AI 模型
            </p>
            <Button variant="outline" onClick={handleCreate} className="mt-2">
              <Plus className="h-4 w-4" />
              新建配置
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {configs.map((config) => (
              <ModelConfigCard
                key={config.id}
                config={config}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <ModelConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editingConfig}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
