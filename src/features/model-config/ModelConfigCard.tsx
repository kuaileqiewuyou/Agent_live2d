import { useState } from 'react'
import {
  CheckCircle,
  Edit2,
  Loader2,
  Plug,
  Star,
  Trash2,
  XCircle,
  Zap,
  Wrench,
} from 'lucide-react'
import type { ModelConfig, ProviderType } from '@/types'
import { modelService } from '@/services'
import { PROVIDER_LABELS } from '@/constants'
import { cn } from '@/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'

const PROVIDER_COLORS: Record<ProviderType, string> = {
  'openai-compatible':
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  anthropic:
    'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  gemini:
    'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  ollama:
    'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
}

interface ModelConfigCardProps {
  config: ModelConfig
  onEdit: (config: ModelConfig) => void
  onDelete: (config: ModelConfig) => void
}

export function ModelConfigCard({
  config,
  onEdit,
  onDelete,
}: ModelConfigCardProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await modelService.testConnection(config.id)
      setTestResult(result)
    }
    catch {
      setTestResult({ success: false, message: '连接测试失败' })
    }
    finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 4000)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{config.name}</h3>
            {config.isDefault && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            )}
          </div>
          <Badge
            variant="outline"
            className={cn('text-xs', PROVIDER_COLORS[config.provider])}
          >
            {PROVIDER_LABELS[config.provider]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-(--color-muted-foreground)">
            <span className="w-16 shrink-0 font-medium">模型</span>
            <span className="truncate">{config.model}</span>
          </div>
          <div className="flex items-center gap-2 text-(--color-muted-foreground)">
            <span className="w-16 shrink-0 font-medium">地址</span>
            <span className="truncate text-xs">{config.baseUrl}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.streamEnabled && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Zap className="h-3 w-3" />
              流式输出
            </Badge>
          )}
          {config.toolCallSupported && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Wrench className="h-3 w-3" />
              工具调用
            </Badge>
          )}
        </div>

        {testResult && (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs',
              testResult.success
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-700 dark:text-red-400',
            )}
          >
            {testResult.success ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {testResult.message}
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 border-t border-(--color-border) pt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onEdit(config)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          编辑
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          测试连接
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-(--color-destructive) hover:bg-(--color-destructive) hover:text-(--color-destructive-foreground)"
          onClick={() => onDelete(config)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  )
}
