import { describe, expect, it } from 'vitest'
import {
  clearRuntimeModelDraftForConversation,
  getRuntimeModelDraftForConversation,
  persistRuntimeModelDraftForConversation,
  readRuntimeModelDraftMap,
} from '@/pages/chat/runtimeModelDraft'

function createMemoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem(key: string) {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

describe('runtimeModelDraft', () => {
  it('persists and reads runtime model draft by conversation', () => {
    const storage = createMemoryStorage()
    persistRuntimeModelDraftForConversation('conv-1', 'model-1', storage)
    expect(getRuntimeModelDraftForConversation('conv-1', storage)).toBe('model-1')
  })

  it('clears runtime model draft for conversation', () => {
    const storage = createMemoryStorage()
    persistRuntimeModelDraftForConversation('conv-2', 'model-2', storage)
    clearRuntimeModelDraftForConversation('conv-2', storage)
    expect(getRuntimeModelDraftForConversation('conv-2', storage)).toBeNull()
  })

  it('filters invalid persisted payload entries', () => {
    const storage = createMemoryStorage()
    storage.setItem('agent-live2d-runtime-model-drafts', JSON.stringify({
      '': 'model-empty',
      'conv-3': 123,
      'conv-4': 'model-4',
    }))

    expect(readRuntimeModelDraftMap(storage)).toEqual({
      'conv-4': 'model-4',
    })
  })
})
