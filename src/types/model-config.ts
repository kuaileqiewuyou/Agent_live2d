export type ProviderType = 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama'

export interface ModelConfig {
  id: string
  name: string
  provider: ProviderType
  baseUrl: string
  apiKey: string
  model: string
  streamEnabled: boolean
  toolCallSupported: boolean
  isDefault: boolean
  extraConfig?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
