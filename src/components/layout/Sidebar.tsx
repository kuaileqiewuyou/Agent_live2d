import { useLocation } from 'react-router-dom'
import {
  MessageSquare,
  UserCircle,
  Settings2,
  Zap,
  Server,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore, useUIStore } from '@/stores'
import { APP_NAME } from '@/constants'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NavItem } from '@/components/layout/NavItem'
import { ConversationList } from '@/components/layout/ConversationList'

const NAV_ITEMS = [
  { to: '/chat', icon: <MessageSquare className="h-5 w-5" />, label: '聊天' },
  { to: '/personas', icon: <UserCircle className="h-5 w-5" />, label: '人设' },
  { to: '/model-config', icon: <Settings2 className="h-5 w-5" />, label: '模型配置' },
  { to: '/skills', icon: <Zap className="h-5 w-5" />, label: '技能' },
  { to: '/mcp', icon: <Server className="h-5 w-5" />, label: 'MCP 服务' },
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
          'flex flex-col h-full border-r border-(--color-border) bg-(--color-background)/80 backdrop-blur-sm transition-[width] duration-200 ease-in-out',
          sidebarCollapsed ? 'w-16' : 'w-70',
        )}
      >
        {/* Logo area */}
        <div
          className={cn(
            'flex items-center h-14 shrink-0 border-b border-(--color-border)',
            sidebarCollapsed ? 'justify-center px-2' : 'px-4 gap-3',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-primary) text-(--color-primary-foreground) font-bold text-sm">
            AI
          </div>
          {!sidebarCollapsed && (
            <span className="text-base font-semibold truncate">{APP_NAME}</span>
          )}
        </div>

        {/* Navigation links */}
        <nav
          className={cn(
            'flex flex-col gap-0.5 shrink-0',
            sidebarCollapsed ? 'px-2 py-2' : 'px-3 py-2',
          )}
        >
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              collapsed={sidebarCollapsed}
            />
          ))}
        </nav>

        {/* Chat-specific section: new conversation button + conversation list */}
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

        {/* Spacer */}
        {!isChatRoute && <div className="flex-1" />}

        {/* Bottom: collapse toggle */}
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
