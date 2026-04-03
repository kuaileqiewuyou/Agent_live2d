import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

interface ApiEnvelope<T> {
  data: T
  success: boolean
  message?: string
}

interface ConversationRead {
  id: string
  title: string
}

interface Prerequisites {
  personaId: string
  modelConfigId: string
  typedSkillId: string
  typedSkillName: string
}

const backendPort = Number(process.env.E2E_BACKEND_PORT || '8001')
const apiBase = `http://127.0.0.1:${backendPort}/api`

function uniqueLabel(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function unwrapResponse<T>(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await response.text()
  expect(response.ok(), text).toBeTruthy()
  const json = JSON.parse(text) as ApiEnvelope<T>
  expect(json.success).toBe(true)
  return json.data
}

async function apiPost<T>(request: APIRequestContext, path: string, payload: unknown) {
  const response = await request.post(`${apiBase}${path}`, { data: payload })
  return unwrapResponse<T>(response)
}

async function ensurePrerequisites(request: APIRequestContext): Promise<Prerequisites> {
  const seed = uniqueLabel('typed-422')

  const persona = await apiPost<{ id: string }>(request, '/personas', {
    name: `E2E Persona ${seed}`,
    avatar: '',
    description: 'E2E typed params persona',
    personalityTags: ['e2e'],
    speakingStyle: 'concise',
    backgroundStory: 'E2E',
    openingMessage: 'hello',
    longTermMemoryEnabled: true,
    live2dModel: null,
    defaultLayoutMode: 'chat',
    systemPromptTemplate: 'You are a helpful companion.',
  })

  const modelConfig = await apiPost<{ id: string }>(request, '/models/configs', {
    name: `E2E Model ${seed}`,
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:65535/v1',
    apiKey: '',
    model: 'gpt-e2e',
    streamEnabled: true,
    toolCallSupported: true,
    isDefault: false,
    extraConfig: {},
  })

  const typedSkillName = `E2E Typed Skill ${seed}`
  const typedSkill = await apiPost<{ id: string }>(request, '/skills', {
    name: typedSkillName,
    description: 'E2E typed params skill',
    version: '1.0.0',
    author: 'e2e',
    tags: ['e2e', 'typed'],
    enabled: true,
    scope: ['conversation'],
    configSchema: {
      type: 'object',
      required: ['budget', 'format'],
      properties: {
        budget: { type: 'number' },
        includeRaw: { type: 'boolean' },
        format: { type: 'string', enum: ['json', 'markdown'] },
      },
    },
    runtimeType: 'prompt',
  })

  return {
    personaId: persona.id,
    modelConfigId: modelConfig.id,
    typedSkillId: typedSkill.id,
    typedSkillName,
  }
}

async function createConversationByApi(page: Page, title: string, prerequisites: Prerequisites) {
  const conversation = await apiPost<ConversationRead>(page.request, '/conversations', {
    title,
    personaId: prerequisites.personaId,
    modelConfigId: prerequisites.modelConfigId,
    layoutMode: 'chat',
    enabledSkillIds: [prerequisites.typedSkillId],
    enabledMcpServerIds: [],
    pinned: false,
    inheritPersonaLongTermMemory: true,
  })
  return conversation
}

function composerLocator(page: Page) {
  return page.locator('main textarea').last()
}

function sendButton(page: Page) {
  return page.locator('button').filter({ has: page.locator('svg.lucide-send') }).last()
}

test.describe('Typed Params Server Validation E2E', () => {
  let prerequisites: Prerequisites

  test.beforeAll(async ({ request }) => {
    prerequisites = await ensurePrerequisites(request)
  })

  test('shows backend typed-param validation error after stream->fallback chain', async ({ page }) => {
    const title = uniqueLabel('typed-server-422')
    const conversation = await createConversationByApi(page, title, prerequisites)

    await page.goto(`/chat/${conversation.id}`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    await page.evaluate(([conversationId, skillId, skillName]) => {
      const key = 'agent-live2d-tool-drafts'
      const raw = localStorage.getItem(key)
      const map = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      map[conversationId] = [
        {
          id: 'typed-invalid-server-422',
          type: 'skill',
          targetId: skillId,
          label: skillName,
          inputParams: {
            budget: 'abc',
            format: 'json',
          },
          requiredFields: ['budget', 'format'],
          // budget type intentionally omitted to bypass local type guard.
          fieldTypes: {
            format: 'enum',
          },
          fieldOptions: {
            format: ['json', 'markdown'],
          },
        },
      ]
      localStorage.setItem(key, JSON.stringify(map))
    }, [conversation.id, prerequisites.typedSkillId, prerequisites.typedSkillName] as const)

    await page.reload()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    const composer = composerLocator(page)
    await composer.fill(uniqueLabel('typed-invalid-send'))

    let streamRequestCount = 0
    let fallbackRequestCount = 0
    const requestListener = (request: { method: () => string, url: () => string }) => {
      if (request.method() !== 'POST') return
      const url = request.url()
      if (/\/api\/conversations\/[^/]+\/messages\/stream$/.test(url)) streamRequestCount += 1
      if (/\/api\/conversations\/[^/]+\/messages$/.test(url)) fallbackRequestCount += 1
    }
    page.on('request', requestListener)

    await sendButton(page).click()

    await expect(page.getByText(/manualToolRequests\[0\] invalid params/i)).toBeVisible()
    await expect.poll(() => streamRequestCount).toBeGreaterThan(0)
    await expect.poll(() => fallbackRequestCount).toBeGreaterThan(0)

    const response = await page.request.get(`${apiBase}/conversations/${conversation.id}/messages`)
    const payload = await response.json() as ApiEnvelope<{ total: number }>
    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(0)

    page.off('request', requestListener)
  })
})
