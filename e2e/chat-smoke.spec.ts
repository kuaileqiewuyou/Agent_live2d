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
  skillId: string
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
  const seed = uniqueLabel('e2e-seed')

  const persona = await apiPost<{ id: string }>(request, '/personas', {
    name: `E2E Persona ${seed}`,
    avatar: '',
    description: 'E2E test persona',
    personalityTags: ['e2e'],
    speakingStyle: 'Natural and concise',
    backgroundStory: 'E2E',
    openingMessage: 'Hello',
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

  const skill = await apiPost<{ id: string }>(request, '/skills', {
    name: `E2E Skill ${seed}`,
    description: 'E2E helper skill',
    version: '1.0.0',
    author: 'e2e',
    tags: ['e2e'],
    enabled: true,
    scope: ['conversation'],
    configSchema: {},
    runtimeType: 'prompt',
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
        budget: {
          type: 'number',
          title: 'Budget',
          description: 'Budget amount',
        },
        includeRaw: {
          type: 'boolean',
          title: 'Include Raw',
          description: 'Include raw results',
        },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          title: 'Format',
          description: 'Output format',
        },
        notes: {
          type: 'string',
          title: 'Notes',
          description: 'Notes',
        },
      },
    },
    runtimeType: 'prompt',
  })

  return {
    personaId: persona.id,
    modelConfigId: modelConfig.id,
    skillId: skill.id,
    typedSkillId: typedSkill.id,
    typedSkillName,
  }
}

