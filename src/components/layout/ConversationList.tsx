import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn, formatTime } from '@/utils'
import { useConversationStore } from '@/stores'
import { conversationService } from '@/services'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

interface ConversationListProps {
  collapsed: boolean
}

export function ConversationList({ collapsed }: ConversationListProps) {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const {
    conversations,
    setConversations,
    searchQuery,
    setSearchQuery,
  } = useConversationStore()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  async function loadConversations() {
    const data = await conversationService.getConversations()
    setConversations(data)
  }

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const pinned = filtered.filter((c) => c.pinned)
  const unpinned = filtered.filter((c) => !c.pinned)

  async function handleRename(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null)
      return
    }
    await conversationService.updateConversation(id, { title: renameValue.trim() })
    await loadConversations()
    setRenamingId(null)
  }

  async function handleTogglePin(id: string, currentPinned: boolean) {
    await conversationService.updateConversation(id, { pinned: !currentPinned })
    await loadConversations()
  }

  async function handleDelete(id: string) {
    await conversationService.deleteConversation(id)
    await loadConversations()
    if (conversationId === id) {
      navigate('/chat')
    }
  }

  function startRename(id: string, currentTitle: string) {
    setRenamingId(id)
    setRenameValue(currentTitle)
  }

  if (collapsed) {
    return null
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="px-3 py-2">
        <Input
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-xs font-medium text-(--color-muted-foreground)">
                置顶
              </div>
              {pinned.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  id={conv.id}
                  title={conv.title}
                  lastMessage={conv.lastMessage}
                  updatedAt={conv.updatedAt}
                  pinned={conv.pinned}
                  isActive={conversationId === conv.id}
                  isRenaming={renamingId === conv.id}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  onStartRename={() => startRename(conv.id, conv.title)}
                  onConfirmRename={() => handleRename(conv.id)}
                  onTogglePin={() => handleTogglePin(conv.id, conv.pinned)}
                  onDelete={() => handleDelete(conv.id)}
                />
              ))}
            </div>
          )}

          {/* Unpinned section */}
          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <div className="px-2 py-1.5 text-xs font-medium text-(--color-muted-foreground)">
                  全部会话
                </div>
              )}
              {unpinned.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  id={conv.id}
                  title={conv.title}
                  lastMessage={conv.lastMessage}
                  updatedAt={conv.updatedAt}
                  pinned={conv.pinned}
                  isActive={conversationId === conv.id}
                  isRenaming={renamingId === conv.id}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  onStartRename={() => startRename(conv.id, conv.title)}
                  onConfirmRename={() => handleRename(conv.id)}
                  onTogglePin={() => handleTogglePin(conv.id, conv.pinned)}
                  onDelete={() => handleDelete(conv.id)}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-(--color-muted-foreground)">
              暂无会话
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface ConversationItemProps {
  id: string
  title: string
  lastMessage?: string
  updatedAt: string
  pinned: boolean
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (v: string) => void
  onClick: () => void
  onStartRename: () => void
  onConfirmRename: () => void
  onTogglePin: () => void
  onDelete: () => void
}

function ConversationItem({
  title,
  lastMessage,
  updatedAt,
  pinned,
  isActive,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onClick,
  onStartRename,
  onConfirmRename,
  onTogglePin,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 rounded-md px-2 py-2 cursor-pointer transition-colors',
        'hover:bg-(--color-accent)',
        isActive && 'bg-(--color-accent) text-(--color-accent-foreground)',
      )}
      onClick={onClick}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 text-xs">
        <AvatarFallback>{title.charAt(0)}</AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onConfirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmRename()
                if (e.key === 'Escape') onConfirmRename()
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-5 text-xs px-1 py-0"
              autoFocus
            />
          ) : (
            <span className="text-sm font-medium truncate flex items-center gap-1">
              {pinned && <Pin className="h-3 w-3 shrink-0 text-(--color-muted-foreground)" />}
              {title}
            </span>
          )}
          <span className="text-[10px] text-(--color-muted-foreground) shrink-0">
            {formatTime(updatedAt)}
          </span>
        </div>
        {lastMessage && (
          <p className="text-xs text-(--color-muted-foreground) truncate mt-0.5">
            {lastMessage}
          </p>
        )}
      </div>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 p-0.5 rounded hover:bg-(--color-muted) transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4 text-(--color-muted-foreground)" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onStartRename()
            }}
          >
            <Pencil className="h-4 w-4" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin()
            }}
          >
            <Pin className="h-4 w-4" />
            {pinned ? '取消置顶' : '置顶'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-(--color-destructive)"
            onClick={(e) => {
              e.stopPropagation()
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
