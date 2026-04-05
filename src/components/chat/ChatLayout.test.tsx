/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatLayout } from '@/components/chat/ChatLayout'
import type { Message } from '@/types'

vi.mock('@/components/chat/MessageList', () => ({
  MessageList: ({ messages }: { messages: Message[] }) => (
    <div data-testid="message-list">list-{messages.length}</div>
  ),
}))

vi.mock('@/components/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: Message }) => (
    <div data-testid="history-message">{message.content}</div>
  ),
}))

const baseMessage: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'assistant',
  content: '陪伴模式回复内容',
  status: 'done',
  senderType: 'assistant',
  senderName: 'AI',
  createdAt: new Date().toISOString(),
  attachments: [],
  metadata: {},
}

afterEach(() => {
  cleanup()
})

describe('ChatLayout', () => {
  it('renders chat mode with message list and input area', () => {
    render(
      <ChatLayout
        layoutMode="chat"
        messages={[baseMessage]}
        live2dSlot={<div data-testid="live2d-slot">live2d</div>}
        inputSlot={<div data-testid="input-slot">input</div>}
        sidePanel={<div data-testid="side-panel">panel</div>}
      />,
    )

    expect(screen.getByTestId('message-list')).toBeTruthy()
    expect(screen.getAllByTestId('input-slot').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '聊天记录' })).toBeNull()
  })

  it('renders companion mode and keeps history panel toggle usable', async () => {
    render(
      <ChatLayout
        layoutMode="companion"
        messages={[baseMessage]}
        live2dSlot={<div data-testid="live2d-slot">live2d</div>}
        inputSlot={<div data-testid="input-slot">input</div>}
      />,
    )

    expect(screen.getAllByText('陪伴模式回复内容').length).toBeGreaterThan(0)
    expect(screen.getByTestId('input-slot')).toBeTruthy()
    expect(screen.getByRole('button', { name: '聊天记录' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '聊天记录' }))

    expect(screen.getByTestId('history-message')).toBeTruthy()
  })
})