async function createConversationByApi(
  page: Page,
  title: string,
  prerequisites: Prerequisites,
  options?: { enabledSkillIds?: string[] },
) {
  const conversation = await apiPost<ConversationRead>(page.request, '/conversations', {
    title,
    personaId: prerequisites.personaId,
    modelConfigId: prerequisites.modelConfigId,
    layoutMode: 'chat',
    enabledSkillIds: options?.enabledSkillIds ?? [prerequisites.skillId],
    enabledMcpServerIds: [],
    pinned: false,
    inheritPersonaLongTermMemory: true,
  })

  await page.goto(`/chat/${conversation.id}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return conversation
}

async function openToolPanel(page: Page) {
  await page.locator('main button:has(svg.lucide-wrench)').first().click()
  await expect(page.getByText(/Tool Panel|工具面板/i)).toBeVisible()
  await expect.poll(async () => (
    page.getByRole('button', { name: /^(添加|Add|已选择|Selected)$/i }).count()
  )).toBeGreaterThan(0)
}

function composerLocator(page: Page) {
  return page.locator('main textarea').last()
}

async function clickSend(page: Page) {
  await page.locator('main button:has(svg.lucide-send)').first().click()
}

async function expectComposerDraftStored(page: Page, conversationId: string, expected: string) {
  await expect.poll(async () => {
    return page.evaluate((cid) => {
      const raw = localStorage.getItem('agent-live2d-composer-drafts')
      if (!raw) return ''
      const parsed = JSON.parse(raw) as Record<string, string>
      return parsed[cid] || ''
    }, conversationId)
  }).toBe(expected)
}

async function selectFirstAttachTool(page: Page) {
  const addButtons = page.getByRole('button', { name: /^(添加|Add)$/i })
  const addCount = await addButtons.count()
  if (addCount > 0) {
    await addButtons.first().click()
    return
  }

  const selectedButtons = page.getByRole('button', { name: /^(已选择|Selected)$/i })
  const selectedCount = await selectedButtons.count()
  expect(selectedCount).toBeGreaterThan(0)
}

test.describe.configure({ mode: 'serial' })

test.describe('Chat Smoke E2E', () => {
  let prerequisites: Prerequisites

  test.beforeAll(async ({ request }) => {
    prerequisites = await ensurePrerequisites(request)
  })

  test('manual Tool + message, only Tool fallback, stream fallback', async ({ page }) => {
    const title = uniqueLabel('e2e-stream')
    await createConversationByApi(page, title, prerequisites)

    const composer = composerLocator(page)
    const mainArea = page.getByRole('main')

    await openToolPanel(page)
    await selectFirstAttachTool(page)
    await composer.fill(uniqueLabel('E2E-manual-tool-message'))
    await clickSend(page)
    await expect(mainArea.getByText('Tool 使用：手动', { exact: false })).toBeVisible()

    await openToolPanel(page)
    await selectFirstAttachTool(page)
    await composer.fill('')
    const secondSendPromise = page.waitForRequest((request) => {
      return request.method() === 'POST'
        && /\/api\/conversations\/[^/]+\/messages(\/stream)?$/.test(request.url())
    })
    await clickSend(page)
    const secondSendRequest = await secondSendPromise
    const secondPayload = secondSendRequest.postDataJSON() as { content?: string } | null
    expect((secondPayload?.content || '').trim().length).toBeGreaterThan(0)

    const fallbackText = uniqueLabel('E2E-stream-fallback')
    const fallbackPostPromise = page.waitForRequest((request) => {
      return request.method() === 'POST'
        && /\/api\/conversations\/[^/]+\/messages$/.test(request.url())
    })

    await page.route('**/api/conversations/*/messages/stream', async (route) => {
      await route.abort('failed')
    })

    await composer.fill(fallbackText)
    await clickSend(page)
    await fallbackPostPromise
    await page.unroute('**/api/conversations/*/messages/stream')
  })

  test('typed Tool params render as number/boolean/enum controls and can send', async ({ page }) => {
    const title = uniqueLabel('e2e-typed')
    await createConversationByApi(page, title, prerequisites, {
      enabledSkillIds: [prerequisites.typedSkillId],
    })

    await openToolPanel(page)

    const typedCard = page
      .getByRole('main')
      .locator('div.rounded-xl')
      .filter({ hasText: prerequisites.typedSkillName })
      .first()
    await expect(typedCard).toBeVisible()
    await typedCard.getByRole('button', { name: /^(添加|Add|已选择|Selected)$/i }).click()

    const numberInput = typedCard.getByRole('spinbutton', { name: /Budget/i })
    await expect(numberInput).toBeVisible()
    await numberInput.fill('42')

    await typedCard.getByRole('combobox', { name: /Include Raw/i }).selectOption('true')
    await typedCard.getByRole('combobox', { name: /Format/i }).selectOption('json')

    const composer = composerLocator(page)
    await composer.fill(uniqueLabel('E2E-typed-send'))
    await clickSend(page)

    await expect(page.getByRole('main').getByText('Tool 使用：手动', { exact: false })).toBeVisible()
  })

  test('typed Tool params block send when number field is invalid', async ({ page }) => {
    const title = uniqueLabel('e2e-typed-invalid')
    const conversation = await createConversationByApi(page, title, prerequisites, {
      enabledSkillIds: [prerequisites.typedSkillId],
    })

    await page.evaluate(([conversationId, skillId, skillName]) => {
      const key = 'agent-live2d-tool-drafts'
      const raw = localStorage.getItem(key)
      const map = raw ? JSON.parse(raw) as Record<string, unknown> : {}
      map[conversationId] = [
        {
          id: 'typed-invalid-draft',
          type: 'skill',
          targetId: skillId,
          label: skillName,
          inputParams: {
            budget: 'abc',
            format: 'json',
          },
          requiredFields: ['budget', 'format'],
          fieldTypes: {
            budget: 'number',
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
    await expect.poll(async () => {
      return page.evaluate((cid) => {
        const raw = localStorage.getItem('agent-live2d-tool-drafts')
        if (!raw) return ''
        const parsed = JSON.parse(raw) as Record<string, Array<{ inputParams?: Record<string, string> }>>
        return parsed[cid]?.[0]?.inputParams?.budget || ''
      }, conversation.id)
    }).toBe('abc')

    const composer = composerLocator(page)
    const draft = uniqueLabel('E2E-typed-invalid-send')
    await composer.fill(draft)

    let sent = false
    const requestListener = (request: { method: () => string, url: () => string }) => {
      if (
        request.method() === 'POST'
        && /\/api\/conversations\/[^/]+\/messages(\/stream)?$/.test(request.url())
      ) {
        sent = true
      }
    }
    page.on('request', requestListener)

    const sendButton = page.locator('main button:has(svg.lucide-send)').first()
    await expect(sendButton).toBeDisabled()
    await expect(sendButton).toHaveAttribute('aria-label', /Tool/i)
    await expect(composer).toHaveValue(draft)
    await page.waitForTimeout(800)
    expect(sent).toBe(false)

    page.off('request', requestListener)
  })


  test('background persists after refresh and draft restores across A/B conversations', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('button[aria-label$="B"]').first().click()

    const savedGradientBeforeReload = await page.evaluate(() => {
      const raw = localStorage.getItem('agent-live2d-settings')
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { backgroundImage?: string }
      return parsed.backgroundImage || ''
    })
    expect(savedGradientBeforeReload).toContain('f093fb')

    await page.reload()

    const savedGradientAfterReload = await page.evaluate(() => {
      const raw = localStorage.getItem('agent-live2d-settings')
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { backgroundImage?: string }
      return parsed.backgroundImage || ''
    })
    expect(savedGradientAfterReload).toContain('f093fb')

    const titleA = uniqueLabel('e2e-A')
    const titleB = uniqueLabel('e2e-B')
    const convA = await createConversationByApi(page, titleA, prerequisites)
    const convB = await createConversationByApi(page, titleB, prerequisites)

    const composer = composerLocator(page)
    const draftA = uniqueLabel('draft-A')
    const draftB = uniqueLabel('draft-B')
    const sidebar = page.getByRole('complementary')

    await expect(page.getByRole('heading', { name: titleB })).toBeVisible()
    await composer.fill(draftB)
    await expectComposerDraftStored(page, convB.id, draftB)

    await sidebar.getByText(titleA, { exact: true }).click()
    await expect(page.getByRole('heading', { name: titleA })).toBeVisible()
    await composer.fill(draftA)
    await expectComposerDraftStored(page, convA.id, draftA)

    await sidebar.getByText(titleB, { exact: true }).click()
    await expect(page.getByRole('heading', { name: titleB })).toBeVisible()
    await expect(composer).toHaveValue(draftB)

    await sidebar.getByText(titleA, { exact: true }).click()
    await expect(page.getByRole('heading', { name: titleA })).toBeVisible()
    await expect(composer).toHaveValue(draftA)
  })

  test('background overlay opacity saves to backend and restores after refresh', async ({ page }) => {
    const patchResponse = await page.request.patch(`${apiBase}/settings`, {
      data: {
        backgroundOverlayOpacity: 0.7,
      },
    })
    expect(patchResponse.ok()).toBeTruthy()

    await page.goto('/settings')
    await expect(page.getByRole('slider').nth(1)).toHaveAttribute('aria-valuenow', '0.7')
    await expect(page.getByText('0.70')).toBeVisible()

    await expect.poll(async () => {
      const response = await page.request.get(`${apiBase}/settings`)
      if (!response.ok()) {
        return -1
      }
      const payload = await response.json() as ApiEnvelope<{ backgroundOverlayOpacity: number }>
      return Number(payload.data.backgroundOverlayOpacity.toFixed(2))
    }).toBe(0.7)

    await page.reload()
    await expect(page.getByRole('slider').nth(1)).toHaveAttribute('aria-valuenow', '0.7')
    await expect(page.getByText('0.70')).toBeVisible()

    const overlayFromLocalStorage = await page.evaluate(() => {
      const raw = localStorage.getItem('agent-live2d-settings')
      if (!raw) return -1
      const parsed = JSON.parse(raw) as { backgroundOverlayOpacity?: number }
      return Number((parsed.backgroundOverlayOpacity ?? -1).toFixed(2))
    })
    expect(overlayFromLocalStorage).toBe(0.7)
  })
})
