import { useState } from 'react'
import {
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Terminal,
  Globe,
  Trash2,
  ChevronDown,
  Wrench,
  FolderOpen,
} from 'lucide-react'
import type { MCPServer, MCPConnectionStatus } from '@/types'
import { cn } from '@/utils'
import { formatTime } from '@/utils'
import { MCP_TRANSPORT_LABELS } from '@/constants'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'

const STATUS_CONFIG: Record<
  MCPConnectionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  connected: {
    label: '已连接',
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    icon: <Wifi className="w-3 h-3" />,
  },
  disconnected: {
    label: '未连接',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    icon: <WifiOff className="w-3 h-3" />,
  },
  checking: {
    label: '检查中',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  error: {
    label: '错误',
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
    icon: <AlertCircle className="w-3 h-3" />,
  },
}

interface McpServerCardProps {
  server: MCPServer
  onToggle: (id: string, enabled: boolean) => void
  onCheckConnection: (id: string) => void
  onDelete: (id: string) => void
  checking: boolean
}

export function McpServerCard({
  server,
  onToggle,
  onCheckConnection,
  onDelete,
  checking,
}: McpServerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const status = checking
    ? STATUS_CONFIG.checking
    : STATUS_CONFIG[server.connectionStatus]

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        !server.enabled && 'opacity-60',
      )}
    >
      <CardContent className="p-5">
        {/* Header: name + status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--color-muted) shrink-0">
              {server.transportType === 'stdio' ? (
                <Terminal className="w-4.5 h-4.5 text-(--color-muted-foreground)" />
              ) : (
                <Globe className="w-4.5 h-4.5 text-(--color-muted-foreground)" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{server.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="outline"
                  className={cn('text-[10px] px-1.5 py-0 h-4.5 gap-1 font-normal border', status.className)}
                >
                  {status.icon}
                  {status.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 font-normal">
                  {MCP_TRANSPORT_LABELS[server.transportType]}
                </Badge>
              </div>
            </div>
          </div>
          <Switch
            checked={server.enabled}
            onCheckedChange={(checked) => onToggle(server.id, checked)}
          />
        </div>

        {/* Description */}
        <p className="text-xs text-(--color-muted-foreground) line-clamp-2 mb-3 leading-relaxed">
          {server.description}
        </p>

        {/* Address */}
        <div className="bg-(--color-muted) rounded-md px-3 py-1.5 mb-3">
          <code className="text-xs font-mono text-(--color-muted-foreground) break-all">
            {server.address}
          </code>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-(--color-muted-foreground) mb-3">
          <span className="flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5" />
            工具: {server.toolCount} 个
          </span>
          <span className="flex items-center gap-1">
            <FolderOpen className="w-3.5 h-3.5" />
            资源: {server.resourceCount} 个
          </span>
          {server.lastCheckedAt && (
            <span className="ml-auto">
              上次检查: {formatTime(server.lastCheckedAt)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => onCheckConnection(server.id)}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            检查连接
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-(--color-destructive) hover:text-(--color-destructive) hover:bg-(--color-destructive)/10 gap-1.5"
            onClick={() => onDelete(server.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </Button>
        </div>

        {/* Expandable tools & resources */}
        {((server.tools && server.tools.length > 0) ||
          (server.resources && server.resources.length > 0)) && (
          <>
            <Separator className="my-3" />
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs gap-1.5 text-(--color-muted-foreground)"
                >
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                  查看详情
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                {/* Tools */}
                {server.tools && server.tools.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-(--color-muted-foreground) mb-2 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      工具列表
                    </h4>
                    <div className="space-y-1.5">
                      {server.tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="flex items-start gap-2 px-3 py-1.5 bg-(--color-muted) rounded-md"
                        >
                          <code className="text-xs font-mono text-(--color-primary) shrink-0">
                            {tool.name}
                          </code>
                          <span className="text-[11px] text-(--color-muted-foreground)">
                            {tool.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resources */}
                {server.resources && server.resources.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-(--color-muted-foreground) mb-2 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" />
                      资源列表
                    </h4>
                    <div className="space-y-1.5">
                      {server.resources.map((resource) => (
                        <div
                          key={resource.uri}
                          className="flex items-start gap-2 px-3 py-1.5 bg-(--color-muted) rounded-md"
                        >
                          <code className="text-xs font-mono text-(--color-primary) shrink-0">
                            {resource.name}
                          </code>
                          {resource.description && (
                            <span className="text-[11px] text-(--color-muted-foreground)">
                              {resource.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  )
}
