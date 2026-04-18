/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryPage } from '@/pages/MemoryPage'
import { ApiRequestError } from '@/api/errors'
import type { Conversation, LongTermMemory, Persona } from '@/types'

const listLongTermMemoriesMock = vi.fn()
const searchMemoriesMock = vi.fn()
const createLongTermMemoryMock = vi.fn()
const deleteLongTermMemoryMock = vi.fn()
const summarizeConversationMock = vi.fn()
const getPersonasMock = vi.fn()
const getConversationsMock = vi.fn()
const pushNotificationMock = vi.fn()
const navigateMock = vi.fn()
const setSearchParamsMock = vi.fn()

vi.mock('@/services', () => ({
  memoryService: {
    listLongTermMemories: (...args: unknown[]) => listLongTermMemoriesMock(...args),
    searchMemories: (...args: unknown[]) => searchMemoriesMock(...args),
    createLongTermMemory: (...args: unknown[]) => createLongTermMemoryMock(...args),
    deleteLongTermMemory: (...args: unknown[]) => deleteLongTermMemoryMock(...args),
    summarizeConversation: (...args: unknown[]) => summarizeConversationMock(...args),
  },
  personaService: {
    getPersonas: (...args: unknown[]) => getPersonasMock(...args),
  },
  conversationService: {
    getConversations: (...args: unknown[]) => getConversationsMock(...args),
  },
}))

vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (state: { push: typeof pushNotificationMock }) => unknown) =>
    selector({ push: pushNotificationMock }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), setSearchParamsMock],
}))

const baseMemory: LongTermMemory = {
  id: 'mem-1',
  conversationId: 'conv-1',
  personaId: 'persona-1',
  memoryScope: 'persona',
  content: '用户喜欢简洁直接的回复。',
  tags: ['preference'],
  metadata: {},
  vectorId: 'vec-1',
  createdAt: '2026-04-05T01:00:00.000Z',
  updatedAt: '2026-04-05T01:00:00.000Z',
}

const basePersona: Persona = {
  id: 'persona-1',
  name: 'Mika',
  avatar: 'avatar.png',
  description: 'test',
  personalityTags: ['calm'],
  speakingStyle: 'gentle',
  backgroundStory: 'bg',
  openingMessage: 'hello',
  longTermMemoryEnabled: true,
  live2dModel: 'model.model3.json',
  defaultLayoutMode: 'chat',
  systemPromptTemplate: 'test',
  createdAt: '2026-04-05T01:00:00.000Z',
  updatedAt: '2026-04-05T01:00:00.000Z',
}

const baseConversation: Conversation = {
  id: 'conv-1',
  title: 'Memory Session',
  personaId: 'persona-1',
  modelConfigId: 'model-1',
  layoutMode: 'chat',
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  pinned: false,
  createdAt: '2026-04-05T01:00:00.000Z',
  updatedAt: '2026-04-05T01:00:00.000Z',
}

