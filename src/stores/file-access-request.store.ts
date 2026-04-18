import { create } from 'zustand'
import type { ForbiddenPathViolation } from '@/utils'

export type FileAccessRequestSource = 'mcp' | 'live2d' | 'unknown'

export interface FileAccessPermissionRequest extends ForbiddenPathViolation {
  id: string
  source: FileAccessRequestSource
}

interface FileAccessRequestState {
  current: FileAccessPermissionRequest | null
  queue: FileAccessPermissionRequest[]
  requestAccess: (payload: Omit<FileAccessPermissionRequest, 'id'>) => void
  resolveCurrent: () => void
  clearAll: () => void
}

function createKey(payload: Omit<FileAccessPermissionRequest, 'id'>) {
  return `${payload.path}::${payload.reason}::${payload.source}`
}

function toRequest(payload: Omit<FileAccessPermissionRequest, 'id'>): FileAccessPermissionRequest {
  return {
    ...payload,
    id: crypto.randomUUID(),
  }
}

export const useFileAccessRequestStore = create<FileAccessRequestState>((set) => ({
  current: null,
  queue: [],
  requestAccess: (payload) => {
    const incomingKey = createKey(payload)
    set((state) => {
      const currentKey = state.current
        ? `${state.current.path}::${state.current.reason}::${state.current.source}`
        : ''
      if (incomingKey === currentKey) return state

      const queueExists = state.queue.some(item => (`${item.path}::${item.reason}::${item.source}`) === incomingKey)
      if (queueExists) return state

      const nextRequest = toRequest(payload)
      if (!state.current) {
        return { ...state, current: nextRequest }
      }
      return {
        ...state,
        queue: [...state.queue, nextRequest],
      }
    })
  },
  resolveCurrent: () => {
    set((state) => {
      if (state.queue.length === 0) {
        return {
          ...state,
          current: null,
        }
      }
      const [next, ...rest] = state.queue
      return {
        ...state,
        current: next,
        queue: rest,
      }
    })
  },
  clearAll: () => {
    set({ current: null, queue: [] })
  },
}))
