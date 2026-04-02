import { describe, expect, it } from 'vitest'
import type { ManualToolRequest } from '@/types'
import {
  buildToolFallbackContent,
  getComposerDraftForConversation,
  getInvalidTypedParams,
  getMissingRequiredParams,
  getToolDraftForConversation,
  hasToolParams,
  persistComposerDraftForConversation,
  persistToolDraftForConversation,
  readComposerDraftMap,
  readToolDraftMap,
} from '@/components/chat/toolDraft'

function createMemoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

function createManualRequest(partial?: Partial<ManualToolRequest>): ManualToolRequest {
  return {
    id: 'm-1',
    type: 'skill',
    targetId: 's-1',
    label: 'Summary Skill',
    ...partial,
  }
}

describe('toolDraft helpers', () => {
  it('builds fallback content from selected tools when input is empty', () => {
    const content = buildToolFallbackContent(
      [
        createManualRequest(),
        createManualRequest({ id: 'm-2', label: 'Local MCP', type: 'mcp', targetId: 'mcp-1' }),
      ],
      '测试会话',
    )

    expect(content).toContain('「Summary Skill」')
    expect(content).toContain('「Local MCP」')
    expect(content).toContain('会话「测试会话」')
    expect(content).toContain('请优先调用')
  })

  it('returns empty fallback content when no tool is selected', () => {
    expect(buildToolFallbackContent([])).toBe('')
  })

  it('detects whether a manual tool request has params', () => {
    expect(hasToolParams(createManualRequest())).toBe(false)
    expect(hasToolParams(createManualRequest({ inputText: 'goal: summarize' }))).toBe(true)
    expect(hasToolParams(createManualRequest({ inputParams: { goal: 'summarize' } }))).toBe(true)
  })

  it('returns missing required params from inputParams', () => {
    const request = createManualRequest({
      inputParams: { goal: 'Summarize this', output: 'bullets' },
      requiredFields: ['goal', 'scope', 'output'],
    })

    expect(getMissingRequiredParams(request)).toEqual(['scope'])
  })

  it('reads required params from legacy inputText when inputParams is missing', () => {
    const request = createManualRequest({
      inputText: 'goal: Summarize this\nscope: Last 7 days',
      requiredFields: ['goal', 'scope', 'output'],
    })

    expect(getMissingRequiredParams(request)).toEqual(['output'])
  })

  it('ignores blank required field names', () => {
    const request = createManualRequest({
      inputParams: { goal: 'Summarize this' },
      requiredFields: ['goal', ' ', ''],
    })

    expect(getMissingRequiredParams(request)).toEqual([])
  })

  it('persists and restores drafts by conversation id', () => {
    const storage = createMemoryStorage()
    const c1Requests = [createManualRequest({ id: 'c1-1', label: 'Summary Skill' })]
    const c2Requests = [createManualRequest({ id: 'c2-1', label: 'Local MCP', type: 'mcp', targetId: 'mcp-1' })]

    persistToolDraftForConversation('c1', c1Requests, storage)
    persistToolDraftForConversation('c2', c2Requests, storage)

    expect(getToolDraftForConversation('c1', storage)).toEqual(c1Requests)
    expect(getToolDraftForConversation('c2', storage)).toEqual(c2Requests)
  })

  it('removes one conversation draft without affecting others', () => {
    const storage = createMemoryStorage()
    const c1Requests = [createManualRequest({ id: 'c1-1' })]
    const c2Requests = [createManualRequest({ id: 'c2-1', label: 'Local MCP', type: 'mcp', targetId: 'mcp-1' })]

    persistToolDraftForConversation('c1', c1Requests, storage)
    persistToolDraftForConversation('c2', c2Requests, storage)
    persistToolDraftForConversation('c1', [], storage)

    expect(getToolDraftForConversation('c1', storage)).toEqual([])
    expect(getToolDraftForConversation('c2', storage)).toEqual(c2Requests)
  })

  it('returns empty draft map for invalid json payload', () => {
    const storage = createMemoryStorage()
    storage.setItem('agent-live2d-tool-drafts', 'not-json')
    expect(readToolDraftMap(storage)).toEqual({})
  })

  it('persists and restores composer drafts by conversation id', () => {
    const storage = createMemoryStorage()

    persistComposerDraftForConversation('c1', 'draft A', storage)
    persistComposerDraftForConversation('c2', 'draft B', storage)

    expect(getComposerDraftForConversation('c1', storage)).toBe('draft A')
    expect(getComposerDraftForConversation('c2', storage)).toBe('draft B')
  })

  it('removes one composer draft without affecting others', () => {
    const storage = createMemoryStorage()

    persistComposerDraftForConversation('c1', 'draft A', storage)
    persistComposerDraftForConversation('c2', 'draft B', storage)
    persistComposerDraftForConversation('c1', ' ', storage)

    expect(getComposerDraftForConversation('c1', storage)).toBe('')
    expect(getComposerDraftForConversation('c2', storage)).toBe('draft B')
  })

  it('returns empty composer draft map for invalid json payload', () => {
    const storage = createMemoryStorage()
    storage.setItem('agent-live2d-composer-drafts', 'not-json')
    expect(readComposerDraftMap(storage)).toEqual({})
  })

  it('detects invalid typed params for number and boolean fields', () => {
    const request = createManualRequest({
      inputParams: {
        goal: 'Summarize this',
        budget: 'abc',
        includeRaw: 'maybe',
      },
      fieldTypes: {
        goal: 'string',
        budget: 'number',
        includeRaw: 'boolean',
      },
    })

    expect(getInvalidTypedParams(request)).toEqual(['budget', 'includeRaw'])
  })

  it('accepts valid typed params for enum fields', () => {
    const request = createManualRequest({
      inputParams: {
        output: 'json',
      },
      fieldTypes: {
        output: 'enum',
      },
      fieldOptions: {
        output: ['json', 'markdown'],
      },
    })

    expect(getInvalidTypedParams(request)).toEqual([])
  })
})
