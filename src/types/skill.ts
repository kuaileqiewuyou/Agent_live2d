export interface Skill {
  id: string
  name: string
  description: string
  icon?: string
  tags: string[]
  version: string
  author: string
  enabled: boolean
  scope: string[]
  summary?: string
  configSchema?: Record<string, unknown>
  runtimeType?: string
  createdAt?: string
  updatedAt?: string
}
