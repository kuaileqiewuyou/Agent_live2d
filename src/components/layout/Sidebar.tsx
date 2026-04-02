import { useLocation } from 'react-router-dom'
import {
  Brain,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Server,
  Settings,
  Settings2,
  UserCircle,
  Zap,
} from 'lucide-react'
import { cn } from '@/utils'
import { APP_NAME } from '@/constants'
import { useAppStore, useUIStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConversationList } from '@/components/layout/ConversationList'
import { NavItem } from '@/components/layout/NavItem'

const NAV_ITEMS = [
  { to: '/chat', icon: <MessageSquare className="h-5 w-5" />, label: '聊天' },
  { to: '/personas', icon: <UserCircle className="h-5 w-5" />, label: '人设' },
  { to: '/model-config', icon: <Settings2 className="h-5 w-5" />, label: '模型配置' },
  { to: '/skills', icon: <Zap className="h-5 w-5" />, label: 'Skill' },
  { to: '/mcp', icon: <Server className="h-5 w-5" />, label: 'MCP 服务' },
  { to: '/memory', icon: <Brain className="h-5 w-5" />, label: '记忆' },
  { to: '/settings', icon: <Settings className="h-5 w-5" />, label: '设置' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const { setShowNewConversationDialog } = useUIStore()
  const location = useLocation()
  const isChatRoute = location.pathname.startsWith('/chat')

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-(--color-border) bg-(--color-background)/80 backdrop-blur-sm transition-[width] duration-200 ease-in-out',
          sidebarCollapsed ? 'w-16' : 'w-70',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-(--color-border)',
            sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-primary) text-sm font-bold text-(--color-primary-foreground)">
            AI
          </div>
          {!sidebarCollapsed && (
            <span className="truncate text-base font-semibold">{APP_NAME}</span>
          )}
        </div>

        <nav
          className={cn(
            'flex shrink-0 flex-col gap-0.5',
            sidebarCollapsed ? 'px-2 py-2' : 'px-3 py-2',
          )}
        >
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              collapsed={sidebarCollapsed}
            />
          ))}
        </nav>

        {isChatRoute && (
          <>
            <Separator />
            <div
              className={cn(
                'shrink-0 py-2',
                sidebarCollapsed ? 'px-2' : 'px-3',
              )}
            >
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full"
                      onClick={() => setShowNewConversationDialog(true)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">新建会话</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-sm"
                  onClick={() => setShowNewConversationDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                  新建会话
                </Button>
              )}
            </div>
            <ConversationList collapsed={sidebarCollapsed} />
          </>
        )}

        {!isChatRoute && <div className="flex-1" />}

        <div
          className={cn(
            'shrink-0 border-t border-(--color-border) py-2',
            sidebarCollapsed ? 'px-2' : 'px-3',
          )}
        >
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full"
                  onClick={toggleSidebar}
                >
                  <PanelLeftOpen className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">展开侧栏</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm text-(--color-muted-foreground)"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-5 w-5" />
              收起侧栏
            </Button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
