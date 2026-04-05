/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '@/components/chat/ChatInput'
import { TOOL_DRAFT_STORAGE_KEY } from '@/components/chat/toolDraft'
import { useNotificationStore } from '@/stores'
import type { ManualToolFailureHint, ManualToolRequest } from '@/types'
import type { Skill } from '@/types'

interface BackendHealthMockState {
  isReachable: boolean
  hasChecked: boolean
  checking: boolean
  lastCheckedAt: string | null
  apiBaseUrl: string
  retry: () => Promise<void> | void
}

function createBackendHealthState(
  overrides: Partial<BackendHealthMockState> = {},
): BackendHealthMockState {
  return {
    isReachable: true,
    hasChecked: false,
    checking: false,
    lastCheckedAt: null,
    apiBaseUrl: 'http://127.0.0.1:8001',
    retry: retryBackendHealthMock,
    ...overrides,
  }
}

const retryBackendHealthMock = vi.fn()
const useBackendHealthMock = vi.fn(() => createBackendHealthState())
const chatToolPanelMock = vi.fn()

vi.mock('@/hooks', () => ({
  useBackendHealth: () => useBackendHealthMock(),
}))

vi.mock('@/components/chat/ChatToolPanel', () => ({
  ChatToolPanel: (props: unknown) => {
    chatToolPanelMock(props)
    return <div data-testid="chat-tool-panel">tool panel</div>
  },
}))

function seedDraft(conversationId: string, request: ManualToolRequest) {
  localStorage.setItem(
    TOOL_DRAFT_STORAGE_KEY,
    JSON.stringify({ [conversationId]: [request] }),
  )
}

function createEnabledSkill(id: string, name: string): Skill {
  return {
    id,
    name,
    description: `${name} description`,
    tags: [],
    version: '0.1.0',
    author: 'test',
    enabled: true,
    scope: ['conversation'],
    runtimeType: 'workflow',
  }
}

