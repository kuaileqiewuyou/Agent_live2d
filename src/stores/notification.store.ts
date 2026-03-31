import { create } from 'zustand'
import type { NotificationItem, NotificationType } from '@/types'

interface NotificationState {
  notifications: NotificationItem[]
  push: (payload: Omit<NotificationItem, 'id'>) => void
  remove: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  push: (payload) => {
    const id = crypto.randomUUID()
    const item: NotificationItem = { ...payload, id }
    set((state) => ({ notifications: [...state.notifications, item] }))
    window.setTimeout(() => {
      get().remove(id)
    }, payload.type === 'error' ? 5000 : 3000)
  },
  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),
}))
