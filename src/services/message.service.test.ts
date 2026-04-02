import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  apiRequest: vi.fn(),
  isMockMode: vi.fn(() => false),
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
      { manualToolRequests },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown[][]
    const requestInit = calls[0]?.[1] as RequestInit | undefined
    expect(requestInit).toBeDefined()
    const parsedBody = JSON.parse(String(requestInit?.body))
    expect(parsedBody.manualToolRequests).toEqual(manualToolRequests)
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
})
