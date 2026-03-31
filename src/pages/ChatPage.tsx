import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { MessageSquareHeart } from 'lucide-react'
import { useConversationStore } from '@/stores'
import { conversationService, messageService, modelService, personaService } from '@/services'
import type { ChatLayoutMode, Conversation, Message } from '@/types'
import { ChatLayout } from '@/components/chat/ChatLayout'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatModeToggle } from '@/components/chat/ChatModeToggle'
import { Live2DStage } from '@/components/live2d/Live2DStage'

function EmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-(--color-muted-foreground)">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-(--color-primary)/10 to-(--color-primary)/5 border border-(--color-primary)/10">
          <MessageSquareHeart className="h-12 w-12 text-(--color-primary)/40" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-(--color-primary)/20 animate-pulse" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-(--color-foreground)/80">选择一个会话开始聊天</h2>
        <p className="mt-2 text-sm">从左侧列表选择已有会话，或创建新的对话</p>
      </div>
    </div>
  )
}

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const {
    messages,
    isLoadingMessages,
    isSending,
    setMessages,
    addMessage,
    updateMessage,
    setIsLoadingMessages,
    setIsSending,
    setCurrentConversationId,
  } = useConversationStore()

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [layoutMode, setLayoutMode] = useState<ChatLayoutMode>('chat')
  const [personaName, setPersonaName] = useState<string>()
  const [modelName, setModelName] = useState<string>()

  useEffect(() => {
    if (!conversationId) {
      setConversation(null)
      setMessages([])
      setCurrentConversationId(null)
      return
    }

    const currentConversationId = conversationId
    setCurrentConversationId(currentConversationId)

    async function loadConversation() {
      try {
        setIsLoadingMessages(true)
        const conv = await conversationService.getConversation(currentConversationId)
        if (!conv)
          return

        setConversation(conv)
        setLayoutMode(conv.layoutMode)

        const msgs = await messageService.getMessages(currentConversationId)
        setMessages(msgs)

        const persona = await personaService.getPersona(conv.personaId)
        if (persona)
          setPersonaName(persona.name)

        const model = await modelService.getModelConfig(conv.modelConfigId)
        if (model)
          setModelName(model.name)
      }
      catch (error) {
        console.error('加载会话失败:', error)
      }
      finally {
        setIsLoadingMessages(false)
      }
    }

    void loadConversation()
  }, [conversationId, setCurrentConversationId, setIsLoadingMessages, setMessages])

  const handleSend = useCallback(
    async (content: string) => {
      if (!conversationId || isSending)
        return

      setIsSending(true)
      const userId = `temp-user-${Date.now()}`
      const assistantId = `temp-assistant-${Date.now()}`
      const tempUserMessage: Message = {
        id: userId,
        conversationId,
        role: 'user',
        content,
        status: 'done',
        senderType: 'user',
        senderName: 'User',
        attachments: [],
        createdAt: new Date().toISOString(),
      }
      const tempAssistantMessage: Message = {
        id: assistantId,
        conversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        senderType: 'assistant',
        senderName: personaName || 'Assistant',
        attachments: [],
        createdAt: new Date().toISOString(),
      }

      addMessage(tempUserMessage)
      addMessage(tempAssistantMessage)

      try {
        await messageService.streamMessage(conversationId, content, {
          onToken: (token) => {
            const current = useConversationStore.getState().messages.find(message => message.id === assistantId)
            updateMessage(assistantId, {
              content: `${current?.content || ''}${token}`,
              status: 'streaming',
            })
          },
          onFinalAnswer: async (messageId, finalContent) => {
            updateMessage(assistantId, {
              id: messageId,
              content: finalContent,
              status: 'done',
            })
            const updatedMessages = await messageService.getMessages(conversationId)
            setMessages(updatedMessages)
          },
          onStopped: () => {
            updateMessage(assistantId, { status: 'error' })
          },
        })
      }
      catch (error) {
        console.error('发送消息失败:', error)
        const fallback = await messageService.sendMessage(conversationId, content)
        setMessages([...useConversationStore.getState().messages.filter(message => message.id !== userId && message.id !== assistantId), fallback.userMessage, fallback.assistantMessage])
      }
      finally {
        setIsSending(false)
      }
    },
    [addMessage, conversationId, isSending, personaName, setIsSending, setMessages, updateMessage],
  )

  const handleStop = useCallback(() => {
    if (conversationId)
      void messageService.stopMessage(conversationId)
    setIsSending(false)
  }, [conversationId, setIsSending])

  const handleRegenerate = useCallback(async () => {
    if (!conversationId || messages.length === 0)
      return

    setIsSending(true)
    try {
      await messageService.regenerateMessage(conversationId)
      const updatedMessages = await messageService.getMessages(conversationId)
      setMessages(updatedMessages)
    }
    catch (error) {
      console.error('重新生成失败:', error)
    }
    finally {
      setIsSending(false)
    }
  }, [conversationId, messages.length, setIsSending, setMessages])

  const handleClearContext = useCallback(() => {
    setMessages([])
  }, [setMessages])

  const handleModeChange = useCallback(
    async (mode: ChatLayoutMode) => {
      setLayoutMode(mode)
      if (conversationId) {
        try {
          await conversationService.updateConversation(conversationId, { layoutMode: mode })
        }
        catch (error) {
          console.error('更新布局模式失败:', error)
        }
      }
    },
    [conversationId],
  )

  const lastMsg = messages[messages.length - 1]
  const showRegenerate = lastMsg?.role === 'assistant' && lastMsg?.status === 'done'

  if (!conversationId)
    return <EmptyConversation />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-2">
        <h1 className="text-sm font-medium truncate">{conversation?.title || '加载中...'}</h1>
        <ChatModeToggle mode={layoutMode} onModeChange={handleModeChange} />
      </div>

      <div className="flex-1 min-h-0">
        <ChatLayout
          layoutMode={layoutMode}
          messages={messages}
          isLoading={isLoadingMessages}
          live2dSlot={(
            <Live2DStage
              state={isSending ? 'thinking' : 'idle'}
              compact={layoutMode === 'chat'}
              full={layoutMode === 'companion'}
            />
          )}
          inputSlot={(
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              onRegenerate={showRegenerate ? handleRegenerate : undefined}
              onClearContext={handleClearContext}
              isSending={isSending}
              personaName={personaName}
              modelName={modelName}
              skillCount={conversation?.enabledSkillIds.length}
              mcpCount={conversation?.enabledMcpServerIds.length}
            />
          )}
        />
      </div>
    </div>
  )
}
