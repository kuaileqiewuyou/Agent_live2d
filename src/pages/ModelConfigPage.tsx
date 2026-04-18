import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, RefreshCw, Settings2, Wifi, WifiOff } from 'lucide-react'
import type { ModelConfig } from '@/types'
import { modelService } from '@/services'
import { useBackendHealth } from '@/hooks'
import { useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { ModelConfigCard } from '@/features/model-config/ModelConfigCard'
import { ModelConfigDialog } from '@/features/model-config/ModelConfigDialog'

function formatCheckedAt(value: string | null): string {
  if (!value) return '未检测'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ModelConfigPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null)
  const pushNotification = useNotificationStore((state) => state.push)
  const {
    isReachable,
    hasChecked,
    checking,
    lastCheckedAt,
    apiBaseUrl,
    retry,
  } = useBackendHealth()

  const backendStatus = useMemo(() => {
    if (checking) {
      return {
        label: '检查中',
        description: '正在检测后端连通性…',
        className: 'border-amber-300 bg-amber-50 text-amber-700',
        icon: Loader2,
        iconClassName: 'animate-spin',
      }
    }
    if (!hasChecked) {
      return {
        label: '未检测',
        description: '尚未完成后端健康检查',
        className: 'border-slate-300 bg-slate-50 text-slate-700',
        icon: AlertTriangle,
        iconClassName: '',
      }
    }
    if (isReachable) {
      return {
        label: '后端在线',
        description: '模型配置接口可用',
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        icon: Wifi,
        iconClassName: '',
      }
    }
    return {
      label: '后端离线',
      description: '当前无法访问模型配置接口',
      className: 'border-red-300 bg-red-50 text-red-700',
      icon: WifiOff,
      iconClassName: '',
    }
  }, [checking, hasChecked, isReachable])

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await modelService.getModelConfigs()
      setConfigs(data)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载模型配置失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setLoading(false)
    }
  }, [pushNotification])

  useEffect(() => {
    void loadConfigs()
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
    if (hasChecked && !isReachable) {
      pushNotification({
        type: 'error',
        title: '后端当前不可用',
        description: `无法删除模型配置。请先恢复后端连接（${apiBaseUrl}）。`,
      })
      return
    }

    const confirmed = confirm(`确定要删除配置“${config.name}”吗？此操作不可撤销。`)
    if (!confirmed) return

    try {
      await modelService.deleteModelConfig(config.id)
      await loadConfigs()
      pushNotification({
        type: 'success',
        title: '模型配置已删除',
        description: config.name,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '删除模型配置失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  const handleSubmit = async (
    data: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    try {
      if (editingConfig) {
        await modelService.updateModelConfig(editingConfig.id, data)
        pushNotification({
          type: 'success',
          title: '模型配置已更新',
          description: data.name,
        })
      }
      else {
        await modelService.createModelConfig(data)
        pushNotification({
          type: 'success',
          title: '模型配置已创建',
          description: data.name,
        })
      }

      setDialogOpen(false)
      await loadConfigs()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: editingConfig ? '更新模型配置失败' : '创建模型配置失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
      throw error
    }
  }

  const StatusIcon = backendStatus.icon

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-(--color-border) px-6 py-4">
        <h1 className="text-xl font-semibold">模型配置</h1>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          新建配置
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-card) px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${backendStatus.className}`}>
                <StatusIcon className={`h-3.5 w-3.5 ${backendStatus.iconClassName}`} />
                {backendStatus.label}
              </span>
              <span className="text-xs text-(--color-muted-foreground)">{backendStatus.description}</span>
            </div>
            <div className="mt-1 text-xs text-(--color-muted-foreground)">
              API: {apiBaseUrl} | 最近检查: {formatCheckedAt(lastCheckedAt)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void retry()}
            disabled={checking}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            立即重试
          </Button>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center text-(--color-muted-foreground)">
            加载中...
          </div>
        ) : configs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-(--color-muted-foreground)">
            <Settings2 className="h-12 w-12 opacity-40" />
            <p className="text-lg">暂无模型配置</p>
            <p className="text-sm">点击“新建配置”添加你的第一个 AI 模型。</p>
            <Button variant="outline" onClick={handleCreate} className="mt-2">
              <Plus className="h-4 w-4" />
              新建配置
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configs.map(config => (
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

      <ModelConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editingConfig}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
