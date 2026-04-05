export type NotificationType = 'success' | 'error' | 'info'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationItem {
  id: string
  title: string
  description?: string
  type: NotificationType
  action?: NotificationAction
  repeatCount?: number
}
