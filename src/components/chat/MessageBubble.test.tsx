/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { Message } from '@/types'

const baseMessage: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user',
  content: '复制按钮回归测试',
  status: 'done',
  senderType: 'user',
  createdAt: new Date().toISOString(),
  attachments: [],
  metadata: {},
}

describe('MessageBubble', () => {
  it('keeps the copy button outside the clipped bubble container', () => {
    const { container } = render(
      <MessageBubble
        message={baseMessage}
        layoutMode="chat"
      />,
    )

    const bubble = container.querySelector('div.min-w-0.overflow-hidden.rounded-2xl')
    const copyButton = container.querySelector('button.absolute.-bottom-3')
    const wrapper = container.querySelector('div.group\\/copy.relative.min-w-0')

    expect(wrapper).toBeTruthy()
    expect(bubble).toBeTruthy()
    expect(copyButton).toBeTruthy()
    expect(wrapper?.contains(copyButton as Node)).toBe(true)
    expect(bubble?.contains(copyButton as Node)).toBe(false)
    expect(copyButton?.className).toContain('group-hover/copy:opacity-100')
    expect(copyButton?.className).not.toContain('group-hover:opacity-100')
  })
})
