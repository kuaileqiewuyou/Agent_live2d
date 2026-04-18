/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConversationList } from '@/components/layout/ConversationList'
import { useConversationStore, useNotificationStore } from '@/stores'
import type { Conversation } from '@/types'

const navigateMock = vi.fn()
const setSearchParamsMock = vi.fn()
const pushNotificationMock = vi.fn()

const longToken = 'LONG_UNBROKEN_CONTENT_'.repeat(60)

const mockConversation: Conversation = {
  id: 'conversation-long',
  title: `会话-${longToken}`,
  personaId: 'persona-1',
  layoutMode: 'chat',
  modelConfigId: 'model-1',
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  pinned: false,
  createdAt: '2026-04-11T10:00:00.000Z',
  updatedAt: '2026-04-11T11:00:00.000Z',
  lastMessage: longToken,
}

const getConversationsMock = vi.fn(async () => [mockConversation])
const listLongTermMemoriesMock = vi.fn(async () => [])
const getExistingOpsPersonaIdMock = vi.fn(async () => null)

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ conversationId: undefined }),
  useSearchParams: () => [new URLSearchParams(), setSearchParamsMock],
}))

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    conversationService: {
      ...actual.conversationService,
      getConversations: () => getConversationsMock(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    },
    memoryService: {
      ...actual.memoryService,
      listLongTermMemories: () => listLongTermMemoriesMock(),
    },
    getExistingOpsPersonaId: () => getExistingOpsPersonaIdMock(),
    createNewOpsConversation: vi.fn(),
    OPS_PERSONA_NAME: 'Ops Assistant',
  }
})

describe('ConversationList overflow and menu visibility', () => {
  beforeEach(() => {
    cleanup()
    navigateMock.mockReset()
    setSearchParamsMock.mockReset()
    pushNotificationMock.mockReset()
    getConversationsMock.mockClear()
    listLongTermMemoriesMock.mockClear()
    getExistingOpsPersonaIdMock.mockClear()

    useConversationStore.setState({
      conversations: [],
      currentConversationId: null,
      messages: [],
      isLoadingMessages: false,
      isSending: false,
      searchQuery: '',
    })
    useNotificationStore.setState({
      notifications: [],
      push: pushNotificationMock,
      remove: vi.fn(),
    })
  })

  it('keeps conversation item constrained within sidebar layout classes', async () => {
    render(<ConversationList collapsed={false} />)

    await screen.findByText(`会话-${longToken}`)

    const overflowGuard = document.querySelector('.overflow-x-hidden')
    expect(overflowGuard).toBeTruthy()

    const titleNode = screen.getByText(`会话-${longToken}`)
    const itemRoot = titleNode.closest('.group')
    expect(itemRoot).toBeTruthy()
    expect(itemRoot?.className).toContain('w-full')
    expect(itemRoot?.className).toContain('min-w-0')
    expect(itemRoot?.className).toContain('overflow-hidden')

    const contentNode = itemRoot?.querySelector('.min-w-0.flex-1')
    expect(contentNode).toBeTruthy()

    const actionButton = itemRoot?.querySelector('button')
    expect(actionButton).toBeTruthy()
    expect(actionButton?.className).toContain('group-hover:opacity-100')
    expect(actionButton?.className).toContain('focus-visible:opacity-100')
  })

  it('opens menu from action trigger and keeps delete action available', async () => {
    render(<ConversationList collapsed={false} />)

    await screen.findByText(`会话-${longToken}`)

    const titleNode = screen.getByText(`会话-${longToken}`)
    const itemRoot = titleNode.closest('.group')
    const actionButton = itemRoot?.querySelector('button')
    expect(actionButton).toBeTruthy()

    fireEvent.pointerDown(actionButton as HTMLButtonElement, { button: 0, ctrlKey: false })

    await waitFor(() => {
      expect(screen.getAllByRole('menuitem').length).toBeGreaterThanOrEqual(3)
    })
  })
})
