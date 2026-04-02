import { useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  FolderOpen,
  Globe,
  Loader2,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react'
import type { MCPConnectionStatus, MCPServer } from '@/types'
import { cn, formatTime } from '@/utils'
import { MCP_TRANSPORT_LABELS } from '@/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

const STATUS_CONFIG: Record<
  MCPConnectionStatus,
  { label: string, className: string, icon: React.ReactNode }
> = {
  connected: {
    label: '已连接',
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
    icon: <Wifi className="h-3 w-3" />,
  },
  disconnected: {
    label: '未连接',
    className: 'border-gray-500/20 bg-gray-500/10 text-gray-500',
    icon: <WifiOff className="h-3 w-3" />,
  },
  checking: {
    label: '检查中',
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  error: {
    label: '错误',
    className: 'border-red-500/20 bg-red-500/10 text-red-600',
    icon: <AlertCircle className="h-3 w-3" />,
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
        <div className="mb-2 flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--color-muted)">
              {server.transportType === 'stdio' ? (
                <Terminal className="h-4.5 w-4.5 text-(--color-muted-foreground)" />
              ) : (
                <Globe className="h-4.5 w-4.5 text-(--color-muted-foreground)" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{server.name}</h3>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('h-4.5 gap-1 border px-1.5 py-0 text-[10px] font-normal', status.className)}
                >
                  {status.icon}
                  {status.label}
                </Badge>
                <Badge variant="secondary" className="h-4.5 px-1.5 py-0 text-[10px] font-normal">
                  {MCP_TRANSPORT_LABELS[server.transportType]}
                </Badge>
              </div>
            </div>
          </div>
          <Switch
            checked={server.enabled}
            onCheckedChange={checked => onToggle(server.id, checked)}
          />
        </div>

        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-(--color-muted-foreground)">
          {server.description}
        </p>

        <div className="mb-3 rounded-md bg-(--color-muted) px-3 py-1.5">
          <code className="break-all text-xs font-mono text-(--color-muted-foreground)">
            {server.address}
          </code>
        </div>

        <div className="mb-3 flex items-center gap-4 text-xs text-(--color-muted-foreground)">
          <span className="flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            工具：{server.toolCount} 个
          </span>
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" />
            资源：{server.resourceCount} 个
          </span>
          {server.lastCheckedAt && (
            <span className="ml-auto">
              上次检查：{formatTime(server.lastCheckedAt)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onCheckConnection(server.id)}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            检查连接
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-(--color-destructive) hover:bg-(--color-destructive)/10 hover:text-(--color-destructive)"
            onClick={() => onDelete(server.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>

        {((server.tools && server.tools.length > 0)
          || (server.resources && server.resources.length > 0)) && (
          <>
            <Separator className="my-3" />
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full gap-1.5 text-xs text-(--color-muted-foreground)"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                  查看详情
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                {server.tools && server.tools.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--color-muted-foreground)">
                      <Wrench className="h-3.5 w-3.5" />
                      工具列表
                    </h4>
                    <div className="space-y-1.5">
                      {server.tools.map(tool => (
                        <div
                          key={tool.name}
                          className="flex items-start gap-2 rounded-md bg-(--color-muted) px-3 py-1.5"
                        >
                          <code className="shrink-0 text-xs font-mono text-(--color-primary)">
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

                {server.resources && server.resources.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--color-muted-foreground)">
                      <FolderOpen className="h-3.5 w-3.5" />
                      资源列表
                    </h4>
                    <div className="space-y-1.5">
                      {server.resources.map(resource => (
                        <div
                          key={resource.uri}
                          className="flex items-start gap-2 rounded-md bg-(--color-muted) px-3 py-1.5"
                        >
                          <code className="shrink-0 text-xs font-mono text-(--color-primary)">
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