describe('ChatInput manual tool guards', () => {
  beforeEach(() => {
    localStorage.clear()
    useNotificationStore.setState({ notifications: [] })
    retryBackendHealthMock.mockReset()
    useBackendHealthMock.mockReturnValue(createBackendHealthState())
    chatToolPanelMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('blocks send and opens tool panel when required params are missing', async () => {
    seedDraft('c-1', {
      id: 'req-1',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
      requiredFields: ['goal'],
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-1"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await screen.findByText('Summary Skill')

    const textarea = screen.getByPlaceholderText('Message...')
    await userEvent.type(textarea, 'hello{enter}')

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('chat-tool-panel')).not.toBeNull()
    expect(useNotificationStore.getState().notifications.at(-1)?.title).toBe('Tool 参数不完整')
    expect(useNotificationStore.getState().notifications.at(-1)?.description).toContain('manualToolRequests[0] invalid params: goal is required')
  })

  it('blocks send when typed params are invalid', async () => {
    seedDraft('c-invalid', {
      id: 'req-invalid',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
      inputParams: { temperature: 'abc' },
      fieldTypes: { temperature: 'number' },
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-invalid"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await screen.findByText('Summary Skill')
    await userEvent.type(screen.getByPlaceholderText('Message...'), 'hello{enter}')

    expect(onSend).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications.at(-1)?.title).toBe('Tool 参数格式错误')
    expect(useNotificationStore.getState().notifications.at(-1)?.description).toContain('manualToolRequests[0] invalid params: temperature should be a number')
  })

  it('sends when required params are already complete', async () => {
    seedDraft('c-2', {
      id: 'req-2',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
      requiredFields: ['goal'],
      inputParams: { goal: 'Summarize this turn' },
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-2"
        conversationTitle="Conversation A"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Summary Skill')).toBeTruthy()
    })

    const textarea = screen.getByPlaceholderText('Message...')
    await userEvent.type(textarea, 'hello{enter}')

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })
    expect(onSend).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        manualToolRequests: expect.arrayContaining([
          expect.objectContaining({
            id: 'req-2',
            label: 'Summary Skill',
          }),
        ]),
      }),
    )
  })

  it('uses fallback content when only manual tool is selected without text', async () => {
    seedDraft('c-3', {
      id: 'req-3',
      type: 'mcp',
      targetId: 'mcp-1',
      label: 'Local MCP',
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-3"
        conversationTitle="Conversation A"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    const textarea = screen.getByPlaceholderText('Message...')
    await userEvent.type(textarea, '{enter}')

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })

    const sentContent = onSend.mock.calls[0]?.[0] as string
    expect(sentContent).toContain('Local MCP')
    expect(sentContent).toContain('Conversation A')
  })

  it('keeps selected manual tools after send for conversation-level memory', async () => {
    seedDraft('c-keep', {
      id: 'req-keep',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-keep"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
        skillCount={1}
        enabledSkills={[createEnabledSkill('skill-1', 'Summary Skill')]}
      />,
    )

    await screen.findByText('Summary Skill')
    await userEvent.type(screen.getByPlaceholderText('Message...'), 'hello{enter}')

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('Summary Skill')).toBeTruthy()

    const storageRaw = localStorage.getItem(TOOL_DRAFT_STORAGE_KEY)
    expect(storageRaw).toBeTruthy()
    const storageMap = JSON.parse(storageRaw || '{}') as Record<string, ManualToolRequest[]>
    expect(storageMap['c-keep']?.[0]?.id).toBe('req-keep')
  })

  it('passes recent tool failures to ChatToolPanel for actionable repair hints', async () => {
    const failures: ManualToolFailureHint[] = [
      {
        type: 'skill',
        label: 'Summary Skill',
        targetId: 'skill-1',
        reason: 'not_enabled',
      },
    ]

    const onSend = vi.fn()
    const onOpenConversationSettings = vi.fn()
    const onOpenMcpCenter = vi.fn()
    render(
      <ChatInput
        conversationId="c-failure-hints"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
        skillCount={1}
        enabledSkills={[createEnabledSkill('skill-1', 'Summary Skill')]}
        recentToolFailures={failures}
        onOpenConversationSettings={onOpenConversationSettings}
        onOpenMcpCenter={onOpenMcpCenter}
      />,
    )

    await userEvent.click(screen.getByLabelText('打开 Tool Panel'))
    await screen.findByTestId('chat-tool-panel')

    const latestProps = chatToolPanelMock.mock.calls.at(-1)?.[0] as {
      recentToolFailures?: ManualToolFailureHint[]
      onOpenConversationSettings?: () => void
      onOpenMcpCenter?: () => void
    }
    expect(latestProps.recentToolFailures?.[0]?.label).toBe('Summary Skill')
    expect(latestProps.onOpenConversationSettings).toBe(onOpenConversationSettings)
    expect(latestProps.onOpenMcpCenter).toBe(onOpenMcpCenter)
  })

  it('parses backend validation message and passes issue details to ChatToolPanel', async () => {
    seedDraft('c-backend-validation', {
      id: 'req-typed',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
      inputParams: { budget: 'abc' },
      fieldTypes: { budget: 'number' },
    })

    render(
      <ChatInput
        conversationId="c-backend-validation"
        onSend={vi.fn()}
        isSending={false}
        placeholder="Message..."
        skillCount={1}
        enabledSkills={[createEnabledSkill('skill-1', 'Summary Skill')]}
        backendValidationMessage="manualToolRequests[0] invalid params: budget should be a number"
      />,
    )

    await userEvent.click(screen.getByLabelText('打开 Tool Panel'))
    await screen.findByTestId('chat-tool-panel')

    const latestProps = chatToolPanelMock.mock.calls.at(-1)?.[0] as {
      backendValidationIssues?: Array<{ requestIndex: number, field: string, code: string }>
    }
    expect(latestProps.backendValidationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestIndex: 0,
          field: 'budget',
          code: 'number',
        }),
      ]),
    )
  })

  it('restores tool draft by conversation when switching between A/B', async () => {
    localStorage.setItem(
      TOOL_DRAFT_STORAGE_KEY,
      JSON.stringify({
        cA: [{ id: 'a-1', type: 'skill', targetId: 'skill-1', label: 'Summary Skill' }],
        cB: [{ id: 'b-1', type: 'mcp', targetId: 'mcp-1', label: 'Local MCP' }],
      }),
    )

    const onSend = vi.fn()
    const { rerender } = render(
      <ChatInput
        conversationId="cA"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Summary Skill')).toBeTruthy()
    })

    rerender(
      <ChatInput
        conversationId="cB"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Local MCP')).toBeTruthy()
    })
    expect(screen.queryByText('Summary Skill')).toBeNull()
  })

  it('prunes stale tool draft when request is no longer enabled in conversation', async () => {
    seedDraft('c-prune', {
      id: 'req-stale',
      type: 'skill',
      targetId: 'skill-stale',
      label: 'Stale Skill',
    })

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-prune"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
        skillCount={1}
        enabledSkills={[createEnabledSkill('skill-active', 'Active Skill')]}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByText('Stale Skill')).toBeNull()
    })

    const storageRaw = localStorage.getItem(TOOL_DRAFT_STORAGE_KEY)
    const storageMap = JSON.parse(storageRaw || '{}') as Record<string, ManualToolRequest[]>
    expect(storageMap['c-prune']).toBeUndefined()
  })

  it('restores composer draft by conversation when switching between A/B', async () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <ChatInput
        conversationId="cA"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    const textarea = screen.getByPlaceholderText('Message...') as HTMLTextAreaElement
    await userEvent.type(textarea, 'draft-A')
    expect(textarea.value).toBe('draft-A')

    rerender(
      <ChatInput
        conversationId="cB"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Message...') as HTMLTextAreaElement).value).toBe('')
    })

    await userEvent.type(screen.getByPlaceholderText('Message...'), 'draft-B')

    rerender(
      <ChatInput
        conversationId="cA"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Message...') as HTMLTextAreaElement).value).toBe('draft-A')
    })

    rerender(
      <ChatInput
        conversationId="cB"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Message...') as HTMLTextAreaElement).value).toBe('draft-B')
    })
  })

  it('blocks send and shows retry action when backend is offline', async () => {
    useBackendHealthMock.mockReturnValue(createBackendHealthState({
      isReachable: false,
      hasChecked: true,
      lastCheckedAt: new Date().toISOString(),
    }))

    const onSend = vi.fn()
    render(
      <ChatInput
        conversationId="c-offline"
        onSend={onSend}
        isSending={false}
        placeholder="Message..."
      />,
    )

    const composer = screen.getByPlaceholderText('Message...')
    await userEvent.type(composer, 'hello{enter}')

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByText('后端连接异常，发送已暂停')).toBeTruthy()
    const sendButton = screen.getByLabelText('后端离线，暂不可发送')
    expect(sendButton.hasAttribute('disabled')).toBe(true)
    expect(useNotificationStore.getState().notifications.at(-1)?.title).toBe('后端暂不可达')

    await userEvent.click(screen.getByRole('button', { name: '重试连接' }))
    expect(retryBackendHealthMock).toHaveBeenCalledTimes(1)
  })

  it('invokes onStop when clicking stop button during sending', async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    render(
      <ChatInput
        conversationId="c-sending"
        onSend={onSend}
        onStop={onStop}
        isSending
        placeholder="Message..."
      />,
    )

    await userEvent.click(screen.getByLabelText('停止生成'))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('invokes onStop when backend is offline during sending', async () => {
    useBackendHealthMock.mockReturnValue(createBackendHealthState({
      isReachable: false,
      hasChecked: true,
      lastCheckedAt: new Date().toISOString(),
    }))

    const onSend = vi.fn()
    const onStop = vi.fn()
    render(
      <ChatInput
        conversationId="c-stop-offline"
        onSend={onSend}
        onStop={onStop}
        isSending
        placeholder="Message..."
      />,
    )

    expect(screen.getByText('后端连接异常，发送已暂停')).toBeTruthy()
    await userEvent.click(screen.getByLabelText('停止生成'))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps stop action available even when tool params are invalid during sending', async () => {
    seedDraft('c-stop-invalid', {
      id: 'req-stop-invalid',
      type: 'skill',
      targetId: 'skill-1',
      label: 'Summary Skill',
      inputParams: { temperature: 'abc' },
      fieldTypes: { temperature: 'number' },
    })

    const onSend = vi.fn()
    const onStop = vi.fn()
    render(
      <ChatInput
        conversationId="c-stop-invalid"
        onSend={onSend}
        onStop={onStop}
        isSending
        placeholder="Message..."
      />,
    )

    await screen.findByText('Summary Skill')
    await userEvent.click(screen.getByLabelText('停止生成'))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })
})
