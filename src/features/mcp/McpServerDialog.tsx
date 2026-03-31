import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { MCPTransportType } from '@/types'
import { MCP_TRANSPORT_LABELS } from '@/constants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const mcpServerSchema = z.object({
  name: z.string().min(1, '请输入服务名称'),
  description: z.string().optional().default(''),
  transportType: z.enum(['stdio', 'http'] as const),
  address: z.string().min(1, '请输入地址或启动命令'),
  enabled: z.boolean().default(true),
})

type McpServerFormValues = z.infer<typeof mcpServerSchema>

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: McpServerFormValues) => void
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
    formState: { errors },
  } = useForm({
    resolver: zodResolver(mcpServerSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      transportType: 'stdio',
      address: '',
      enabled: true,
    },
  })

  const transportType = watch('transportType')
  const enabled = watch('enabled')

  function handleFormSubmit(data: McpServerFormValues) {
    onSubmit(data)
    reset()
    onOpenChange(false)
  }

  function handleCancel() {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加 MCP 服务</DialogTitle>
          <DialogDescription>
            配置新的 MCP 服务器连接
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit as any)}
          className="space-y-4"
        >
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm">
              服务名称 <span className="text-(--color-destructive)">*</span>
            </Label>
            <Input
              id="name"
              placeholder="例如: 本地文件系统"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-(--color-destructive)">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm">
              描述
            </Label>
            <Textarea
              id="description"
              placeholder="简要描述此服务的功能..."
              rows={3}
              {...register('description')}
            />
          </div>

          {/* Transport Type */}
          <div className="space-y-2">
            <Label className="text-sm">传输方式</Label>
            <Select
              value={transportType}
              onValueChange={(value: MCPTransportType) =>
                setValue('transportType', value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">
                  {MCP_TRANSPORT_LABELS.stdio}
                </SelectItem>
                <SelectItem value="http">
                  {MCP_TRANSPORT_LABELS.http}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address" className="text-sm">
              {transportType === 'stdio'
                ? '启动命令'
                : '服务地址'}{' '}
              <span className="text-(--color-destructive)">*</span>
            </Label>
            <Input
              id="address"
              placeholder={
                transportType === 'stdio'
                  ? '例如: /usr/local/bin/mcp-server'
                  : '例如: https://mcp.example.com/api'
              }
              className="font-mono text-sm"
              {...register('address')}
            />
            {errors.address && (
              <p className="text-xs text-(--color-destructive)">
                {errors.address.message}
              </p>
            )}
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">启用</Label>
              <p className="text-xs text-(--color-muted-foreground)">
                添加后立即启用此服务
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => setValue('enabled', checked)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              取消
            </Button>
            <Button type="submit">添加服务</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
