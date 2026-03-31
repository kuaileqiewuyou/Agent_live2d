import type { MCPServer } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockMcpServers } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let mcpServers: MCPServer[] = [...mockMcpServers]

function normalizeMcpServer(server: any): MCPServer {
  const capabilities = server.capabilities || {}
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    connectionStatus: server.status || server.connectionStatus || 'disconnected',
    transportType: server.transportType,
    address: server.endpointOrCommand || server.address,
    toolCount: server.toolCount ?? 0,
    resourceCount: server.resourceCount ?? 0,
    promptCount: server.promptCount ?? 0,
    lastCheckedAt: server.lastCheckedAt,
    enabled: server.enabled,
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

async function createMcpServer(
  data: {
    name: string
    description: string
    transportType: 'stdio' | 'http'
    address: string
    enabled: boolean
  },
): Promise<MCPServer> {
  if (isMockMode()) {
    const server: MCPServer = {
      ...data,
      id: generateId(),
      connectionStatus: data.enabled ? 'connected' : 'disconnected',
      toolCount: 0,
      resourceCount: 0,
    }
    mcpServers.push(server)
    return server
  }
  const res = await apiRequest<any>('/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      transportType: data.transportType,
      endpointOrCommand: data.address,
      enabled: data.enabled,
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
  id: string
): Promise<{ success: boolean; message: string }> {
  if (isMockMode()) {
    const server = mcpServers.find((s) => s.id === id)
    if (!server) {
      throw new Error(`MCP Server not found: ${id}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
    const index = mcpServers.findIndex((s) => s.id === id)
    mcpServers[index] = {
      ...mcpServers[index],
      connectionStatus: 'connected',
      lastCheckedAt: new Date().toISOString(),
    }
    return { success: true, message: `成功连接到 ${server.name}` }
  }
  const res = await apiRequest<{ ok: boolean; detail: string }>(
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
