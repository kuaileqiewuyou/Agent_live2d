import type { ChatLayoutMode } from './conversation'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  theme: ThemeMode
  backgroundImage?: string | null
  backgroundBlur: number
  backgroundOverlayOpacity: number
  defaultLayoutMode: ChatLayoutMode
  language: string
}
