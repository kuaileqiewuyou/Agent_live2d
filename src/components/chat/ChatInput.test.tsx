/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '@/components/chat/ChatInput'
import { TOOL_DRAFT_STORAGE_KEY } from '@/components/chat/toolDraft'
import { useNotificationStore } from '@/stores'
import type { ManualToolRequest } from '@/types'

vi.mock('@/components/chat/ChatToolPanel', () => ({
  ChatToolPanel: () => <div data-testid="chat-tool-panel">tool panel</div>,
}))

function seedDraft(conversationId: string, request: ManualToolRequest) {
  localStorage.setItem(
    TOOL_DRAFT_STORAGE_KEY,
    JSON.stringify({ [conversationId]: [request] }),
  )
}

describe('ChatInput manual tool guards', () => {
  beforeEach(() => {
    localStorage.clear()
    useNotificationStore.setState({ notifications: [] })
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
})
