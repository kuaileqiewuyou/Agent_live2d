import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Brain, Cable, MoreHorizontal, Pencil, Pin, Plus, Sparkles, Trash2 } from 'lucide-react'
import { cn, formatTime } from '@/utils'
import {
  conversationService,
  createNewOpsConversation,
  getExistingOpsPersonaId,
  memoryService,
  OPS_PERSONA_NAME,
} from '@/services'
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
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [opsPersonaId, setOpsPersonaId] = useState<string | null>(null)
  const [isCreatingOpsConversation, setIsCreatingOpsConversation] = useState(false)
  const lastAutoFocusKeyRef = useRef('')
  const adjustedSearchForPersonaFilterRef = useRef('')
  const personaFilterId = searchParams.get('personaId')?.trim() || ''
  const personaFilterName = searchParams.get('personaName')?.trim() || ''

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
      const [conversationItems, memories, nextOpsPersonaId] = await Promise.all([
        conversationService.getConversations(),
        memoryService.listLongTermMemories(),
        getExistingOpsPersonaId().catch(() => null),
      ])

      const nextMemoryCountMap = memories.reduce<Record<string, number>>((acc, memory) => {
        if (!memory.conversationId) return acc
        acc[memory.conversationId] = (acc[memory.conversationId] || 0) + 1
        return acc
      }, {})

      setConversations(conversationItems)
      setMemoryCountMap(nextMemoryCountMap)
      setOpsPersonaId(nextOpsPersonaId)
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '加载会话列表失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }

  const personaMatched = personaFilterId
    ? conversations.filter(conversation => conversation.personaId === personaFilterId)
    : conversations

  const filtered = personaMatched.filter((conversation) => {
    return conversation.title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const opsConversations = opsPersonaId
    ? filtered.filter(conversation => conversation.personaId === opsPersonaId)
    : []

  const regularConversations = filtered.filter(
    conversation => !opsPersonaId || conversation.personaId !== opsPersonaId,
  )

  const pinned = regularConversations.filter(conversation => conversation.pinned)
  const unpinned = regularConversations.filter(conversation => !conversation.pinned)

  useEffect(() => {
    if (!personaFilterId) {
      adjustedSearchForPersonaFilterRef.current = ''
      return
    }

    if (!searchQuery.trim()) {
      return
    }

    if (filtered.length > 0 || personaMatched.length === 0) {
      return
    }

    if (adjustedSearchForPersonaFilterRef.current === personaFilterId) {
      return
    }

    adjustedSearchForPersonaFilterRef.current = personaFilterId
    setSearchQuery('')
    pushNotification({
      type: 'info',
      title: '已清空会话搜索',
      description: '为了展示当前 Persona 相关会话，已临时清空搜索词。',
    })
  }, [
    filtered.length,
    personaFilterId,
    personaMatched.length,
    pushNotification,
    searchQuery,
    setSearchQuery,
  ])

  useEffect(() => {
    if (!personaFilterId || filtered.length === 0) {
      return
    }

    const currentMatched = Boolean(
      conversationId && filtered.some(conversation => conversation.id === conversationId),
    )
    if (currentMatched) {
      return
    }

    const firstConversation = filtered[0]
    const autoFocusKey = `${personaFilterId}:${firstConversation.id}`
    if (lastAutoFocusKeyRef.current === autoFocusKey) {
      return
    }
    lastAutoFocusKeyRef.current = autoFocusKey

    pushNotification({
      type: 'info',
      title: '已自动定位会话',
      description: `已为当前 Persona 过滤定位到 “${firstConversation.title}”。`,
    })

    const query = searchParams.toString()
    const target = query
      ? `/chat/${firstConversation.id}?${query}`
      : `/chat/${firstConversation.id}`
    navigate(target, { replace: true })
  }, [conversationId, filtered, navigate, personaFilterId, pushNotification, searchParams])

  function clearPersonaFilter() {
    lastAutoFocusKeyRef.current = ''
    adjustedSearchForPersonaFilterRef.current = ''
    const next = new URLSearchParams(searchParams)
    next.delete('personaId')
    next.delete('personaName')
    setSearchParams(next)
    pushNotification({
      type: 'info',
      title: '已清除 Persona 过滤',
      description: '会话列表已恢复默认视图。',
    })
  }

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
        description: error instanceof Error ? error.message : '请稍后重试。',
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
        description: error instanceof Error ? error.message : '请稍后重试。',
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
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }

  async function handleCreateOpsConversation() {
    setIsCreatingOpsConversation(true)
    try {
      const conversation = await createNewOpsConversation()
      await loadConversations()
      navigate(`/chat/${conversation.id}`)
      pushNotification({
        type: 'success',
        title: '已新建运维会话',
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '新建运维会话失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setIsCreatingOpsConversation(false)
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
        {personaFilterId && (
          <div className="mt-2 flex items-center justify-between rounded-md border border-(--color-border) bg-(--color-card) px-2 py-1">
            <div className="min-w-0 flex items-center gap-2">
              <span className="truncate text-[11px] text-(--color-muted-foreground)">
                Persona 过滤：{personaFilterName || personaFilterId}
              </span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {filtered.length}
              </Badge>
            </div>
            <button
              type="button"
              className="ml-2 rounded px-1.5 py-0.5 text-[11px] text-(--color-primary) hover:bg-(--color-muted)"
              onClick={clearPersonaFilter}
            >
              清除
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="overflow-x-hidden px-2 pb-2">
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
              {searchQuery
                ? '没有找到匹配的会话。'
                : (personaFilterId ? '当前 Persona 过滤下没有会话。' : '还没有会话，先创建一个吧。')}
            </div>
          )}

          <div className="mt-3 border-t border-(--color-border) pt-2">
            <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-(--color-muted-foreground)">
              <span>{OPS_PERSONA_NAME}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-(--color-primary) hover:bg-(--color-muted) disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleCreateOpsConversation()}
                disabled={isCreatingOpsConversation}
              >
                <Plus className="h-3 w-3" />
                {isCreatingOpsConversation ? '创建中...' : '新建'}
              </button>
            </div>

            {opsConversations.length > 0 ? (
              opsConversations.map(conversation => (
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
              ))
            ) : (
              <div className="px-3 py-2 text-[11px] text-(--color-muted-foreground)">
                暂无运维助手会话。
              </div>
            )}
          </div>
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
        'group flex w-full min-w-0 cursor-pointer items-start gap-2.5 overflow-hidden rounded-md px-2 py-2 transition-colors hover:bg-(--color-accent)',
        isActive && 'bg-(--color-accent) text-(--color-accent-foreground)',
      )}
      onClick={onClick}
    >
      <Avatar className="h-8 w-8 shrink-0 text-xs">
        <AvatarFallback>{title.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-1">
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
            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium">
              {pinned && <Pin className="h-3 w-3 shrink-0 text-(--color-muted-foreground)" />}
              <span className="min-w-0 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [overflow-wrap:anywhere]">
                {title}
              </span>
            </span>
          )}
          <span className="shrink-0 text-[10px] text-(--color-muted-foreground)">
            {formatTime(updatedAt)}
          </span>
        </div>

        {lastMessage && (
          <p className="mt-0.5 overflow-hidden text-xs text-(--color-muted-foreground) [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [overflow-wrap:anywhere]">
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

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="mt-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-(--color-muted) group-hover:opacity-100 focus-visible:opacity-100"
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
    </div>
  )
}
