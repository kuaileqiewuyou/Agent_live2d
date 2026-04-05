/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConversationSettingsDialog } from '@/components/chat/ConversationSettingsDialog'
import type { Conversation } from '@/types'

const pushNotificationMock = vi.fn()
const setConversationsMock = vi.fn()

const updateConversationMock = vi.fn()
const getConversationsMock = vi.fn()
const getPersonasMock = vi.fn()
const getModelConfigsMock = vi.fn()
const getSkillsMock = vi.fn()
const getMcpServersMock = vi.fn()

vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (state: { push: typeof pushNotificationMock }) => unknown) =>
    selector({ push: pushNotificationMock }),
  useConversationStore: (selector: (state: { setConversations: typeof setConversationsMock }) => unknown) =>
    selector({ setConversations: setConversationsMock }),
}))

vi.mock('@/services', () => ({
  conversationService: {
    updateConversation: (...args: unknown[]) => updateConversationMock(...args),
    getConversations: (...args: unknown[]) => getConversationsMock(...args),
  },
  personaService: {
    getPersonas: (...args: unknown[]) => getPersonasMock(...args),
  },
  modelService: {
    getModelConfigs: (...args: unknown[]) => getModelConfigsMock(...args),
  },
  skillService: {
    getSkills: (...args: unknown[]) => getSkillsMock(...args),
  },
  mcpService: {
    getMcpServers: (...args: unknown[]) => getMcpServersMock(...args),
  },
}))

function createConversation(): Conversation {
  return {
    id: 'c-1',
    title: 'Session A',
    personaId: 'p-1',
    modelConfigId: 'm-1',
    layoutMode: 'chat',
    enabledSkillIds: [],
    enabledMcpServerIds: [],
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('ConversationSettingsDialog dedupe entry', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    pushNotificationMock.mockReset()
    setConversationsMock.mockReset()
    updateConversationMock.mockReset()
    getConversationsMock.mockReset()
    getPersonasMock.mockResolvedValue([])
    getModelConfigsMock.mockResolvedValue([])
    getSkillsMock.mockResolvedValue([])
    getMcpServersMock.mockResolvedValue([])
  })

  it('triggers onDedupeMessages from settings dialog', async () => {
    const onDedupeMessages = vi.fn()
    render(
      <ConversationSettingsDialog
        open
        conversation={createConversation()}
        onOpenChange={() => {}}
        onSaved={() => {}}
        onDedupeMessages={onDedupeMessages}
      />,
    )

    const button = await screen.findByTestId('conversation-dedupe-btn')
    fireEvent.click(button)

    expect(onDedupeMessages).toHaveBeenCalledTimes(1)
  })

  it('disables dedupe button while dedupe is running', async () => {
    render(
      <ConversationSettingsDialog
        open
        conversation={createConversation()}
        onOpenChange={() => {}}
        onSaved={() => {}}
        onDedupeMessages={() => {}}
        isDedupingMessages
      />,
    )

    const button = await screen.findByTestId('conversation-dedupe-btn')
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})
