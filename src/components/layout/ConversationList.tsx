import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Brain, Cable, MoreHorizontal, Pencil, Pin, Sparkles, Trash2 } from 'lucide-react'
import { cn, formatTime } from '@/utils'
import { conversationService, memoryService } from '@/services'
import { useConversationStore, useNotificationStore } from '@/stores'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ConversationListProps {
  collapsed: boolean
}

const CONVERSATION_META_UPDATED_EVENT = 'conversation-meta-updated'

export function ConversationList({ collapsed }: ConversationListProps) {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const pushNotification = useNotificationStore((state) => state.push)
  const {
    conversations,
    setConversations,
    searchQuery,
    setSearchQuery,
  } = useConversationStore()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [memoryCountMap, setMemoryCountMap] = useState<Record<string, number>>({})

  useEffect(() => {
    void loadConversations()
  }, [])

  useEffect(() => {
    const handleMetaUpdated = () => {
      void loadConversations()
    }

    window.addEventListener(CONVERSATION_META_UPDATED_EVENT, handleMetaUpdated)
    return () => {
      window.removeEventListener(CONVERSATION_META_UPDATED_EVENT, handleMetaUpdated)
    }
  }, [])

  async function loadConversations() {
    try {
      const [conversationItems, memories] = await Promise.all([
        conversationService.getConversations(),
        memoryService.listLongTermMemories(),
      ])

      const nextMemoryCountMap = memories.reduce<Record<string, number>>((acc, memory) => {
        if (!memory.conversationId) return acc
        acc[memory.conversationId] = (acc[memory.conversationId] || 0) + 1
        return acc
      }, {})

      setConversations(conversationItems)
      setMemoryCountMap(nextMemoryCountMap)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载会话列表失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  const filtered = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(searchQuery.toLowerCase()),
  )
  const pinned = filtered.filter(conversation => conversation.pinned)
  const unpinned = filtered.filter(conversation => !conversation.pinned)

  async function handleRename(id: string) {
    const nextTitle = renameValue.trim()
    if (!nextTitle) {
      setRenamingId(null)
      setRenameValue('')
      return
    }

    try {
      await conversationService.updateConversation(id, { title: nextTitle })
      await loadConversations()
      setRenamingId(null)
      setRenameValue('')
      pushNotification({
        type: 'success',
        title: '会话已重命名',
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '重命名会话失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  async function handleTogglePin(id: string, currentPinned: boolean) {
    try {
      await conversationService.updateConversation(id, { pinned: !currentPinned })
      await loadConversations()
      pushNotification({
        type: 'success',
        title: currentPinned ? '已取消置顶' : '已置顶会话',
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '更新置顶状态失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  async function handleDelete(id: string) {
    try {
      await conversationService.deleteConversation(id)
      await loadConversations()
      pushNotification({
        type: 'success',
        title: '会话已删除',
      })
      if (conversationId === id) {
        navigate('/chat')
      }
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '删除会话失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  function startRename(id: string, currentTitle: string) {
    setRenamingId(id)
    setRenameValue(currentTitle)
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  if (collapsed) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2">
        <Input
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          className="h-8 text-xs"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {pinned.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-xs font-medium text-(--color-muted-foreground)">
                已置顶
              </div>
              {pinned.map(conversation => (
                <ConversationItem
                  key={conversation.id}
                  title={conversation.title}
                  lastMessage={conversation.lastMessage}
                  updatedAt={conversation.updatedAt}
                  pinned={conversation.pinned}
                  skillCount={conversation.enabledSkillIds.length}
                  mcpCount={conversation.enabledMcpServerIds.length}
                  memoryCount={memoryCountMap[conversation.id] || 0}
                  isActive={conversationId === conversation.id}
                  isRenaming={renamingId === conversation.id}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                  onStartRename={() => startRename(conversation.id, conversation.title)}
                  onConfirmRename={() => handleRename(conversation.id)}
                  onCancelRename={cancelRename}
                  onTogglePin={() => handleTogglePin(conversation.id, conversation.pinned)}
                  onDelete={() => handleDelete(conversation.id)}
                />
              ))}
            </div>
          )}

          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <div className="px-2 py-1.5 text-xs font-medium text-(--color-muted-foreground)">
                  全部会话
                </div>
              )}
              {unpinned.map(conversation => (
                <ConversationItem
                  key={conversation.id}
                  title={conversation.title}
                  lastMessage={conversation.lastMessage}
                  updatedAt={conversation.updatedAt}
                  pinned={conversation.pinned}
                  skillCount={conversation.enabledSkillIds.length}
                  mcpCount={conversation.enabledMcpServerIds.length}
                  memoryCount={memoryCountMap[conversation.id] || 0}
                  isActive={conversationId === conversation.id}
                  isRenaming={renamingId === conversation.id}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                  onStartRename={() => startRename(conversation.id, conversation.title)}
                  onConfirmRename={() => handleRename(conversation.id)}
                  onCancelRename={cancelRename}
                  onTogglePin={() => handleTogglePin(conversation.id, conversation.pinned)}
                  onDelete={() => handleDelete(conversation.id)}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-(--color-muted-foreground)">
              {searchQuery ? '没有找到匹配的会话。' : '还没有会话，先创建一个吧。'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface ConversationItemProps {
  title: string
  lastMessage?: string
  updatedAt: string
  pinned: boolean
  skillCount: number
  mcpCount: number
  memoryCount: number
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (value: string) => void
  onClick: () => void
  onStartRename: () => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onTogglePin: () => void
  onDelete: () => void
}

function ConversationItem({
  title,
  lastMessage,
  updatedAt,
  pinned,
  skillCount,
  mcpCount,
  memoryCount,
  isActive,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onClick,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onTogglePin,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-(--color-accent)',
        isActive && 'bg-(--color-accent) text-(--color-accent-foreground)',
      )}
      onClick={onClick}
    >
      <Avatar className="h-8 w-8 shrink-0 text-xs">
        <AvatarFallback>{title.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={event => onRenameValueChange(event.target.value)}
              onBlur={onConfirmRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onConfirmRename()
                if (event.key === 'Escape') onCancelRename()
              }}
              onClick={event => event.stopPropagation()}
              className="h-5 px-1 py-0 text-xs"
              autoFocus
            />
          ) : (
            <span className="flex items-center gap-1 truncate text-sm font-medium">
              {pinned && <Pin className="h-3 w-3 shrink-0 text-(--color-muted-foreground)" />}
              {title}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-(--color-muted-foreground)">
            {formatTime(updatedAt)}
          </span>
        </div>

        {lastMessage && (
          <p className="mt-0.5 truncate text-xs text-(--color-muted-foreground)">
            {lastMessage}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {skillCount > 0 && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Sparkles className="h-3 w-3" />
              {skillCount}
            </Badge>
          )}
          {mcpCount > 0 && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Cable className="h-3 w-3" />
              {mcpCount}
            </Badge>
          )}
          {memoryCount > 0 && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
              <Brain className="h-3 w-3" />
              {memoryCount}
            </Badge>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="mt-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-(--color-muted) group-hover:opacity-100"
            onClick={event => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4 text-(--color-muted-foreground)" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation()
              onStartRename()
            }}
          >
            <Pencil className="h-4 w-4" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation()
              onTogglePin()
            }}
          >
            <Pin className="h-4 w-4" />
            {pinned ? '取消置顶' : '置顶'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-(--color-destructive)"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