describe('MemoryPage', () => {
  beforeEach(() => {
    listLongTermMemoriesMock.mockReset()
    searchMemoriesMock.mockReset()
    createLongTermMemoryMock.mockReset()
    deleteLongTermMemoryMock.mockReset()
    summarizeConversationMock.mockReset()
    getPersonasMock.mockReset()
    getConversationsMock.mockReset()
    pushNotificationMock.mockReset()
    navigateMock.mockReset()
    setSearchParamsMock.mockReset()

    listLongTermMemoriesMock.mockResolvedValue([baseMemory])
    getPersonasMock.mockResolvedValue([basePersona])
    getConversationsMock.mockResolvedValue([baseConversation])
    searchMemoriesMock.mockResolvedValue([baseMemory])
    createLongTermMemoryMock.mockResolvedValue(baseMemory)
    deleteLongTermMemoryMock.mockResolvedValue({ deleted: true, id: baseMemory.id })
    summarizeConversationMock.mockResolvedValue({
      id: 'sum-1',
      summary: 'summary',
      sourceMessageCount: 2,
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders memory list and triggers semantic search', async () => {
    render(<MemoryPage />)

    await screen.findByText('用户喜欢简洁直接的回复。')
    expect(screen.getByText('Memory Session')).toBeTruthy()
    expect(screen.getByText('Mika')).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('输入你想搜索的内容，比如：用户喜欢什么风格'), '简洁')
    await userEvent.click(screen.getByRole('button', { name: '开始搜索' }))

    await waitFor(() => {
      expect(searchMemoriesMock).toHaveBeenCalledWith(expect.objectContaining({
        query: '简洁',
      }))
    })
  })

  it('uses a page-level scroll container for wheel scrolling', async () => {
    render(<MemoryPage />)

    await waitFor(() => {
      expect(listLongTermMemoriesMock).toHaveBeenCalled()
    })
    const scrollRoot = screen.getByTestId('memory-page-scroll-root')
    expect(scrollRoot.className).toContain('overflow-y-auto')
  })

  it('supports manual long-term memory write and refreshes list', async () => {
    listLongTermMemoriesMock
      .mockResolvedValueOnce([baseMemory])
      .mockResolvedValueOnce([
        baseMemory,
        { ...baseMemory, id: 'mem-2', content: '用户偏好晚间交流。' },
      ])

    render(<MemoryPage />)

    await screen.findByText('用户喜欢简洁直接的回复。')
    await userEvent.type(
      screen.getByPlaceholderText('例如：用户更喜欢简洁冷静的回答风格。'),
      '用户偏好晚间交流。',
    )
    await userEvent.type(screen.getByPlaceholderText('标签，逗号分隔'), 'manual, preference')
    await userEvent.click(screen.getByRole('button', { name: '写入长期记忆' }))

    await waitFor(() => {
      expect(createLongTermMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
        content: '用户偏好晚间交流。',
        memoryScope: 'persona',
        tags: ['manual', 'preference'],
      }))
    })
    await screen.findByText('用户偏好晚间交流。')
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: '记忆已写入',
    }))
  })

  it('shows downgrade notice and keeps page usable when vector search fails', async () => {
    searchMemoriesMock.mockRejectedValue(new Error('Qdrant search timeout'))

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.type(screen.getByPlaceholderText('输入你想搜索的内容，比如：用户喜欢什么风格'), '简洁')
    await userEvent.click(screen.getByRole('button', { name: '开始搜索' }))

    await waitFor(() => {
      expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'info',
        title: '记忆检索已降级',
      }))
    })
    expect(screen.getByText('用户喜欢简洁直接的回复。')).toBeTruthy()
  })

  it('deletes a memory with confirmation and refreshes list', async () => {
    listLongTermMemoriesMock
      .mockResolvedValueOnce([baseMemory])
      .mockResolvedValueOnce([])

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.click(screen.getByRole('button', { name: '删除这条记忆' }))

    await waitFor(() => {
      expect(deleteLongTermMemoryMock).toHaveBeenCalledWith('mem-1')
    })
    await waitFor(() => {
      expect(listLongTermMemoriesMock).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.queryByText('用户喜欢简洁直接的回复。')).toBeNull()
    })
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: '记忆已删除',
    }))
  })

  it('treats resource-level not_found as already deleted when refresh no longer contains item', async () => {
    deleteLongTermMemoryMock.mockRejectedValue(
      new ApiRequestError('long term memory not found', { code: 'not_found', status: 404 }),
    )
    listLongTermMemoriesMock
      .mockResolvedValueOnce([baseMemory])
      .mockResolvedValueOnce([])

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.click(screen.getByRole('button', { name: '删除这条记忆' }))

    await waitFor(() => {
      expect(deleteLongTermMemoryMock).toHaveBeenCalledWith('mem-1')
    })
    await waitFor(() => {
      expect(listLongTermMemoriesMock).toHaveBeenCalledTimes(2)
    })
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '该记忆已不存在',
    }))
  })

  it('shows backend-upgrade hint when delete endpoint is unavailable (route-level 404)', async () => {
    deleteLongTermMemoryMock.mockRejectedValue(
      new ApiRequestError('请求的资源不存在。', { code: 'not_found', status: 404 }),
    )

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.click(screen.getByRole('button', { name: '删除这条记忆' }))

    await waitFor(() => {
      expect(deleteLongTermMemoryMock).toHaveBeenCalledWith('mem-1')
    })
    expect(listLongTermMemoriesMock).toHaveBeenCalledTimes(1)
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: '后端不支持删除接口',
    }))
  })

  it('shows mismatch warning when delete succeeds but refreshed list still contains item', async () => {
    listLongTermMemoriesMock
      .mockResolvedValueOnce([baseMemory])
      .mockResolvedValueOnce([baseMemory])

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.click(screen.getByRole('button', { name: '删除这条记忆' }))

    await waitFor(() => {
      expect(deleteLongTermMemoryMock).toHaveBeenCalledWith('mem-1')
    })
    await waitFor(() => {
      expect(listLongTermMemoriesMock).toHaveBeenCalledTimes(2)
    })
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: '删除未生效',
    }))
    expect(pushNotificationMock).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: '记忆已删除',
    }))
  })

  it('does not delete memory when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<MemoryPage />)
    await screen.findByText('用户喜欢简洁直接的回复。')

    await userEvent.click(screen.getByRole('button', { name: '删除这条记忆' }))

    expect(deleteLongTermMemoryMock).not.toHaveBeenCalled()
  })
})
