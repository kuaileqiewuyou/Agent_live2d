import type { ChatLayoutMode } from './conversation'
import type { Live2DModel } from './live2d'

export type ThemeMode = 'light' | 'dark' | 'system'
export type FileAccessMode = 'compat'

export interface AppSettings {
  theme: ThemeMode
  backgroundImage?: string | null
  backgroundBlur: number
  backgroundOverlayOpacity: number
  defaultLayoutMode: ChatLayoutMode
  language: string
  fileAccessMode: FileAccessMode
  fileAccessAllowAll: boolean
  fileAccessFolders: string[]
  fileAccessBlacklist: string[]
  live2dModels?: Live2DModel[]
}
