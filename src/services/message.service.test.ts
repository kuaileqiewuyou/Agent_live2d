import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8001',
  apiRequest: vi.fn(),
  isMockMode: vi.fn(() => false),
  parseApiError: vi.fn(async (response: Response) => new Error(`stream-${response.status}`)),
  normalizeRequestError: vi.fn((error: unknown) => (
    error instanceof Error ? error : new Error(String(error))
  )),
}))

vi.mock('@/mock', () => ({
  mockMessages: [],
}))

function createSseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('messageService.streamMessage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('parses SSE blocks and dispatches matching handlers', async () => {
    const response = createSseResponse([
      'event: message_created\ndata: {"userMessageId":"u-1"}\n\n',
      'event: thinking\ndata: {"stage":"planner","message":"thinking"}\n\n',
      'event: tool_calling\ndata: {"manual":true,"manualCount":1,"toolCount":1}\n\n',
      'event: tool_result\ndata: {"type":"skill","name":"总结助手","result":"ok","manual":true}\n\n',
      'event: token\ndata: {"content":"你"}\n\n',
      'event: token\ndata: {"content":"好"}\n\n',
      'event: final_answer\ndata: {"messageId":"a-1","content":"你好"}\n\n',
    ])

    const fetchMock = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchMock)

    const { messageService } = await import('@/services/message.service')
    const handlers = {
      onMessageCreated: vi.fn(),
      onThinking: vi.fn(),
      onToolCalling: vi.fn(),
      onToolResult: vi.fn(),
      onToken: vi.fn(),
      onFinalAnswer: vi.fn(),
    }

    await messageService.streamMessage('c-1', 'hello', handlers, {
      manualToolRequests: [
        {
          id: 'manual-1',
          type: 'skill',
          targetId: 'skill-1',
          label: '总结助手',
          inputText: 'goal: summarize',
          autoExecute: true,
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(handlers.onMessageCreated).toHaveBeenCalledWith('u-1')
    expect(handlers.onThinking).toHaveBeenCalledWith(expect.objectContaining({ message: 'thinking' }))
    expect(handlers.onToolCalling).toHaveBeenCalledWith(expect.objectContaining({ manual: true, manualCount: 1 }))
    expect(handlers.onToolResult).toHaveBeenCalledWith(expect.objectContaining({ name: '总结助手' }))
    expect(handlers.onToken).toHaveBeenNthCalledWith(1, '你')
    expect(handlers.onToken).toHaveBeenNthCalledWith(2, '好')
    expect(handlers.onFinalAnswer).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'a-1', content: '你好' }))
  })

  it('does not reuse previous event name for block without event field', async () => {
    const response = createSseResponse([
      'event: thinking\ndata: {"message":"stage-1"}\n\n',
      'data: {"message":"should-be-ignored"}\n\n',
      'event: token\ndata: {"content":"A"}\n\n',
      'event: stopped\ndata: {"conversationId":"c-2"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { messageService } = await import('@/services/message.service')
    const onThinking = vi.fn()
    const onToken = vi.fn()

    await messageService.streamMessage(
      'c-2',
      'hello',
      { onThinking, onToken },
      {},
    )

    expect(onThinking).toHaveBeenCalledTimes(1)
    expect(onThinking).toHaveBeenCalledWith(expect.objectContaining({ message: 'stage-1' }))
    expect(onToken).toHaveBeenCalledTimes(1)
    expect(onToken).toHaveBeenCalledWith('A')
  })

  it('sends manualToolRequests in stream request body and forwards final tool metadata', async () => {
    const response = createSseResponse([
      'event: final_answer\ndata: {"messageId":"a-2","content":"done","toolUsage":{"manualCount":1,"automaticCount":0,"totalCount":1},"manualToolRequests":[{"id":"m-1","type":"skill","targetId":"s-1","label":"Summary Skill"}]}\n\n',
    ])
    const fetchMock = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchMock)

    const { messageService } = await import('@/services/message.service')
    const onFinalAnswer = vi.fn()
    const manualToolRequests = [
      {
        id: 'm-1',
        type: 'skill' as const,
        targetId: 's-1',
        label: 'Summary Skill',
        inputText: 'goal: summarize',
        autoExecute: true,
      },
    ]

    await messageService.streamMessage(
      'c-3',
      'hello',
      { onFinalAnswer },
      { manualToolRequests, metadata: { requestId: 'req-stream-1' } },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown[][]
    const requestInit = calls[0]?.[1] as RequestInit | undefined
    expect(requestInit).toBeDefined()
    const parsedBody = JSON.parse(String(requestInit?.body))
    expect(parsedBody.manualToolRequests).toEqual(manualToolRequests)
    expect(parsedBody.metadata).toEqual(expect.objectContaining({ requestId: 'req-stream-1' }))
    expect(onFinalAnswer).toHaveBeenCalledWith({
      messageId: 'a-2',
      content: 'done',
      toolUsage: { manualCount: 1, automaticCount: 0, totalCount: 1 },
      manualToolRequests: [{ id: 'm-1', type: 'skill', targetId: 's-1', label: 'Summary Skill' }],
    })
  })

  it('dispatches stopped event to onStopped handler', async () => {
    const response = createSseResponse([
      'event: stopped\ndata: {"conversationId":"c-4"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { messageService } = await import('@/services/message.service')
    const onStopped = vi.fn()

    await messageService.streamMessage(
      'c-4',
      'hello',
      { onStopped },
      {},
    )

    expect(onStopped).toHaveBeenCalledTimes(1)
  })

  it('uses parseApiError for non-ok stream response', async () => {
    const response = new Response(JSON.stringify({
      success: false,
      message: 'request is still in progress',
      data: { code: 'request_in_progress' },
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { parseApiError } = await import('@/api')
    const parseApiErrorMock = vi.mocked(parseApiError)
    parseApiErrorMock.mockResolvedValueOnce(new Error('request is still in progress'))

    const { messageService } = await import('@/services/message.service')

    await expect(
      messageService.streamMessage('c-err', 'hello', { onToken: vi.fn() }, {}),
    ).rejects.toThrow('request is still in progress')

    expect(parseApiErrorMock).toHaveBeenCalledTimes(1)
    expect(parseApiErrorMock).toHaveBeenCalledWith(response)
  })

  it('throws when stream ends without final_answer or stopped event', async () => {
    const response = createSseResponse([
      'event: message_created\ndata: {"userMessageId":"u-5"}\n\n',
      'event: thinking\ndata: {"message":"still running"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { messageService } = await import('@/services/message.service')

    await expect(
      messageService.streamMessage('c-5', 'hello', { onMessageCreated: vi.fn() }, {}),
    ).rejects.toThrow('Stream ended before receiving a terminal event')
  })

  it('dispatches inferred live2dState transitions through stream lifecycle', async () => {
    const response = createSseResponse([
      'event: message_created\ndata: {"userMessageId":"u-6"}\n\n',
      'event: thinking\ndata: {"message":"analyzing"}\n\n',
      'event: token\ndata: {"content":"Hi"}\n\n',
      'event: token\ndata: {"content":"!"}\n\n',
      'event: final_answer\ndata: {"messageId":"a-6","content":"Hi!"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { messageService } = await import('@/services/message.service')
    const onLive2dStateChange = vi.fn()

    await messageService.streamMessage(
      'c-6',
      'hello',
      { onLive2dStateChange },
      {},
    )

    const calls = onLive2dStateChange.mock.calls.map((c: unknown[]) => c[0])
    expect(calls[0]).toBe('thinking')
    expect(calls[1]).toBe('thinking')
    expect(calls).toContain('talking')
    expect(calls[calls.length - 1]).toBe('idle')
  })

  it('uses backend live2dState from payload when present', async () => {
    const response = createSseResponse([
      'event: message_created\ndata: {"userMessageId":"u-7","live2dState":"happy"}\n\n',
      'event: token\ndata: {"content":"yay","live2dState":"happy"}\n\n',
      'event: final_answer\ndata: {"messageId":"a-7","content":"yay","live2dState":"sad"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const { messageService } = await import('@/services/message.service')
    const onLive2dStateChange = vi.fn()

    await messageService.streamMessage(
      'c-7',
      'hello',
      { onLive2dStateChange },
      {},
    )

    const calls = onLive2dStateChange.mock.calls.map((c: unknown[]) => c[0])
    expect(calls[0]).toBe('happy')
    expect(calls[calls.length - 1]).toBe('sad')
    expect(calls).not.toContain('idle')
  })
})

describe('messageService.sendMessage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('passes requestId through metadata payload', async () => {
    const { messageService } = await import('@/services/message.service')
    const { apiRequest } = await import('@/api')
    const apiRequestMock = vi.mocked(apiRequest)
    apiRequestMock.mockResolvedValue({
      success: true,
      data: {
        userMessage: {
          id: 'u-10',
          conversationId: 'c-10',
          role: 'user',
          senderType: 'user',
          senderName: 'User',
          content: 'hello',
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: 'a-10',
          conversationId: 'c-10',
          role: 'assistant',
          senderType: 'assistant',
          senderName: 'AI',
          content: 'done',
          createdAt: new Date().toISOString(),
        },
      },
      message: null,
    } as never)

    await messageService.sendMessage('c-10', 'hello', [], [], { requestId: 'req-send-1' })

    expect(apiRequestMock).toHaveBeenCalledTimes(1)
    const [, options] = apiRequestMock.mock.calls[0] as [string, { body?: string }]
    const payload = JSON.parse(options.body || '{}')
    expect(payload.metadata).toEqual(expect.objectContaining({ requestId: 'req-send-1' }))
  })
})

describe('messageService.stopMessage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls stop endpoint with POST method', async () => {
    const { messageService } = await import('@/services/message.service')
    const { apiRequest } = await import('@/api')
    const apiRequestMock = vi.mocked(apiRequest)
    apiRequestMock.mockResolvedValue({
      success: true,
      data: { stopped: true, conversationId: 'c-stop-1' },
      message: null,
    } as never)

    await messageService.stopMessage('c-stop-1')

    expect(apiRequestMock).toHaveBeenCalledTimes(1)
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/c-stop-1/messages/stop',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
