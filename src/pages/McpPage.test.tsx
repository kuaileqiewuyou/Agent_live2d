/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpPage } from '@/pages/McpPage'
import type { MCPServer } from '@/types'

const getMcpServersMock = vi.fn()
const checkConnectionMock = vi.fn()
const toggleMcpServerMock = vi.fn()
const deleteMcpServerMock = vi.fn()
const createMcpServerMock = vi.fn()
const pushNotificationMock = vi.fn()

vi.mock('@/services', () => ({
  mcpService: {
    getMcpServers: (...args: unknown[]) => getMcpServersMock(...args),
    checkConnection: (...args: unknown[]) => checkConnectionMock(...args),
    toggleMcpServer: (...args: unknown[]) => toggleMcpServerMock(...args),
    deleteMcpServer: (...args: unknown[]) => deleteMcpServerMock(...args),
    createMcpServer: (...args: unknown[]) => createMcpServerMock(...args),
  },
}))

vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (state: { push: typeof pushNotificationMock }) => unknown) =>
    selector({ push: pushNotificationMock }),
}))

vi.mock('@/features/mcp/McpServerDialog', () => ({
  McpServerDialog: () => null,
}))

vi.mock('@/features/mcp/McpServerCard', () => ({
  McpServerCard: ({ server, checking }: { server: MCPServer, checking: boolean }) => (
    <div data-testid={`mcp-card-${server.id}`} data-checking={String(checking)}>
      {server.name}
    </div>
  ),
}))

const enabledServer: MCPServer = {
  id: 'mcp-1',
  name: 'Local MCP',
  description: 'for auto check',
  connectionStatus: 'disconnected',
  transportType: 'http',
  address: 'http://127.0.0.1:3001',
  toolCount: 0,
  resourceCount: 0,
  promptCount: 0,
  enabled: true,
}

describe('McpPage auto check loop', () => {
  beforeEach(() => {
    getMcpServersMock.mockReset()
    checkConnectionMock.mockReset()
    toggleMcpServerMock.mockReset()
    deleteMcpServerMock.mockReset()
    createMcpServerMock.mockReset()
    pushNotificationMock.mockReset()

    getMcpServersMock.mockResolvedValue([enabledServer])
    checkConnectionMock.mockResolvedValue({
      success: true,
      message: 'ok',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('runs auto connection checks on initial load and online event refresh', async () => {
    render(<McpPage />)

    await waitFor(() => {
      expect(checkConnectionMock).toHaveBeenCalledWith('mcp-1')
    })
    expect(screen.getByTestId('mcp-card-mcp-1')).toBeTruthy()
    expect(pushNotificationMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: '连接检查完成' }),
    )

    checkConnectionMock.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(checkConnectionMock).toHaveBeenCalledTimes(1)
    })
    expect(checkConnectionMock).toHaveBeenCalledWith('mcp-1')
  })
})
