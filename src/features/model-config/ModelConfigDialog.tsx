import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ModelConfig, ProviderType } from '@/types'
import { PROVIDER_LABELS, PROVIDER_DEFAULT_URLS, TERMS } from '@/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

const modelConfigSchema = z.object({
  name: z.string().min(1, '配置名称不能为空'),
  provider: z.enum([
    'openai-compatible',
    'anthropic',
    'gemini',
    'ollama',
  ] as const),
  baseUrl: z.string().min(1, 'Base URL 不能为空'),
  apiKey: z.string().optional().default(''),
  model: z.string().min(1, '模型名称不能为空'),
  streamEnabled: z.boolean().default(true),
  toolCallSupported: z.boolean().default(false),
  isDefault: z.boolean().default(false),
})

type ModelConfigFormValues = z.infer<typeof modelConfigSchema>

interface ModelConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config?: ModelConfig | null
  onSubmit: (data: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>) => void
}

export function ModelConfigDialog({
  open,
  onOpenChange,
  config,
  onSubmit,
}: ModelConfigDialogProps) {
  const isEditing = !!config
  const [showApiKey, setShowApiKey] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(modelConfigSchema) as any,
    defaultValues: config
      ? {
          name: config.name,
          provider: config.provider,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          streamEnabled: config.streamEnabled,
          toolCallSupported: config.toolCallSupported,
          isDefault: config.isDefault,
        }
      : {
          name: '',
          provider: 'openai-compatible',
          baseUrl: PROVIDER_DEFAULT_URLS['openai-compatible'],
          apiKey: '',
          model: '',
          streamEnabled: true,
          toolCallSupported: false,
          isDefault: false,
        },
  })

  const provider = watch('provider')

  // Auto-fill baseUrl when provider changes
  useEffect(() => {
    if (!isEditing && provider) {
      setValue('baseUrl', PROVIDER_DEFAULT_URLS[provider as ProviderType])
    }
  }, [provider, setValue, isEditing])

  const onFormSubmit = (data: ModelConfigFormValues) => {
    onSubmit({
      ...data,
      apiKey: data.apiKey ?? '',
      provider: data.provider as ProviderType,
    })
    reset()
    setShowApiKey(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{isEditing ? '编辑配置' : '新建配置'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? '修改模型配置的连接信息和参数'
              : '添加一个新的 AI 模型配置'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)]">
          <form
            id="model-config-form"
            onSubmit={handleSubmit(onFormSubmit as any)}
            className="space-y-5 px-6 pb-2"
          >
            {/* 配置名称 */}
            <div className="space-y-1.5">
              <Label htmlFor="name">配置名称 *</Label>
              <Input
                id="name"
                placeholder="例如：GPT-4o 生产环境"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-(--color-destructive) mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* 供应商 */}
            <div className="space-y-1.5">
              <Label>供应商 *</Label>
              <Controller
                name="provider"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(PROVIDER_LABELS) as [
                          ProviderType,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <Label htmlFor="baseUrl">Base URL *</Label>
              <Input
                id="baseUrl"
                placeholder="https://api.example.com/v1"
                {...register('baseUrl')}
              />
              {errors.baseUrl && (
                <p className="text-xs text-(--color-destructive) mt-1">
                  {errors.baseUrl.message}
                </p>
              )}
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="输入 API Key"
                  className="pr-10"
                  {...register('apiKey')}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-(--color-muted-foreground) hover:text-(--color-foreground)"
                  onClick={() => setShowApiKey((v) => !v)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* 模型名称 */}
            <div className="space-y-1.5">
              <Label htmlFor="model">模型名称 *</Label>
              <Input
                id="model"
                placeholder="例如：gpt-4o, claude-sonnet-4-20250514"
                {...register('model')}
              />
              {errors.model && (
                <p className="text-xs text-(--color-destructive) mt-1">
                  {errors.model.message}
                </p>
              )}
            </div>

            {/* 启用流式输出 */}
            <div className="flex items-center justify-between">
              <Label htmlFor="streamEnabled" className="cursor-pointer">
                启用流式输出
              </Label>
              <Controller
                name="streamEnabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="streamEnabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            {/* 支持工具调用 */}
            <div className="flex items-center justify-between">
              <Label htmlFor="toolCallSupported" className="cursor-pointer">
                {TERMS.enableToolCall}
              </Label>
              <Controller
                name="toolCallSupported"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="toolCallSupported"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            {/* 设为默认 */}
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault" className="cursor-pointer">
                设为默认
              </Label>
              <Controller
                name="isDefault"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="isDefault"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 pb-6 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            取消
          </Button>
          <Button
            type="submit"
            form="model-config-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? '保存中...' : isEditing ? '保存修改' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
