import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Server } from 'lucide-react'
import type { MCPServer } from '@/types'
import { mcpService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { McpServerCard } from '@/features/mcp/McpServerCard'
import { McpServerDialog } from '@/features/mcp/McpServerDialog'

const MCP_AUTO_CHECK_POLL_MS = 30000

export function McpPage() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
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

  async function handleDelete(id: string) {
    try {
      const target = servers.find(server => server.id === id)
      await mcpService.deleteMcpServer(id)
      setServers(prev => prev.filter(server => server.id !== id))
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
        <div className="grid grid-cols-1 gap-4 pb-6 lg:grid-cols-2">
          {servers.map(server => (
            <McpServerCard
              key={server.id}
              server={server}
              onToggle={handleToggle}
              onCheckConnection={handleCheckConnection}
              onDelete={handleDelete}
              checking={checkingIds.has(server.id)}
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

