import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { MCPAuthType, MCPServerAdvancedConfig, MCPServerCreateInput, MCPTransportType } from '@/types'
import { MCP_TRANSPORT_LABELS } from '@/constants'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const mcpServerSchema = z.object({
  name: z.string().trim().min(1, '请输入服务名称'),
  description: z.string().optional().default(''),
  transportType: z.enum(['stdio', 'http'] as const),
  address: z.string().trim().min(1, '请输入服务地址或启动命令'),
  enabled: z.boolean().default(true),
  advancedEnabled: z.boolean().default(false),
  timeoutMs: z.string().optional().default(''),
  headersText: z.string().optional().default(''),
  argsText: z.string().optional().default(''),
  envText: z.string().optional().default(''),
  authType: z.enum(['none', 'bearer', 'basic', 'apiKey'] as const).default('none'),
  bearerToken: z.string().optional().default(''),
  basicUsername: z.string().optional().default(''),
  basicPassword: z.string().optional().default(''),
  apiKeyHeader: z.string().optional().default('X-API-Key'),
  apiKeyValue: z.string().optional().default(''),
})

type McpServerFormValues = z.infer<typeof mcpServerSchema>

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: MCPServerCreateInput) => Promise<void>
}

const DEFAULT_VALUES: McpServerFormValues = {
  name: '',
  description: '',
  transportType: 'stdio',
  address: '',
  enabled: true,
  advancedEnabled: false,
  timeoutMs: '',
  headersText: '',
  argsText: '',
  envText: '',
  authType: 'none',
  bearerToken: '',
  basicUsername: '',
  basicPassword: '',
  apiKeyHeader: 'X-API-Key',
  apiKeyValue: '',
}

function parseKeyValueLines(raw: string): Record<string, string> | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return undefined

  const pairs: Array<[string, string]> = []
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    const equalIndex = line.indexOf('=')
    const splitAt = colonIndex >= 0 ? colonIndex : equalIndex
    if (splitAt <= 0) continue

    const key = line.slice(0, splitAt).trim()
    const value = line.slice(splitAt + 1).trim()
    if (!key || !value) continue

    pairs.push([key, value])
  }

  if (pairs.length === 0) return undefined
  return Object.fromEntries(pairs)
}

function parseArgsLines(raw: string): string[] | undefined {
  const values = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}

function buildAdvancedConfig(data: McpServerFormValues): MCPServerAdvancedConfig | undefined {
  if (!data.advancedEnabled) return undefined

  const timeoutNumber = Number(data.timeoutMs)
  const timeoutMs = Number.isFinite(timeoutNumber) && timeoutNumber > 0
    ? Math.round(timeoutNumber)
    : undefined

  const headers = parseKeyValueLines(data.headersText)
  const args = data.transportType === 'stdio' ? parseArgsLines(data.argsText) : undefined
  const env = data.transportType === 'stdio' ? parseKeyValueLines(data.envText) : undefined

  let auth: MCPServerAdvancedConfig['auth']
  if (data.authType === 'bearer' && data.bearerToken.trim()) {
    auth = { type: 'bearer', token: data.bearerToken.trim() }
  }
  else if (data.authType === 'basic' && (data.basicUsername.trim() || data.basicPassword)) {
    auth = {
      type: 'basic',
      username: data.basicUsername.trim(),
      password: data.basicPassword,
    }
  }
  else if (data.authType === 'apiKey' && data.apiKeyHeader.trim() && data.apiKeyValue.trim()) {
    auth = {
      type: 'apiKey',
      headerName: data.apiKeyHeader.trim(),
      value: data.apiKeyValue.trim(),
    }
  }

  if (!timeoutMs && !headers && !args && !env && !auth) {
    return undefined
  }

  return {
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(headers ? { headers } : {}),
    ...(args ? { args } : {}),
    ...(env ? { env } : {}),
    ...(auth ? { auth } : {}),
  }
}

function authHintText(authType: MCPAuthType) {
  if (authType === 'bearer') return '自动注入 Authorization: Bearer <token>'
  if (authType === 'basic') return '自动注入 Basic Auth 请求头'
  if (authType === 'apiKey') return '按 Header 名称注入 API Key'
  return '不附带认证信息'
}

