import { useEffect, useState } from 'react'
import { Plus, Server } from 'lucide-react'
import type { MCPServer } from '@/types'
import { mcpService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { McpServerCard } from '@/features/mcp/McpServerCard'
import { McpServerDialog } from '@/features/mcp/McpServerDialog'

export function McpPage() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const pushNotification = useNotificationStore((state) => state.push)

  useEffect(() => {
    mcpService.getMcpServers()
      .then(setServers)
      .catch((error) => {
        pushNotification({
          type: 'error',
          title: '加载 MCP 服务失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      })
  }, [pushNotification])

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await mcpService.toggleMcpServer(id, enabled)
      setServers(prev =>
        prev.map(server => (server.id === updated.id ? updated : server)),
      )
      pushNotification({
        type: 'success',
        title: enabled ? 'MCP 服务已启用' : 'MCP 服务已停用',
        description: updated.name,
      })
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
    setCheckingIds(prev => new Set(prev).add(id))
    try {
      const result = await mcpService.checkConnection(id)
      const allServers = await mcpService.getMcpServers()
      setServers(allServers)
      pushNotification({
        type: result.success ? 'success' : 'error',
        title: result.success ? '连接检查完成' : '连接检查失败',
        description: result.message,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '连接检查失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setCheckingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
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
  }) {
    try {
      const server = await mcpService.createMcpServer({
        name: data.name,
        description: data.description || '',
        transportType: data.transportType,
        address: data.address,
        enabled: data.enabled,
      })
      setServers(prev => [...prev, server])
      setDialogOpen(false)
      pushNotification({
        type: 'success',
        title: 'MCP 服务已创建',
        description: server.name,
      })
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
  const connectedCount = servers.filter(
    server => server.connectionStatus === 'connected',
  ).length

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
                已连接 {connectedCount} 个
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
