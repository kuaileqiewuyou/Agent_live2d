import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Drama, FolderOpen, Plus, Trash2 } from 'lucide-react'
import type { Live2DModel } from '@/types'
import { useSettingsStore, useNotificationStore, useFileAccessRequestStore } from '@/stores'
import { settingsService } from '@/services'
import { generateId } from '@/utils'
import {
  pickLive2DModelFile,
  isDesktopRuntime,
  isModel3JsonPath,
  validateLive2DModelPath,
} from '@/utils/live2d-file'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function Live2DModelsPage() {
  const [searchParams] = useSearchParams()
  const { settings, setSettings } = useSettingsStore()
  const pushNotification = useNotificationStore((state) => state.push)
  const requestFileAccess = useFileAccessRequestStore((state) => state.requestAccess)
  const models = settings.live2dModels || []
  const [manualPath, setManualPath] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const modelNodeMapRef = useRef<Record<string, HTMLDivElement | null>>({})
  const focusPath = useMemo(() => searchParams.get('focus')?.trim() || '', [searchParams])

  const saveModels = useCallback(async (nextModels: Live2DModel[]) => {
    const nextSettings = { ...settings, live2dModels: nextModels }
    setSettings(nextSettings)
    try {
      await settingsService.updateSettings(nextSettings)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '保存失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }, [settings, setSettings, pushNotification])

  const appendModel = useCallback(async (name: string, path: string) => {
    if (models.some(m => m.path === path)) {
      pushNotification({ type: 'info', title: '模型已存在', description: path })
      return
    }

    setIsValidating(true)
    const result = await validateLive2DModelPath(path)
    setIsValidating(false)

    if (!result.valid) {
      if (result.forbiddenPath) {
        requestFileAccess({
          ...result.forbiddenPath,
          source: 'live2d',
        })
      }
      pushNotification({
        type: 'error',
        title: '模型预检失败',
        description: result.message || '模型路径不可用。',
      })
      return
    }

    if (result.warnings.length > 0) {
      pushNotification({
        type: 'info',
        title: '模型预检提示',
        description: result.warnings[0],
      })
    }

    const newModel: Live2DModel = {
      id: generateId(),
      name,
      path,
    }
    await saveModels([...models, newModel])
    pushNotification({ type: 'success', title: '模型已添加', description: `${name}（已预检 ${result.checkedFiles} 个文件）` })
  }, [models, pushNotification, saveModels])

  const handlePickFile = useCallback(async () => {
    const picked = await pickLive2DModelFile()
    if (!picked) return

    if (!isModel3JsonPath(picked.path)) {
      pushNotification({
        type: 'error',
        title: '文件格式不正确',
        description: '请选择 .model3.json 作为模型入口文件。',
      })
      return
    }

    await appendModel(picked.name, picked.path)
  }, [appendModel, pushNotification])

  const handleAddManual = useCallback(async () => {
    const trimmed = manualPath.trim()
    if (!trimmed) return

    if (!isModel3JsonPath(trimmed)) {
      pushNotification({
        type: 'error',
        title: '路径格式不正确',
        description: '请填写以 .model3.json 结尾的文件路径或 URL。',
      })
      return
    }

    const segments = trimmed.replace(/\\/g, '/').split('/')
    const dirName = segments[segments.length - 2] || ''
    const fileName = segments[segments.length - 1] || ''
    const displayName = dirName || fileName.replace(/\.model3\.json$/i, '') || '未命名模型'

    await appendModel(displayName, trimmed)
    setManualPath('')
  }, [appendModel, manualPath, pushNotification])

  const handleDelete = useCallback(async (model: Live2DModel) => {
    if (!confirm(`确定要移除「${model.name}」吗？这不会删除模型文件。`)) return
    await saveModels(models.filter(m => m.id !== model.id))
    pushNotification({ type: 'success', title: '模型已移除', description: model.name })
  }, [models, pushNotification, saveModels])

  const handleRename = useCallback(async (model: Live2DModel, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === model.name) return
    await saveModels(models.map(m => (m.id === model.id ? { ...m, name: trimmed } : m)))
  }, [models, saveModels])

  const isDesktop = isDesktopRuntime()

  useEffect(() => {
    if (!focusPath || models.length === 0) {
      return
    }
    const target = modelNodeMapRef.current[focusPath]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusPath, models.length])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-(--color-border) px-6 py-4">
        <h1 className="text-xl font-semibold">Live2D 模型管理</h1>
        {isDesktop && (
          <Button onClick={handlePickFile}>
            <FolderOpen className="h-4 w-4" />
            浏览文件导入
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-2 text-xs text-(--color-muted-foreground)">
          说明：请选择或填写 <code>.model3.json</code> 入口文件，其他资源（moc3/png/motion）会由该文件自动引用。
        </div>

        <div className="mb-6 flex items-center gap-2">
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="输入 .model3.json 文件路径或 URL..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddManual()
            }}
          />
          <Button variant="outline" onClick={handleAddManual} disabled={!manualPath.trim() || isValidating}>
            <Plus className="h-4 w-4" />
            {isValidating ? '校验中...' : '添加'}
          </Button>
          {isDesktop && (
            <Button variant="outline" onClick={handlePickFile} disabled={isValidating}>
              <FolderOpen className="h-4 w-4" />
              浏览
            </Button>
          )}
        </div>

        {models.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-(--color-muted-foreground)">
            <Drama className="h-12 w-12 opacity-40" />
            <p className="text-lg">暂无 Live2D 模型</p>
            <p className="text-sm">
              {isDesktop
                ? '点击“浏览文件导入”选择 .model3.json 文件，或在上方输入路径。'
                : '在上方输入 .model3.json 文件路径或 URL 来添加模型。'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map(model => {
              const focused = focusPath === model.path
              return (
                <div
                  key={model.id}
                  ref={(node) => {
                    modelNodeMapRef.current[model.path] = node
                  }}
                  className={focused ? 'rounded-xl border-2 border-(--color-primary)' : ''}
                >
                  <ModelCard
                    model={model}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    isFocused={focused}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ModelCard({
  model,
  onDelete,
  onRename,
  isFocused = false,
}: {
  model: Live2DModel
  onDelete: (model: Live2DModel) => void
  onRename: (model: Live2DModel, newName: string) => void
  isFocused?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState(model.name)

  const handleBlur = () => {
    setEditing(false)
    onRename(model, nameValue)
  }

  return (
    <Card className={`group relative ${isFocused ? 'border-(--color-primary)' : ''}`}>
      <CardContent className="p-4">
        <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-(--color-muted)/30">
          <Drama className="h-10 w-10 text-(--color-primary)/30" />
        </div>

        {editing ? (
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBlur()
              if (e.key === 'Escape') {
                setNameValue(model.name)
                setEditing(false)
              }
            }}
            className="mb-1 h-7 text-sm"
            autoFocus
          />
        ) : (
          <div
            className="mb-1 cursor-pointer truncate text-sm font-medium"
            onClick={() => setEditing(true)}
            title="点击重命名"
          >
            {model.name}
          </div>
        )}

        <div className="truncate text-xs text-(--color-muted-foreground)" title={model.path}>
          {model.path}
        </div>
        {isFocused && (
          <div className="mt-1 text-xs text-(--color-primary)">当前定位模型</div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onDelete(model)}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </Button>
      </CardContent>
    </Card>
  )
}
