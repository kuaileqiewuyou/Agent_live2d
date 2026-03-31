import { useState, useEffect } from 'react'
import { Plus, Server } from 'lucide-react'
import type { MCPServer } from '@/types'
import { mcpService } from '@/services'
import { useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { McpServerCard } from '@/features/mcp/McpServerCard'
import { McpServerDialog } from '@/features/mcp/McpServerDialog'

export function McpPage() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const pushNotification = useNotificationStore((state) => state.push)

  useEffect(() => {
    mcpService.getMcpServers().then(setServers)
  }, [])

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await mcpService.toggleMcpServer(id, enabled)
      setServers((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
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
        description: error instanceof Error ? error.message : '请稍后再试',
      })
    }
  }

  async function handleCheckConnection(id: string) {
    setCheckingIds((prev) => new Set(prev).add(id))
    try {
      const result = await mcpService.checkConnection(id)
      // Reload to get updated status
      const all = await mcpService.getMcpServers()
      setServers(all)
      pushNotification({
        type: result.success ? 'success' : 'error',
        title: result.success ? '连接检查完成' : '连接检查失败',
        description: result.message,
      })
    } finally {
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
      setServers((prev) => prev.filter((s) => s.id !== id))
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
        description: error instanceof Error ? error.message : '请稍后再试',
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
      setServers((prev) => [...prev, server])
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
        description: error instanceof Error ? error.message : '请稍后再试',
      })
    }
  }

  const enabledCount = servers.filter((s) => s.enabled).length
  const connectedCount = servers.filter(
    (s) => s.connectionStatus === 'connected',
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--color-primary)/10">
              <Server className="w-5 h-5 text-(--color-primary)" />
            </div>
            <div>
              <h1 className="text-xl font-bold">MCP 服务管理</h1>
              <p className="text-xs text-(--color-muted-foreground)">
                管理模型上下文协议服务器连接
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs px-2.5 py-1">
                {enabledCount} 个启用
              </Badge>
              <Badge variant="success" className="text-xs px-2.5 py-1">
                {connectedCount} 个已连接
              </Badge>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              添加服务
            </Button>
          </div>
        </div>
      </div>

      {/* Server List */}
      <ScrollArea className="flex-1 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6">
          {servers.map((server) => (
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
            <Server className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm mb-3">还没有添加任何 MCP 服务</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              添加第一个服务
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Add Server Dialog */}
      <McpServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAddServer}
      />
    </div>
  )
}
