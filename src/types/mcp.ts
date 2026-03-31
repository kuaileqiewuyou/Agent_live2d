export type MCPTransportType = 'stdio' | 'http'
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'checking' | 'error'

export interface MCPTool {
  name: string
  description: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
}

export interface MCPServer {
  id: string
  name: string
  description: string
  connectionStatus: MCPConnectionStatus
  transportType: MCPTransportType
  address: string
  toolCount: number
  resourceCount: number
  promptCount?: number
  lastCheckedAt?: string
  enabled: boolean
  tools?: MCPTool[]
  resources?: MCPResource[]
  prompts?: Array<{ name?: string; description?: string }>
}
