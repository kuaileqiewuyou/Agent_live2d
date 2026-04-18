export type MCPTransportType = 'stdio' | 'http'
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'checking' | 'error'
export type MCPAuthType = 'none' | 'bearer' | 'basic' | 'apiKey'
export type MCPCapabilitySource = 'probe' | 'cache' | 'unknown'
export type MCPSmokeErrorCategory = 'config' | 'auth' | 'permission' | 'server' | 'runtime'

export interface MCPTool {
  name: string
  description: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
}

export interface MCPServerAuthConfig {
  type: Exclude<MCPAuthType, 'none'>
  token?: string
  username?: string
  password?: string
  headerName?: string
  value?: string
}

export interface MCPServerAdvancedConfig {
  timeoutMs?: number
  headers?: Record<string, string>
  args?: string[]
  env?: Record<string, string>
  auth?: MCPServerAuthConfig
}

export interface MCPServerCapabilityMeta {
  detail?: string
  source?: MCPCapabilitySource
  checkedAt?: string
  lastSuccessAt?: string
  lastError?: string
}

export interface MCPServer {
  id: string
  name: string
  description: string
  connectionStatus: MCPConnectionStatus
  transportType: MCPTransportType
  address: string
  endpointOrCommand?: string
  toolCount: number
  resourceCount: number
  promptCount?: number
  lastCheckedAt?: string
  lastCheckDetail?: string
  capabilityMeta?: MCPServerCapabilityMeta
  enabled: boolean
  advancedConfig?: MCPServerAdvancedConfig
  tools?: MCPTool[]
  resources?: MCPResource[]
  prompts?: Array<{ name?: string; description?: string }>
}

export interface MCPServerCreateInput {
  name: string
  description: string
  transportType: MCPTransportType
  address: string
  enabled: boolean
  advancedConfig?: MCPServerAdvancedConfig
}

export interface MCPSmokeStep {
  name: string
  ok: boolean
  status: string
  detail: string
  errorCategory?: MCPSmokeErrorCategory
  details?: Record<string, unknown>
}

export interface MCPSmokeResult {
  ok: boolean
  status: string
  steps: MCPSmokeStep[]
  usedToolName?: string
  summary: string
}

export interface MCPSmokeRequest {
  toolName?: string
  toolArguments?: Record<string, unknown>
}
