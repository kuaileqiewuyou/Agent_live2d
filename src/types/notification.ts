export type NotificationType = 'success' | 'error' | 'info'

export interface NotificationItem {
  id: string
  title: string
  description?: string
  type: NotificationType
}
