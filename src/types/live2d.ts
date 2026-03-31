export type Live2DState = 'idle' | 'talking' | 'thinking' | 'happy' | 'sad'

export interface Live2DModel {
  id: string
  name: string
  path: string
  thumbnail?: string
}
