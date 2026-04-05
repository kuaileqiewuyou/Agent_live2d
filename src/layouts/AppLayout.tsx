import { Suspense, lazy, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, Terminal } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { useBackendHealth, LIKELY_DOWN_THRESHOLD } from '@/hooks'
import { Button } from '@/components/ui/button'
import { useSettingsStore, useUIStore } from '@/stores'

const NewConversationDialog = lazy(async () => {
  const module = await import('@/components/layout/NewConversationDialog')
  return { default: module.NewConversationDialog }
})

function formatCheckedAt(value: string | null) {
  if (!value) return '未检查'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

type OfflineScenario = 'restarting' | 'never-connected' | 'likely-down'

function deriveScenario(
  wasConnected: boolean,
  consecutiveFailures: number,
): OfflineScenario {
  if (wasConnected && consecutiveFailures < LIKELY_DOWN_THRESHOLD) {
    return 'restarting'
  }
  if (!wasConnected && consecutiveFailures < LIKELY_DOWN_THRESHOLD) {
    return 'never-connected'
  }
  return 'likely-down'
}

const scenarioConfig: Record<OfflineScenario, {
  title: string
  description: string
  hints: string[]
}> = {
  'restarting': {
    title: '后端重启中',
    description: '检测到后端短暂不可达，正在自动重试连接...',
    hints: [
      '通常几秒内即可恢复，请稍候。',
      '如果长时间未恢复，可检查终端是否有报错。',
    ],
  },
  'never-connected': {
    title: '后端未就绪',
    description: '当前无法连接后端 API，请确认后端服务已启动。',
    hints: [
      '运行 npm run local:up 启动 Docker 服务',
      '或运行 npm run backend:dev 手动启动后端',
      '确认端口未被其他进程占用',
    ],
  },
  'likely-down': {
    title: '后端连接失败',
    description: '多次尝试连接后端均失败，请检查服务状态。',
    hints: [
      '运行 npm run local:check 确认后端状态',
      '检查终端输出是否有端口冲突或启动错误',
      '尝试 npm run local:down && npm run local:up 重启服务',
    ],
  },
}

export function AppLayout() {
  const { settings } = useSettingsStore()
  const showNewConversationDialog = useUIStore((state) => state.showNewConversationDialog)
  const {
    isReachable,
    hasChecked,
    checking,
    lastCheckedAt,
    apiBaseUrl,
    consecutiveFailures,
    wasConnected,
    retry,
  } = useBackendHealth()
  const showBackendOfflineBanner = hasChecked && !isReachable
  const [healthDetailsOpen, setHealthDetailsOpen] = useState(false)

  const scenario = useMemo(
    () => deriveScenario(wasConnected, consecutiveFailures),
    [wasConnected, consecutiveFailures],
  )
  const config = scenarioConfig[scenario]

  const backgroundValue = settings.backgroundImage?.trim()
  const isGradientBackground
    = !!backgroundValue
      && /^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\(/.test(backgroundValue)
  const backgroundStyle = backgroundValue
    ? isGradientBackground
      ? { background: backgroundValue }
      : { backgroundImage: `url(${backgroundValue})` }
    : undefined

  const checkedAtText = useMemo(
    () => formatCheckedAt(lastCheckedAt),
    [lastCheckedAt],
  )

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      {backgroundStyle && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            ...backgroundStyle,
            filter: `blur(${settings.backgroundBlur}px)`,
          }}
        />
      )}
      {backgroundStyle && (
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: `rgba(var(--color-background-rgb, 0, 0, 0), ${settings.backgroundOverlayOpacity})`,
          }}
        />
      )}

      {showBackendOfflineBanner && (
        <div className="relative z-30 border-b border-amber-300/60 bg-amber-50/95 px-4 py-2 text-amber-900 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {scenario === 'restarting' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-medium">{config.title}</span>
                  <span className="ml-1.5 text-amber-800/80">{config.description}</span>
                </div>
              </div>

              {healthDetailsOpen && (
                <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-100/50 px-2 py-1.5 text-[11px] leading-5">
                  <div>API Base URL：{apiBaseUrl}</div>
                  <div>最近检查：{checkedAtText}</div>
                  <div>连续失败：{consecutiveFailures} 次</div>
                  <div className="mt-1.5 flex items-start gap-1.5 text-amber-800/80">
                    <Terminal className="mt-0.5 h-3 w-3 shrink-0" />
                    <div className="space-y-0.5">
                      {config.hints.map((hint, index) => (
                        <div key={index}>{hint}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-amber-900 hover:bg-amber-200/70"
                onClick={() => setHealthDetailsOpen((current) => !current)}
              >
                {healthDetailsOpen ? (
                  <span className="inline-flex items-center gap-1">
                    <ChevronUp className="h-3.5 w-3.5" />
                    收起
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <ChevronDown className="h-3.5 w-3.5" />
                    详情
                  </span>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-amber-300 bg-amber-100/80 px-2 text-[11px] text-amber-900 hover:bg-amber-200"
                onClick={() => void retry()}
                disabled={checking}
              >
                {checking ? (
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    检查中
                  </span>
                ) : '立即重试'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 w-full">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {showNewConversationDialog && (
        <Suspense fallback={null}>
          <NewConversationDialog />
        </Suspense>
      )}
    </div>
  )
}
