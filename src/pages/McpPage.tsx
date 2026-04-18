import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Plus, Server } from 'lucide-react'
import type { MCPSmokeResult, MCPServer, OpsMCPInstallSession, OpsMCPInstallStep } from '@/types'
import { mcpService, opsMcpInstallerService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BackendHealthStatus } from '@/components/common/BackendHealthStatus'
import { ScrollArea } from '@/components/ui/scroll-area'
import { McpServerCard } from '@/features/mcp/McpServerCard'
import { McpServerDialog } from '@/features/mcp/McpServerDialog'

const MCP_AUTO_CHECK_POLL_MS = 30000

export function McpPage() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const [smokingIds, setSmokingIds] = useState<Set<string>>(new Set())
  const [smokeResults, setSmokeResults] = useState<Record<string, MCPSmokeResult>>({})
  const [importLink, setImportLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSession, setImportSession] = useState<OpsMCPInstallSession | null>(null)
  const [importExecutingStepId, setImportExecutingStepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const pushNotification = useNotificationStore((state) => state.push)
  const serversRef = useRef<MCPServer[]>([])
  const autoCheckInFlightRef = useRef(false)

  useEffect(() => {
    serversRef.current = servers
  }, [servers])

  const setCheckingState = useCallback((id: string, checking: boolean) => {
    setCheckingIds((prev) => {
      const next = new Set(prev)
      if (checking) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const setSmokingState = useCallback((id: string, smoking: boolean) => {
    setSmokingIds((prev) => {
      const next = new Set(prev)
      if (smoking) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const loadServers = useCallback(async (options: { notifyOnError?: boolean } = {}) => {
    try {
      const allServers = await mcpService.getMcpServers()
      setServers(allServers)
      return allServers
    }
    catch (error) {
      if (options.notifyOnError !== false) {
        pushNotification({
          type: 'error',
          title: '加载 MCP 服务失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
      return null
    }
  }, [pushNotification])

  const checkConnection = useCallback(async (
    id: string,
    options: {
      notifyResult?: boolean
      notifyError?: boolean
      refreshAfter?: boolean
    } = {},
  ) => {
    setCheckingState(id, true)

    try {
      const result = await mcpService.checkConnection(id)
      if (options.notifyResult !== false) {
        pushNotification({
          type: result.success ? 'success' : 'error',
          title: result.success ? '连接测试成功' : '连接测试失败',
          description: result.message,
        })
      }
      return result
    }
    catch (error) {
      if (options.notifyError !== false) {
        pushNotification({
          type: 'error',
          title: '连接测试失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
      return null
    }
    finally {
      setCheckingState(id, false)
      if (options.refreshAfter !== false) {
        await loadServers({ notifyOnError: false })
      }
    }
  }, [loadServers, pushNotification, setCheckingState])

  const runAutoCheckSweep = useCallback(async (targetServers?: MCPServer[]) => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    if (autoCheckInFlightRef.current) {
      return
    }

    const baseServers = targetServers ?? serversRef.current
    const targets = baseServers
      .filter(server => server.enabled)
      .map(server => server.id)

    if (targets.length === 0) {
      return
    }

    autoCheckInFlightRef.current = true
    try {
      await Promise.allSettled(
        targets.map(id => checkConnection(id, {
          notifyResult: false,
          notifyError: false,
          refreshAfter: false,
        })),
      )
      await loadServers({ notifyOnError: false })
    }
    finally {
      autoCheckInFlightRef.current = false
    }
  }, [checkConnection, loadServers])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const allServers = await loadServers()
      if (cancelled) return

      setLoading(false)
      if (allServers?.some(server => server.enabled)) {
        await runAutoCheckSweep(allServers)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadServers, runAutoCheckSweep])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void runAutoCheckSweep()
    }, MCP_AUTO_CHECK_POLL_MS)

    const handleOnline = () => {
      void runAutoCheckSweep()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runAutoCheckSweep()
      }
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [runAutoCheckSweep])

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await mcpService.toggleMcpServer(id, enabled)
      setServers(prev => prev.map(server => (server.id === updated.id ? updated : server)))
      pushNotification({
        type: 'success',
        title: enabled ? 'MCP 服务已启用' : 'MCP 服务已停用',
        description: updated.name,
      })

      if (enabled) {
        await checkConnection(id, {
          notifyResult: false,
          notifyError: false,
        })
      }
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '更新 MCP 服务状态失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  async function handleCheckConnection(id: string) {
    await checkConnection(id)
  }

  const handleSmokeConnection = useCallback(async (id: string) => {
    setSmokingState(id, true)
    try {
      const result = await mcpService.smokeConnection(id)
      setSmokeResults(prev => ({ ...prev, [id]: result }))
      pushNotification({
        type: result.ok ? 'success' : 'error',
        title: result.ok ? '一键验收成功' : '一键验收失败',
        description: result.summary || (result.ok ? '3/3 steps passed' : '请查看卡片内步骤详情'),
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '一键验收失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setSmokingState(id, false)
    }
  }, [pushNotification, setSmokingState])

  const handlePreviewImport = useCallback(async () => {
    const normalizedLink = importLink.trim()
    if (!normalizedLink) {
      pushNotification({
        type: 'info',
        title: '请先输入链接',
        description: '支持 URL、JSON 配置片段和 GitHub 链接。',
      })
      return
    }

    try {
      setImporting(true)
      const session = await opsMcpInstallerService.previewInstall({ link: normalizedLink })
      setImportSession(session)
      pushNotification({
        type: 'success',
        title: '已生成安装步骤',
        description: `${session.parsedConfig.name} · ${session.parsedConfig.transportType}`,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '生成安装步骤失败',
        description: error instanceof Error ? error.message : '请检查链接后重试。',
      })
    }
    finally {
      setImporting(false)
    }
  }, [importLink, pushNotification])

  const handleExecuteImportStep = useCallback(async (step: OpsMCPInstallStep) => {
    if (!importSession) return
    try {
      setImportExecutingStepId(step.id)
      const result = await opsMcpInstallerService.executeInstallStep({
        sessionId: importSession.id,
        stepId: step.id,
      })
      setImportSession(result.session)
      pushNotification({
        type: result.step.status === 'passed' ? 'success' : 'error',
        title: result.step.status === 'passed' ? '步骤执行成功' : '步骤执行失败',
        description: result.step.detail || result.session.summary,
      })
      if (result.session.status === 'completed') {
        await loadServers({ notifyOnError: false })
      }
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '步骤执行失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setImportExecutingStepId(null)
    }
  }, [importSession, loadServers, pushNotification])

  async function handleDelete(id: string) {
    try {
      const target = servers.find(server => server.id === id)
      await mcpService.deleteMcpServer(id)
      setServers(prev => prev.filter(server => server.id !== id))
      setSmokeResults((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      pushNotification({
        type: 'success',
        title: 'MCP 服务已删除',
        description: target?.name,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '删除 MCP 服务失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  async function handleAddServer(data: {
    name: string
    description?: string
    transportType: 'stdio' | 'http'
    address: string
    enabled: boolean
    advancedConfig?: MCPServer['advancedConfig']
  }) {
    try {
      const server = await mcpService.createMcpServer({
        name: data.name,
        description: data.description || '',
        transportType: data.transportType,
        address: data.address,
        enabled: data.enabled,
        advancedConfig: data.advancedConfig,
      })

      setServers(prev => [...prev, server])
      setDialogOpen(false)
      pushNotification({
        type: 'success',
        title: 'MCP 服务已创建',
        description: server.name,
      })

      if (server.enabled) {
        await checkConnection(server.id, {
          notifyResult: false,
          notifyError: false,
        })
      }
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '创建 MCP 服务失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
      throw error
    }
  }

  const enabledCount = servers.filter(server => server.enabled).length
  const connectedCount = servers.filter(server => server.connectionStatus === 'connected').length
  const checkingCount = checkingIds.size

  const statusSummary = useMemo(() => {
    if (loading) return '加载中...'
    if (checkingCount > 0) return `检查中 ${checkingCount} 个`
    return `已连接 ${connectedCount} 个`
  }, [checkingCount, connectedCount, loading])

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-4 px-6 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary)/10">
              <Server className="h-5 w-5 text-(--color-primary)" />
            </div>
            <div>
              <h1 className="text-xl font-bold">MCP 服务管理</h1>
              <p className="text-xs text-(--color-muted-foreground)">
                管理模型上下文协议服务端连接
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                已启用 {enabledCount} 个
              </Badge>
              <Badge variant="success" className="px-2.5 py-1 text-xs">
                {statusSummary}
              </Badge>
            </div>

            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              添加服务
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6">
        <BackendHealthStatus />

        <div className="mb-4 rounded-xl border border-(--color-border) bg-(--color-card)/80 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-(--color-primary)" />
            从链接导入 MCP
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              className="h-9 flex-1 rounded-md border border-(--color-border) bg-(--color-background) px-3 text-sm outline-none ring-(--color-primary)/30 focus:ring-2"
              value={importLink}
              onChange={event => setImportLink(event.target.value)}
              placeholder="粘贴 URL / JSON 配置片段 / GitHub 链接"
            />
            <Button
              size="sm"
              onClick={() => void handlePreviewImport()}
              disabled={importing}
            >
              {importing ? '解析中...' : '生成安装步骤'}
            </Button>
          </div>
          {importSession && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-(--color-muted-foreground)">
                {importSession.parsedConfig.name} · {importSession.parsedConfig.transportType} · {importSession.status}
              </div>
              {importSession.steps
                .filter(step => step.requiresConfirm)
                .map(step => {
                  const canExecute = step.status === 'pending' || step.status === 'failed'
                  const running = step.status === 'running' || importExecutingStepId === step.id
                  return (
                    <div
                      key={step.id}
                      className="flex items-center justify-between rounded-md border border-(--color-border) bg-(--color-background)/70 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{step.title}</div>
                        <div className="truncate text-[11px] text-(--color-muted-foreground)">
                          {step.detail || step.status}
                        </div>
                      </div>
                      <Button
                        variant={canExecute ? 'default' : 'outline'}
                        size="sm"
                        disabled={!canExecute || running}
                        onClick={() => void handleExecuteImportStep(step)}
                      >
                        {running ? '执行中...' : canExecute ? '确认执行' : '已完成'}
                      </Button>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 pb-6 lg:grid-cols-2">
          {servers.map(server => (
            <McpServerCard
              key={server.id}
              server={server}
              onToggle={handleToggle}
              onCheckConnection={handleCheckConnection}
              onSmokeConnection={handleSmokeConnection}
              onDelete={handleDelete}
              checking={checkingIds.has(server.id)}
              smoking={smokingIds.has(server.id)}
              smokeResult={smokeResults[server.id]}
            />
          ))}
        </div>

        {servers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-(--color-muted-foreground)">
            <Server className="mb-3 h-10 w-10 opacity-30" />
            <p className="mb-3 text-sm">还没有添加任何 MCP 服务</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              添加第一个服务
            </Button>
          </div>
        )}
      </ScrollArea>

      <McpServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAddServer}
      />
    </div>
  )
}


