import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Brain,
  Database,
  ExternalLink,
  Filter,
  MessageSquareHeart,
  Plus,
  ScrollText,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { conversationService, memoryService, personaService } from '@/services'
import { useNotificationStore } from '@/stores'
import type { Conversation, LongTermMemory, Persona } from '@/types'
import { isMemoryVectorFallbackError } from '@/utils/memory-fallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scopeLabel(scope: string) {
  switch (scope) {
    case 'persona':
      return '人设记忆'
    case 'conversation':
      return '会话记忆'
    case 'user':
      return '用户记忆'
    default:
      return scope
  }
}

export function MemoryPage() {
  const navigate = useNavigate()
  const pushNotification = useNotificationStore((state) => state.push)
  const [searchParams, setSearchParams] = useSearchParams()

  const [memories, setMemories] = useState<LongTermMemory[]>([])
  const [searchResults, setSearchResults] = useState<LongTermMemory[] | null>(null)
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [personaId, setPersonaId] = useState(searchParams.get('personaId') || '')
  const [conversationId, setConversationId] = useState(searchParams.get('conversationId') || '')
  const [filterScope, setFilterScope] = useState(searchParams.get('memoryScope') || '')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newScope, setNewScope] = useState('persona')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [memoryItems, personaItems, conversationItems] = await Promise.all([
          memoryService.listLongTermMemories(),
          personaService.getPersonas(),
          conversationService.getConversations(),
        ])
        setMemories(memoryItems)
        setPersonas(personaItems)
        setConversations(conversationItems)
      }
      catch (error) {
        pushNotification({
          type: 'error',
          title: '加载记忆数据失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
    }

    void load()
  }, [pushNotification])

  useEffect(() => {
    const next = new URLSearchParams()
    if (query.trim()) next.set('query', query.trim())
    if (personaId) next.set('personaId', personaId)
    if (conversationId) next.set('conversationId', conversationId)
    if (filterScope) next.set('memoryScope', filterScope)
    setSearchParams(next, { replace: true })
  }, [conversationId, filterScope, personaId, query, setSearchParams])

  const conversationMap = useMemo(
    () => new Map(conversations.map(conversation => [conversation.id, conversation.title])),
    [conversations],
  )
  const personaMap = useMemo(
    () => new Map(personas.map(persona => [persona.id, persona.name])),
    [personas],
  )

  const selectedConversationTitle = conversationId ? conversationMap.get(conversationId) : undefined
  const selectedPersonaName = personaId ? personaMap.get(personaId) : undefined

  const filteredMemories = useMemo(() => {
    return memories.filter((item) => {
      if (personaId && item.personaId !== personaId) return false
      if (conversationId && item.conversationId !== conversationId) return false
      if (filterScope && item.memoryScope !== filterScope) return false
      if (query.trim() && !searchResults) {
        const haystack = `${item.content} ${item.tags.join(' ')}`.toLowerCase()
        if (!haystack.includes(query.trim().toLowerCase())) return false
      }
      return true
    })
  }, [conversationId, filterScope, memories, personaId, query, searchResults])

  const displayItems = searchResults ?? filteredMemories

  const stats = useMemo(() => {
    const personaCount = new Set(memories.map(item => item.personaId).filter(Boolean)).size
    const conversationCount = new Set(memories.map(item => item.conversationId).filter(Boolean)).size
    return {
      total: memories.length,
      visible: displayItems.length,
      personaCount,
      conversationCount,
    }
  }, [displayItems.length, memories])

  const scopeStats = useMemo(() => {
    const initial = { persona: 0, conversation: 0, user: 0 }
    for (const item of displayItems) {
      if (item.memoryScope === 'persona') initial.persona += 1
      else if (item.memoryScope === 'conversation') initial.conversation += 1
      else if (item.memoryScope === 'user') initial.user += 1
    }
    return initial
  }, [displayItems])

  const activeFilters = useMemo(() => {
    const items: Array<{ key: string, label: string }> = []
    if (selectedConversationTitle) {
      items.push({ key: 'conversation', label: `会话：${selectedConversationTitle}` })
    }
    if (selectedPersonaName) {
      items.push({ key: 'persona', label: `人设：${selectedPersonaName}` })
    }
    if (filterScope) {
      items.push({ key: 'scope', label: `范围：${scopeLabel(filterScope)}` })
    }
    if (query.trim()) {
      items.push({ key: 'query', label: `关键词：${query.trim()}` })
    }
    return items
  }, [filterScope, query, selectedConversationTitle, selectedPersonaName])

  async function refreshMemories() {
    const next = await memoryService.listLongTermMemories()
    setMemories(next)
  }

  async function handleSearch() {
    if (!query.trim()) {
      setSearchResults(null)
      return
    }

    setIsSearching(true)
    try {
      const results = await memoryService.searchMemories({
        query,
        personaId: personaId || undefined,
        conversationId: conversationId || undefined,
        memoryScope: filterScope || undefined,
        limit: 10,
      })
      setSearchResults(results)
    }
    catch (error) {
      if (isMemoryVectorFallbackError(error)) {
        setSearchResults(null)
        pushNotification({
          type: 'info',
          title: '记忆检索已降级',
          description: '向量检索暂不可用，已切换到本地过滤模式，不影响继续聊天。',
        })
        return
      }
      pushNotification({
        type: 'error',
        title: '搜索记忆失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSearching(false)
    }
  }

  function handleClearFilters() {
    setQuery('')
    setPersonaId('')
    setConversationId('')
    setFilterScope('')
    setSearchResults(null)
  }

  function handleRemoveFilter(key: string) {
    if (key === 'conversation') setConversationId('')
    if (key === 'persona') setPersonaId('')
    if (key === 'scope') setFilterScope('')
    if (key === 'query') {
      setQuery('')
      setSearchResults(null)
    }
  }

  async function handleCreate() {
    if (!newContent.trim()) {
      pushNotification({
        type: 'info',
        title: '内容不能为空',
        description: '请输入要写入长期记忆的内容。',
      })
      return
    }

    setIsCreating(true)
    try {
      await memoryService.createLongTermMemory({
        content: newContent.trim(),
        tags: newTags.split(',').map(tag => tag.trim()).filter(Boolean),
        memoryScope: newScope,
        personaId: personaId || undefined,
        conversationId: conversationId || undefined,
        metadata: { source: 'manual' },
      })
      await refreshMemories()
      setSearchResults(null)
      setNewContent('')
      setNewTags('')
      pushNotification({
        type: 'success',
        title: '记忆已写入',
        description: '这条长期记忆已经保存。',
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '写入记忆失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsCreating(false)
    }
  }

  async function handleSummarize() {
    if (!conversationId) {
      pushNotification({
        type: 'info',
        title: '请先选择会话',
        description: '手动生成摘要前需要先选中一个会话。',
      })
      return
    }

    setIsSummarizing(true)
    try {
      const result = await memoryService.summarizeConversation(conversationId)
      pushNotification({
        type: 'success',
        title: '摘要已生成',
        description: `已处理 ${result.sourceMessageCount} 条消息。`,
      })
      await refreshMemories()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '生成摘要失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
    finally {
      setIsSummarizing(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--color-primary)/10">
            <Brain className="h-5 w-5 text-(--color-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-bold">记忆中心</h1>
            <p className="text-sm text-(--color-muted-foreground)">
              查看、搜索并手动写入长期记忆，让 Agent 的长期状态更可见。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{stats.total} 条长期记忆</Badge>
          <Badge variant="outline">{stats.personaCount} 个人设</Badge>
          <Badge variant="outline">{stats.conversationCount} 个会话</Badge>
        </div>
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-3 text-xs text-emerald-700">
          若向量服务（Qdrant）临时不可用，记忆检索会自动降级到本地过滤，不影响聊天主链路。
        </CardContent>
      </Card>

      {activeFilters.length > 0 && (
        <Card className="border-(--color-primary)/20 bg-(--color-primary)/5">
          <CardContent className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-(--color-primary)" />
              当前正在查看特定上下文下的记忆
            </div>

            <div className="flex flex-wrap gap-2">
              {activeFilters.map(filter => (
                <Badge key={filter.key} variant="outline" className="gap-1">
                  {filter.label}
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-black/5"
                    onClick={() => handleRemoveFilter(filter.key)}
                    aria-label={`移除${filter.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {conversationId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => navigate(`/chat/${conversationId}`)}
                >
                  <MessageSquareHeart className="h-3.5 w-3.5" />
                  返回当前会话
                </Button>
              )}
              {selectedPersonaName && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => {
                    setConversationId('')
                    setSearchResults(null)
                  }}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  只看此人设记忆
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleClearFilters}>
                清空全部筛选
              </Button>
            </div>

            <div className="text-xs text-(--color-muted-foreground)">
              当前列表显示 {stats.visible} 条结果。你可以继续调整筛选条件，或者直接回到关联会话继续聊天。
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs text-(--color-muted-foreground)">会话记忆</p>
              <p className="mt-1 text-2xl font-semibold">{scopeStats.conversation}</p>
            </div>
            <MessageSquareHeart className="h-5 w-5 text-(--color-primary)/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs text-(--color-muted-foreground)">人设记忆</p>
              <p className="mt-1 text-2xl font-semibold">{scopeStats.persona}</p>
            </div>
            <Brain className="h-5 w-5 text-(--color-primary)/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs text-(--color-muted-foreground)">用户记忆</p>
              <p className="mt-1 text-2xl font-semibold">{scopeStats.user}</p>
            </div>
            <UserRound className="h-5 w-5 text-(--color-primary)/60" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              搜索与筛选
            </CardTitle>
            <CardDescription>按语义、会话、人设或记忆范围快速定位长期记忆。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="输入你想搜索的内容，比如：用户喜欢什么风格"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <select
                className="h-10 rounded-md border border-(--color-input) bg-(--color-background) px-3 text-sm"
                value={personaId}
                onChange={event => setPersonaId(event.target.value)}
              >
                <option value="">全部人设</option>
                {personas.map(persona => (
                  <option key={persona.id} value={persona.id}>{persona.name}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-(--color-input) bg-(--color-background) px-3 text-sm"
                value={conversationId}
                onChange={event => setConversationId(event.target.value)}
              >
                <option value="">全部会话</option>
                {conversations.map(conversation => (
                  <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-(--color-input) bg-(--color-background) px-3 text-sm"
                value={filterScope}
                onChange={event => setFilterScope(event.target.value)}
              >
                <option value="">全部范围</option>
                <option value="persona">人设记忆</option>
                <option value="conversation">会话记忆</option>
                <option value="user">用户记忆</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSearch()} disabled={isSearching}>
                {isSearching ? '搜索中...' : '开始搜索'}
              </Button>
              <Button variant="ghost" onClick={handleClearFilters}>
                清空筛选
              </Button>
              <Button variant="outline" onClick={() => void handleSummarize()} disabled={isSummarizing}>
                {isSummarizing ? '生成中...' : '为当前会话生成摘要'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              手动写入
            </CardTitle>
            <CardDescription>补充用户偏好、关系设定或重要事实。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-28 w-full rounded-md border border-(--color-input) bg-(--color-background) px-3 py-2 text-sm"
              placeholder="例如：用户更喜欢简洁冷静的回答风格。"
              value={newContent}
              onChange={event => setNewContent(event.target.value)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="h-10 rounded-md border border-(--color-input) bg-(--color-background) px-3 text-sm"
                value={newScope}
                onChange={event => setNewScope(event.target.value)}
              >
                <option value="persona">人设记忆</option>
                <option value="conversation">会话记忆</option>
                <option value="user">用户记忆</option>
              </select>
              <Input
                placeholder="标签，逗号分隔"
                value={newTags}
                onChange={event => setNewTags(event.target.value)}
              />
            </div>
            <Button onClick={() => void handleCreate()} disabled={isCreating} className="w-full">
              {isCreating ? '写入中...' : '写入长期记忆'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              {searchResults ? '搜索结果' : '长期记忆列表'}
            </CardTitle>
            <CardDescription>
              {searchResults
                ? `当前显示 ${displayItems.length} 条语义搜索结果。`
                : `当前显示 ${displayItems.length} 条记忆${activeFilters.length > 0 ? '，已按上下文自动收窄。' : '。'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3">
              {displayItems.map(item => (
                <div key={item.id} className="rounded-xl border border-(--color-border) bg-(--color-card) p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{scopeLabel(item.memoryScope)}</Badge>
                    {item.personaId && (
                      <Badge variant="outline">
                        人设：{personaMap.get(item.personaId) || item.personaId}
                      </Badge>
                    )}
                    {item.conversationId && (
                      <Badge variant="outline">
                        会话：{conversationMap.get(item.conversationId) || item.conversationId}
                      </Badge>
                    )}
                    <span className="text-xs text-(--color-muted-foreground)">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6">
                    {item.content}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.tags.length > 0 && item.tags.map(tag => (
                      <Badge key={tag} variant="outline">#{tag}</Badge>
                    ))}
                    {item.conversationId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() => navigate(`/chat/${item.conversationId}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        打开关联会话
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {displayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-(--color-muted-foreground)">
                  <ScrollText className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">
                    {searchResults ? '没有命中相关记忆' : '还没有可展示的记忆内容'}
                  </p>
                  <p className="mt-2 max-w-md text-center text-xs leading-5">
                    {activeFilters.length > 0
                      ? '试试放宽筛选条件，或者先为当前会话生成摘要、手动写入一条长期记忆。'
                      : '你可以从聊天页手动记住一条消息，或者在这里补充重要偏好与事实。'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
