import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  FolderOpen,
  Globe,
  KeyRound,
  Loader2,
  ShieldCheck,
  Terminal,
  Timer,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react'
import type { MCPConnectionStatus, MCPSmokeResult, MCPServer } from '@/types'
import { cn, formatTime } from '@/utils'
import { MCP_TRANSPORT_LABELS } from '@/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    label: '异常',
    className: 'border-red-500/20 bg-red-500/10 text-red-600',
    icon: <AlertCircle className="h-3 w-3" />,
  },
}

interface McpServerCardProps {
  server: MCPServer
  onToggle: (id: string, enabled: boolean) => void
  onCheckConnection: (id: string) => void
  onSmokeConnection: (id: string) => void
  onDelete: (id: string) => void
  checking: boolean
  smoking: boolean
  smokeResult?: MCPSmokeResult
}

function sourceLabel(source?: string) {
  if (source === 'probe') return '实时探测'
  if (source === 'cache') return '缓存回填'
  return '未知来源'
}

function authSummary(server: MCPServer) {
  const auth = server.advancedConfig?.auth
  if (!auth) return '无'
  if (auth.type === 'bearer') return 'Bearer Token'
  if (auth.type === 'basic') return 'Basic Auth'
  if (auth.type === 'apiKey') return `API Key (${auth.headerName || 'Header'})`
  return '无'
}

function renderKvPreview(title: string, payload?: Record<string, string>) {
  if (!payload || Object.keys(payload).length === 0) return null

  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-(--color-muted-foreground)">{title}</div>
      <div className="grid gap-1 rounded-md border border-(--color-border) bg-(--color-muted)/20 p-2 text-[11px]">
        {Object.entries(payload).slice(0, 4).map(([key, value]) => (
          <div key={key} className="flex gap-1.5">
            <code className="shrink-0 text-(--color-primary)">{key}</code>
            <span className="truncate text-(--color-muted-foreground)">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function McpServerCard({
  server,
  onToggle,
  onCheckConnection,
  onSmokeConnection,
  onDelete,
  checking,
  smoking,
  smokeResult,
}: McpServerCardProps) {
  const [expanded, setExpanded] = useState(false)

  const status = checking
    ? STATUS_CONFIG.checking
    : STATUS_CONFIG[server.connectionStatus]

  const detailLine = useMemo(() => {
    const capabilityDetail = server.capabilityMeta?.detail || server.lastCheckDetail
    if (!capabilityDetail) return null
    return capabilityDetail.length > 120 ? `${capabilityDetail.slice(0, 120)}...` : capabilityDetail
  }, [server.capabilityMeta?.detail, server.lastCheckDetail])

  const hasCapabilities =
    (server.tools && server.tools.length > 0)
    || (server.resources && server.resources.length > 0)
    || (server.prompts && server.prompts.length > 0)

  const smokeSummary = useMemo(() => {
    if (!smokeResult) return null
    const total = smokeResult.steps.length
    const passed = smokeResult.steps.filter(step => step.ok).length
    if (smokeResult.ok) {
      const toolSuffix = smokeResult.usedToolName ? ` · 工具 ${smokeResult.usedToolName}` : ''
      return {
        variant: 'success' as const,
        title: `一键验收通过：${passed}/${total} steps passed${toolSuffix}`,
      }
    }
    const failedStep = smokeResult.steps.find(step => !step.ok && step.status !== 'skipped')
      || smokeResult.steps.find(step => !step.ok)
    const categorySuffix = failedStep?.errorCategory ? `（${failedStep.errorCategory}）` : ''
    return {
      variant: 'error' as const,
      title: `一键验收失败：${failedStep?.name || 'unknown'}${categorySuffix}`,
    }
  }, [smokeResult])

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
          {server.description || '未填写描述'}
        </p>

        <div className="mb-3 rounded-md bg-(--color-muted) px-3 py-1.5">
          <code className="break-all text-xs font-mono text-(--color-muted-foreground)">
            {server.address}
          </code>
        </div>

        {detailLine && (
          <div className="mb-3 rounded-md border border-(--color-border) bg-(--color-background) px-3 py-2 text-xs text-(--color-muted-foreground)">
            连接详情：{detailLine}
          </div>
        )}

        {smokeSummary && (
          <div
            className={cn(
              'mb-3 rounded-md border px-3 py-2 text-xs',
              smokeSummary.variant === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                : 'border-red-500/20 bg-red-500/10 text-red-700',
            )}
          >
            {smokeSummary.title}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-(--color-muted-foreground)">
          <span className="flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            工具：{server.toolCount} 个
          </span>
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" />
            资源：{server.resourceCount} 个
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            Prompt：{server.promptCount || 0} 个
          </span>
          {server.lastCheckedAt && (
            <span>
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
            disabled={checking || smoking}
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            连接测试
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onSmokeConnection(server.id)}
            disabled={checking || smoking}
          >
            {smoking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            一键验收
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
            <div className="rounded-md border border-(--color-border) bg-(--color-muted)/20 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--color-muted-foreground)">
                <ShieldCheck className="h-3.5 w-3.5" />
                连接测试详情
              </div>
              <div className="space-y-1 text-[11px] text-(--color-muted-foreground)">
                <div>来源：{sourceLabel(server.capabilityMeta?.source)}</div>
                <div>最近探测：{server.capabilityMeta?.checkedAt ? formatTime(server.capabilityMeta.checkedAt) : '暂无'}</div>
                <div>最近成功：{server.capabilityMeta?.lastSuccessAt ? formatTime(server.capabilityMeta.lastSuccessAt) : '暂无'}</div>
                <div>最近错误：{server.capabilityMeta?.lastError || '无'}</div>
              </div>
            </div>

            {smokeResult && (
              <div className="rounded-md border border-(--color-border) bg-(--color-muted)/20 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--color-muted-foreground)">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  一键验收详情
                </div>
                <div className="mb-2 text-[11px] text-(--color-muted-foreground)">
                  {smokeResult.summary || '无摘要'}
                </div>
                <div className="space-y-1.5">
                  {smokeResult.steps.map(step => (
                    <div
                      key={step.name}
                      className={cn(
                        'rounded-md border px-2.5 py-1.5 text-[11px]',
                        step.ok
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-red-500/20 bg-red-500/5',
                      )}
                    >
                      <div className="font-medium">
                        {step.name} · {step.status}
                        {step.errorCategory ? ` · ${step.errorCategory}` : ''}
                      </div>
                      <div className="text-(--color-muted-foreground)">{step.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-md border border-(--color-border) bg-(--color-muted)/20 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--color-muted-foreground)">
                <KeyRound className="h-3.5 w-3.5" />
                高级配置
              </div>

              <div className="grid gap-2 text-[11px] text-(--color-muted-foreground)">
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  <span>timeoutMs：{server.advancedConfig?.timeoutMs || '默认'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>认证方式：{authSummary(server)}</span>
                </div>
                {server.transportType === 'stdio' && (
                  <div>
                    args：{server.advancedConfig?.args?.length ? server.advancedConfig.args.join(' ') : '无'}
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-2">
                {renderKvPreview('Headers', server.advancedConfig?.headers)}
                {server.transportType === 'stdio' && renderKvPreview('Env', server.advancedConfig?.env)}
              </div>
            </div>

            {hasCapabilities && (
              <div className="space-y-3">
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
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

