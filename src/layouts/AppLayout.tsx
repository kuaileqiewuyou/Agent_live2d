import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, Terminal } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { useBackendHealth, LIKELY_DOWN_THRESHOLD } from '@/hooks'
import { Button } from '@/components/ui/button'
import { useAppStore, useSettingsStore, useUIStore } from '@/stores'
import { FileAccessPermissionDialog } from '@/components/common/FileAccessPermissionDialog'

const NewConversationDialog = lazy(async () => {
  const module = await import('@/components/layout/NewConversationDialog')
  return { default: module.NewConversationDialog }
})

const SIDEBAR_DEFAULT_WIDTH = 280
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 460
const SIDEBAR_COLLAPSED_WIDTH = 64
const SIDEBAR_WIDTH_STORAGE_KEY = 'app.sidebarWidth'

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value))
}

function readSidebarWidth() {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  if (raw === null) return SIDEBAR_DEFAULT_WIDTH
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH
  return clampSidebarWidth(parsed)
}

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
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
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
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<{ startX: number, startWidth: number } | null>(null)
  const pendingSidebarWidthRef = useRef(sidebarWidth)
  const frameRef = useRef<number | null>(null)

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

  const persistSidebarWidth = useCallback((nextWidth: number) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth))
  }, [])

  const setResizeFeedback = useCallback((active: boolean) => {
    if (typeof document === 'undefined') return
    document.body.style.cursor = active ? 'col-resize' : ''
    document.body.style.userSelect = active ? 'none' : ''
  }, [])

  const handleResizeStart = useCallback((event: { clientX: number, preventDefault: () => void }) => {
    if (sidebarCollapsed) return
    event.preventDefault()
    pendingSidebarWidthRef.current = sidebarWidth
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    }
    setIsResizing(true)
    setResizeFeedback(true)
  }, [setResizeFeedback, sidebarCollapsed, sidebarWidth])

  const handleResetSidebarWidth = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    resizeStateRef.current = null
    setIsResizing(false)
    setResizeFeedback(false)
    const nextWidth = SIDEBAR_DEFAULT_WIDTH
    pendingSidebarWidthRef.current = nextWidth
    setSidebarWidth(nextWidth)
    persistSidebarWidth(nextWidth)
  }, [persistSidebarWidth, setResizeFeedback])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current
      if (!resizeState) return
      const deltaX = event.clientX - resizeState.startX
      const nextWidth = clampSidebarWidth(resizeState.startWidth + deltaX)
      pendingSidebarWidthRef.current = nextWidth
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        setSidebarWidth(pendingSidebarWidthRef.current)
      })
    }

    function handleMouseUp() {
      if (!resizeStateRef.current) return
      resizeStateRef.current = null
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      setSidebarWidth(pendingSidebarWidthRef.current)
      persistSidebarWidth(pendingSidebarWidthRef.current)
      setIsResizing(false)
      setResizeFeedback(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      setResizeFeedback(false)
    }
  }, [persistSidebarWidth, setResizeFeedback])

  useEffect(() => {
    if (!sidebarCollapsed) return
    resizeStateRef.current = null
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    pendingSidebarWidthRef.current = sidebarWidth
    setIsResizing(false)
    setResizeFeedback(false)
  }, [setResizeFeedback, sidebarCollapsed, sidebarWidth])

  const effectiveSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth

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
        <div
          data-testid="sidebar-shell"
          className={`relative h-full shrink-0 ${isResizing ? '' : 'transition-[width] duration-200 ease-in-out'}`}
          style={{ width: `${effectiveSidebarWidth}px` }}
        >
          <Sidebar />
          {!sidebarCollapsed && (
            <button
              type="button"
              aria-label="调整侧边栏宽度"
              title="拖动调整宽度，双击恢复默认宽度"
              onMouseDown={handleResizeStart}
              onDoubleClick={handleResetSidebarWidth}
              className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize rounded-full bg-transparent hover:bg-(--color-primary)/20"
            />
          )}
        </div>
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {showNewConversationDialog && (
        <Suspense fallback={null}>
          <NewConversationDialog />
        </Suspense>
      )}

      <FileAccessPermissionDialog />
    </div>
  )
}
