import { create } from 'zustand'
import type { NotificationItem, NotificationType } from '@/types'

interface NotificationState {
  notifications: NotificationItem[]
  push: (payload: Omit<NotificationItem, 'id'>) => void
  remove: (id: string) => void
}

const dismissTimers = new Map<string, number>()

function buildDedupeKey(item: Pick<NotificationItem, 'type' | 'title' | 'description' | 'action'>) {
  const description = item.description?.trim() || ''
  const actionLabel = item.action?.label?.trim() || ''
  return `${item.type}::${item.title.trim()}::${description}::${actionLabel}`
}

function clearDismissTimer(id: string) {
  const timer = dismissTimers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

function scheduleDismiss(
  id: string,
  type: NotificationType,
  get: () => NotificationState,
) {
  clearDismissTimer(id)
  const timer = window.setTimeout(() => {
    dismissTimers.delete(id)
    get().remove(id)
  }, type === 'error' ? 5000 : 3000)
  dismissTimers.set(id, timer)
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  push: (payload) => {
    const dedupeKey = buildDedupeKey(payload)
    const duplicated = get().notifications.find(item => buildDedupeKey(item) === dedupeKey)
    if (duplicated) {
      set((state) => ({
        notifications: state.notifications.map((item) => {
          if (item.id !== duplicated.id) return item
          return {
            ...item,
            repeatCount: (item.repeatCount || 1) + 1,
          }
        }),
      }))
      scheduleDismiss(duplicated.id, payload.type, get)
      return
    }

    const id = crypto.randomUUID()
    const item: NotificationItem = {
      ...payload,
      id,
      repeatCount: payload.repeatCount || 1,
    }
    set((state) => ({ notifications: [...state.notifications, item] }))
    scheduleDismiss(id, payload.type, get)
  },
  remove: (id) => {
    clearDismissTimer(id)
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    }))
  },
}))
