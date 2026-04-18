import { useMemo } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useBackendHealth } from '@/hooks'
import { Button } from '@/components/ui/button'

function formatCheckedAt(value: string | null): string {
  if (!value) return '未检测'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function BackendHealthStatus() {
  const {
    isReachable,
    hasChecked,
    checking,
    lastCheckedAt,
    apiBaseUrl,
    retry,
  } = useBackendHealth()

  const status = useMemo(() => {
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
        description: '接口可用',
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        icon: Wifi,
        iconClassName: '',
      }
    }
    return {
      label: '后端离线',
      description: '当前无法访问后端接口',
      className: 'border-red-300 bg-red-50 text-red-700',
      icon: WifiOff,
      iconClassName: '',
    }
  }, [checking, hasChecked, isReachable])

  const StatusIcon = status.icon

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-card) px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}>
            <StatusIcon className={`h-3.5 w-3.5 ${status.iconClassName}`} />
            {status.label}
          </span>
          <span className="text-xs text-(--color-muted-foreground)">{status.description}</span>
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
  )
}
