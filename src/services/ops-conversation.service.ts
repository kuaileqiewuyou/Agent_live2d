import type { Conversation, Persona } from '@/types'
import { conversationService } from './conversation.service'
import { mcpService } from './mcp.service'
import { modelService } from './model.service'
import { personaService } from './persona.service'
import { skillService } from './skill.service'

export const OPS_PERSONA_NAME = 'Ops Assistant'

function isOpsPersona(persona: Pick<Persona, 'name'>): boolean {
  return persona.name.trim().toLowerCase() === OPS_PERSONA_NAME.toLowerCase()
}

function sortByUpdatedAtDesc(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

async function ensureOpsPersona(): Promise<Persona> {
  const personas = await personaService.getPersonas()
  const existing = personas.find(isOpsPersona)
  if (existing) return existing

  return await personaService.createPersona({
    name: OPS_PERSONA_NAME,
    avatar: 'OPS',
    description: 'Skill/MCP setup and troubleshooting assistant.',
    personalityTags: ['ops', 'tools', 'mcp', 'skill'],
    speakingStyle: 'Concise and actionable.',
    backgroundStory: 'Focuses on local environment setup, diagnostics, and recovery.',
    openingMessage: 'I am Ops Assistant. Tell me what you need for Skill/MCP setup or troubleshooting.',
    longTermMemoryEnabled: true,
    defaultLayoutMode: 'chat',
    systemPromptTemplate: 'You are Ops Assistant. Focus on Skill/MCP setup, diagnostics, and recovery.',
  })
}

async function resolveDefaultModelId(): Promise<string> {
  const modelConfigs = await modelService.getModelConfigs()
  const defaultModel = modelConfigs.find(config => config.isDefault) || modelConfigs[0]
  if (!defaultModel) {
    throw new Error('Please create at least one model config before using Ops Assistant.')
  }
  return defaultModel.id
}

async function resolveEnabledToolBindings() {
  const [skills, mcpServers] = await Promise.all([
    skillService.getSkills(),
    mcpService.getMcpServers(),
  ])
  return {
    enabledSkillIds: skills.filter(skill => skill.enabled).map(skill => skill.id),
    enabledMcpServerIds: mcpServers.filter(server => server.enabled).map(server => server.id),
  }
}

async function createOpsConversationForPersona(personaId: string): Promise<Conversation> {
  const [modelConfigId, bindings] = await Promise.all([
    resolveDefaultModelId(),
    resolveEnabledToolBindings(),
  ])

  return await conversationService.createConversation({
    title: 'Ops Assistant Session',
    personaId,
    modelConfigId,
    layoutMode: 'chat',
    enabledSkillIds: bindings.enabledSkillIds,
    enabledMcpServerIds: bindings.enabledMcpServerIds,
    pinned: false,
    inheritPersonaLongTermMemory: true,
  })
}

export async function getExistingOpsPersonaId(): Promise<string | null> {
  const personas = await personaService.getPersonas()
  const existing = personas.find(isOpsPersona)
  return existing?.id ?? null
}

export async function openOrCreateLatestOpsConversation(): Promise<{ conversation: Conversation, created: boolean }> {
  const opsPersona = await ensureOpsPersona()
  const allConversations = await conversationService.getConversations()
  const latest = sortByUpdatedAtDesc(
    allConversations.filter(conversation => conversation.personaId === opsPersona.id),
  )[0]

  if (latest) {
    return { conversation: latest, created: false }
  }

  const created = await createOpsConversationForPersona(opsPersona.id)
  return { conversation: created, created: true }
}

export async function createNewOpsConversation(): Promise<Conversation> {
  const opsPersona = await ensureOpsPersona()
  return await createOpsConversationForPersona(opsPersona.id)
}