export function McpServerDialog({
  open,
  onOpenChange,
  onSubmit,
}: McpServerDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<McpServerFormValues>({
    resolver: zodResolver(mcpServerSchema) as any,
    defaultValues: DEFAULT_VALUES,
  })

  const transportType = watch('transportType')
  const enabled = watch('enabled')
  const advancedEnabled = watch('advancedEnabled')
  const authType = watch('authType')

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES)
    }
  }, [open, reset])

  async function handleFormSubmit(data: McpServerFormValues) {
    await onSubmit({
      name: data.name.trim(),
      description: data.description.trim(),
      transportType: data.transportType,
      address: data.address.trim(),
      enabled: data.enabled,
      advancedConfig: buildAdvancedConfig(data),
    })
    reset(DEFAULT_VALUES)
  }

  function handleCancel() {
    reset(DEFAULT_VALUES)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>添加 MCP 服务</DialogTitle>
          <DialogDescription>
            支持基础配置与高级参数（认证、超时、Header、stdio args/env）。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit as any)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm">
              服务名称 <span className="text-(--color-destructive)">*</span>
            </Label>
            <Input
              id="name"
              placeholder="例如：Filesystem MCP"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-(--color-destructive)">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm">描述</Label>
            <Textarea
              id="description"
              placeholder="简要说明服务用途"
              rows={3}
              {...register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">传输方式</Label>
            <Select
              value={transportType}
              onValueChange={(value: MCPTransportType) => setValue('transportType', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">{MCP_TRANSPORT_LABELS.stdio}</SelectItem>
                <SelectItem value="http">{MCP_TRANSPORT_LABELS.http}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address" className="text-sm">
              {transportType === 'stdio' ? '启动命令' : '服务地址'}
              {' '}
              <span className="text-(--color-destructive)">*</span>
            </Label>
            <Input
              id="address"
              placeholder={
                transportType === 'stdio'
                  ? '例如：npx -y @modelcontextprotocol/server-filesystem C:\\workspace'
                  : '例如：https://mcp.example.com'
              }
              className="font-mono text-sm"
              {...register('address')}
            />
            {errors.address && (
              <p className="text-xs text-(--color-destructive)">{errors.address.message}</p>
            )}
          </div>

          <div className="rounded-lg border border-(--color-border) p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">启用高级配置</Label>
                <p className="text-xs text-(--color-muted-foreground)">
                  用于真实接入时补充 timeout、headers、auth、stdio args/env。
                </p>
              </div>
              <Switch
                checked={advancedEnabled}
                onCheckedChange={checked => setValue('advancedEnabled', checked)}
              />
            </div>

            {advancedEnabled && (
              <div className="mt-3 space-y-3 border-t border-(--color-border) pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="timeoutMs" className="text-xs">请求超时（毫秒）</Label>
                  <Input
                    id="timeoutMs"
                    inputMode="numeric"
                    placeholder="例如：5000"
                    {...register('timeoutMs')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="headersText" className="text-xs">Headers（每行 `Key: Value`）</Label>
                  <Textarea
                    id="headersText"
                    rows={3}
                    className="font-mono text-xs"
                    placeholder={'Authorization: Bearer ***\nX-Trace-Id: agent-live2d'}
                    {...register('headersText')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">认证方式</Label>
                  <Select
                    value={authType}
                    onValueChange={(value: MCPAuthType) => setValue('authType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="apiKey">API Key Header</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-(--color-muted-foreground)">{authHintText(authType)}</p>
                </div>

                {authType === 'bearer' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="bearerToken" className="text-xs">Bearer Token</Label>
                    <Input id="bearerToken" type="password" placeholder="sk-***" {...register('bearerToken')} />
                  </div>
                )}

                {authType === 'basic' && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="basicUsername" className="text-xs">Username</Label>
                      <Input id="basicUsername" placeholder="user" {...register('basicUsername')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="basicPassword" className="text-xs">Password</Label>
                      <Input id="basicPassword" type="password" placeholder="password" {...register('basicPassword')} />
                    </div>
                  </div>
                )}

                {authType === 'apiKey' && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="apiKeyHeader" className="text-xs">Header Name</Label>
                      <Input id="apiKeyHeader" placeholder="X-API-Key" {...register('apiKeyHeader')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="apiKeyValue" className="text-xs">Header Value</Label>
                      <Input id="apiKeyValue" type="password" placeholder="***" {...register('apiKeyValue')} />
                    </div>
                  </div>
                )}

                {transportType === 'stdio' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="argsText" className="text-xs">启动参数（每行一个）</Label>
                      <Textarea
                        id="argsText"
                        rows={3}
                        className="font-mono text-xs"
                        placeholder={'--port\n3001'}
                        {...register('argsText')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="envText" className="text-xs">环境变量（每行 `Key=Value`）</Label>
                      <Textarea
                        id="envText"
                        rows={3}
                        className="font-mono text-xs"
                        placeholder={'OPENAI_API_KEY=***\nLOG_LEVEL=debug'}
                        {...register('envText')}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">启用服务</Label>
              <p className="text-xs text-(--color-muted-foreground)">
                创建后立即启用该服务。
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={checked => setValue('enabled', checked)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '创建中...' : '添加服务'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

