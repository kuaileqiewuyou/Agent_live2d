import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, Persona } from '@/types'

const getPersonasMock = vi.fn()
const createPersonaMock = vi.fn()
const getConversationsMock = vi.fn()
const createConversationMock = vi.fn()
const getModelConfigsMock = vi.fn()
const getSkillsMock = vi.fn()
const getMcpServersMock = vi.fn()

vi.mock('./persona.service', () => ({
  personaService: {
    getPersonas: (...args: unknown[]) => getPersonasMock(...args),
    createPersona: (...args: unknown[]) => createPersonaMock(...args),
  },
}))

vi.mock('./conversation.service', () => ({
  conversationService: {
    getConversations: (...args: unknown[]) => getConversationsMock(...args),
    createConversation: (...args: unknown[]) => createConversationMock(...args),
  },
}))

vi.mock('./model.service', () => ({
  modelService: {
    getModelConfigs: (...args: unknown[]) => getModelConfigsMock(...args),
  },
}))

vi.mock('./skill.service', () => ({
  skillService: {
    getSkills: (...args: unknown[]) => getSkillsMock(...args),
  },
}))

vi.mock('./mcp.service', () => ({
  mcpService: {
    getMcpServers: (...args: unknown[]) => getMcpServersMock(...args),
  },
}))

const opsPersona: Persona = {
  id: 'persona-ops-1',
  name: 'Ops Assistant',
  avatar: 'OPS',
  description: 'ops',
  personalityTags: [],
  speakingStyle: 'concise',
  backgroundStory: 'ops',
  openingMessage: 'hello',
  longTermMemoryEnabled: true,
  defaultLayoutMode: 'chat',
  systemPromptTemplate: 'ops',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}

const makeConversation = (id: string, personaId: string, updatedAt: string): Conversation => ({
  id,
  title: id,
  personaId,
  modelConfigId: 'model-1',
  layoutMode: 'chat',
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  pinned: false,
  createdAt: updatedAt,
  updatedAt,
})

describe('opsConversationService', () => {
  beforeEach(() => {
    getPersonasMock.mockReset()
    createPersonaMock.mockReset()
    getConversationsMock.mockReset()
    createConversationMock.mockReset()
    getModelConfigsMock.mockReset()
    getSkillsMock.mockReset()
    getMcpServersMock.mockReset()
  })

  it('reuses latest ops conversation when it already exists', async () => {
    getPersonasMock.mockResolvedValue([opsPersona])
    getConversationsMock.mockResolvedValue([
      makeConversation('ops-old', 'persona-ops-1', '2026-04-01T00:00:00.000Z'),
      makeConversation('normal-1', 'persona-normal-1', '2026-04-03T00:00:00.000Z'),
      makeConversation('ops-new', 'persona-ops-1', '2026-04-05T00:00:00.000Z'),
    ])

    const { openOrCreateLatestOpsConversation } = await import('./ops-conversation.service')
    const result = await openOrCreateLatestOpsConversation()

    expect(result.created).toBe(false)
    expect(result.conversation.id).toBe('ops-new')
    expect(createConversationMock).not.toHaveBeenCalled()
  })

  it('creates ops conversation when no ops conversation exists', async () => {
    getPersonasMock.mockResolvedValue([opsPersona])
    getConversationsMock.mockResolvedValue([
      makeConversation('normal-1', 'persona-normal-1', '2026-04-03T00:00:00.000Z'),
    ])
    getModelConfigsMock.mockResolvedValue([
      { id: 'model-1', isDefault: true },
    ])
    getSkillsMock.mockResolvedValue([
      { id: 'skill-enabled-1', enabled: true },
      { id: 'skill-disabled-1', enabled: false },
    ])
    getMcpServersMock.mockResolvedValue([
      { id: 'mcp-enabled-1', enabled: true },
      { id: 'mcp-disabled-1', enabled: false },
    ])
    createConversationMock.mockResolvedValue(
      makeConversation('ops-created-1', 'persona-ops-1', '2026-04-06T00:00:00.000Z'),
    )

    const { openOrCreateLatestOpsConversation } = await import('./ops-conversation.service')
    const result = await openOrCreateLatestOpsConversation()

    expect(result.created).toBe(true)
    expect(result.conversation.id).toBe('ops-created-1')
    expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({
      personaId: 'persona-ops-1',
      modelConfigId: 'model-1',
      enabledSkillIds: ['skill-enabled-1'],
      enabledMcpServerIds: ['mcp-enabled-1'],
    }))
  })

  it('createNewOpsConversation always creates a new conversation', async () => {
    getPersonasMock.mockResolvedValue([opsPersona])
    getModelConfigsMock.mockResolvedValue([
      { id: 'model-1', isDefault: true },
    ])
    getSkillsMock.mockResolvedValue([])
    getMcpServersMock.mockResolvedValue([])
    createConversationMock.mockResolvedValue(
      makeConversation('ops-created-2', 'persona-ops-1', '2026-04-07T00:00:00.000Z'),
    )

    const { createNewOpsConversation } = await import('./ops-conversation.service')
    const conversation = await createNewOpsConversation()

    expect(conversation.id).toBe('ops-created-2')
    expect(createConversationMock).toHaveBeenCalledTimes(1)
  })
})
