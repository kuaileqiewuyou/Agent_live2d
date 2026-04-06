import type { MCPServer, MCPServerAdvancedConfig, MCPServerCreateInput } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockMcpServers } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let mcpServers: MCPServer[] = [...mockMcpServers]

function normalizeTextRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string' && item.trim())
    .map(([key, item]) => [key, (item as string).trim()] as const)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function normalizeAdvancedConfig(value: unknown): MCPServerAdvancedConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const timeoutMsRaw = source.timeoutMs
  const timeoutMs = typeof timeoutMsRaw === 'number' && Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.round(timeoutMsRaw)
    : undefined
  const args = Array.isArray(source.args)
    ? source.args.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
    : undefined
  const headers = normalizeTextRecord(source.headers)
  const env = normalizeTextRecord(source.env)

  const authRaw = source.auth
  let auth: MCPServerAdvancedConfig['auth']
  if (authRaw && typeof authRaw === 'object') {
    const authRecord = authRaw as Record<string, unknown>
    const typeRaw = authRecord.type
    if (typeRaw === 'bearer') {
      const token = typeof authRecord.token === 'string' ? authRecord.token.trim() : ''
      if (token) auth = { type: 'bearer', token }
    }
    else if (typeRaw === 'basic') {
      const username = typeof authRecord.username === 'string' ? authRecord.username.trim() : ''
      const password = typeof authRecord.password === 'string' ? authRecord.password : ''
      if (username || password) auth = { type: 'basic', username, password }
    }
    else if (typeRaw === 'apiKey') {
      const headerName = typeof authRecord.headerName === 'string' ? authRecord.headerName.trim() : ''
      const authValue = typeof authRecord.value === 'string' ? authRecord.value.trim() : ''
      if (headerName && authValue) auth = { type: 'apiKey', headerName, value: authValue }
    }
  }

  if (!timeoutMs && !headers && !env && (!args || args.length === 0) && !auth) {
    return undefined
  }

  return {
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(headers ? { headers } : {}),
    ...(env ? { env } : {}),
    ...(args && args.length > 0 ? { args } : {}),
    ...(auth ? { auth } : {}),
  }
}

function normalizeMcpServer(server: any): MCPServer {
  const capabilities = server.capabilities || {}
  const source = typeof capabilities.source === 'string' ? capabilities.source : 'unknown'
  const advancedConfig = normalizeAdvancedConfig(
    server.advancedConfig || server.config || server.extraConfig || capabilities.config,
  )
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    connectionStatus: server.status || server.connectionStatus || 'disconnected',
    transportType: server.transportType,
    address: server.endpointOrCommand || server.address,
    endpointOrCommand: server.endpointOrCommand || server.address,
    toolCount: server.toolCount ?? 0,
    resourceCount: server.resourceCount ?? 0,
    promptCount: server.promptCount ?? 0,
    lastCheckedAt: server.lastCheckedAt,
    lastCheckDetail: typeof capabilities.detail === 'string' ? capabilities.detail : undefined,
    capabilityMeta: {
      detail: typeof capabilities.detail === 'string' ? capabilities.detail : undefined,
      source: source === 'probe' || source === 'cache' ? source : 'unknown',
      checkedAt: typeof capabilities.checkedAt === 'string' ? capabilities.checkedAt : undefined,
      lastSuccessAt: typeof capabilities.lastSuccessAt === 'string' ? capabilities.lastSuccessAt : undefined,
      lastError: typeof capabilities.lastError === 'string' ? capabilities.lastError : undefined,
    },
    enabled: server.enabled,
    advancedConfig,
    tools: capabilities.tools || server.tools || [],
    resources: capabilities.resources || server.resources || [],
    prompts: capabilities.prompts || server.prompts || [],
  }
}

async function getMcpServers(): Promise<MCPServer[]> {
  if (isMockMode()) {
    return [...mcpServers]
  }
  const res = await apiRequest<ListResponse<any>>('/api/mcp/servers')
  return res.data.items.map(normalizeMcpServer)
}

async function getMcpServer(id: string): Promise<MCPServer | undefined> {
  if (isMockMode()) {
    return mcpServers.find((s) => s.id === id)
  }
  const res = await apiRequest<any>(`/api/mcp/servers/${id}`)
  return normalizeMcpServer(res.data)
}

async function createMcpServer(data: MCPServerCreateInput): Promise<MCPServer> {
  if (isMockMode()) {
    const server: MCPServer = {
      ...data,
      id: generateId(),
      connectionStatus: data.enabled ? 'connected' : 'disconnected',
      endpointOrCommand: data.address,
      toolCount: 0,
      resourceCount: 0,
    }
    mcpServers.push(server)
    return server
  }

  const advancedConfig = normalizeAdvancedConfig(data.advancedConfig)
  const res = await apiRequest<any>('/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      transportType: data.transportType,
      endpointOrCommand: data.address,
      enabled: data.enabled,
      ...(advancedConfig ? { advancedConfig, config: advancedConfig } : {}),
    }),
  })
  return normalizeMcpServer(res.data)
}

async function deleteMcpServer(id: string): Promise<void> {
  if (isMockMode()) {
    mcpServers = mcpServers.filter((s) => s.id !== id)
    return
  }
  await apiRequest<void>(`/api/mcp/servers/${id}`, {
    method: 'DELETE',
  })
}

async function toggleMcpServer(id: string, enabled: boolean): Promise<MCPServer> {
  if (isMockMode()) {
    const index = mcpServers.findIndex((s) => s.id === id)
    if (index === -1) {
      throw new Error(`MCP Server not found: ${id}`)
    }
    const updated: MCPServer = {
      ...mcpServers[index],
      enabled,
      connectionStatus: enabled ? 'connected' : 'disconnected',
    }
    mcpServers[index] = updated
    return updated
  }
  const res = await apiRequest<any>(`/api/mcp/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
  return normalizeMcpServer(res.data)
}

async function checkConnection(
  id: string,
): Promise<{ success: boolean, message: string }> {
  if (isMockMode()) {
    const server = mcpServers.find((s) => s.id === id)
    if (!server) {
      throw new Error(`MCP Server not found: ${id}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
    const index = mcpServers.findIndex((s) => s.id === id)
    const now = new Date().toISOString()
    mcpServers[index] = {
      ...mcpServers[index],
      connectionStatus: 'connected',
      lastCheckedAt: now,
      capabilityMeta: {
        source: 'probe',
        detail: 'mock check succeeded',
        checkedAt: now,
        lastSuccessAt: now,
      },
    }
    return { success: true, message: `成功连接到 ${server.name}` }
  }
  const res = await apiRequest<{ ok: boolean, detail: string }>(
    `/api/mcp/servers/${id}/check`,
    { method: 'POST' },
  )
  return { success: res.data.ok, message: res.data.detail }
}

export const mcpService = {
  getMcpServers,
  getMcpServer,
  createMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  checkConnection,
}

