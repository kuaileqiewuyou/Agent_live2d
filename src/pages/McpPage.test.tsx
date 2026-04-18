/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpPage } from '@/pages/McpPage'
import type { MCPServer } from '@/types'

const getMcpServersMock = vi.fn()
const checkConnectionMock = vi.fn()
const smokeConnectionMock = vi.fn()
const toggleMcpServerMock = vi.fn()
const deleteMcpServerMock = vi.fn()
const createMcpServerMock = vi.fn()
const pushNotificationMock = vi.fn()

vi.mock('@/services', () => ({
  mcpService: {
    getMcpServers: (...args: unknown[]) => getMcpServersMock(...args),
    checkConnection: (...args: unknown[]) => checkConnectionMock(...args),
    smokeConnection: (...args: unknown[]) => smokeConnectionMock(...args),
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
  McpServerCard: ({
    server,
    checking,
    smoking,
    smokeResult,
    onCheckConnection,
    onSmokeConnection,
  }: {
    server: MCPServer
    checking: boolean
    smoking: boolean
    smokeResult?: { summary?: string }
    onCheckConnection: (id: string) => void
    onSmokeConnection: (id: string) => void
  }) => (
    <div data-testid={`mcp-card-${server.id}`} data-checking={String(checking)}>
      {server.name}
      <button type="button" onClick={() => onCheckConnection(server.id)}>
        检查-{server.id}
      </button>
      <button type="button" onClick={() => onSmokeConnection(server.id)}>
        验收-{server.id}
      </button>
      <span>{String(smoking)}</span>
      <span>{smokeResult?.summary || ''}</span>
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
    smokeConnectionMock.mockReset()
    toggleMcpServerMock.mockReset()
    deleteMcpServerMock.mockReset()
    createMcpServerMock.mockReset()
    pushNotificationMock.mockReset()

    getMcpServersMock.mockResolvedValue([enabledServer])
    checkConnectionMock.mockResolvedValue({
      success: true,
      message: 'ok',
    })
    smokeConnectionMock.mockResolvedValue({
      ok: true,
      status: 'connected',
      summary: '3/3 steps passed',
      usedToolName: 'echo',
      steps: [
        { name: 'initialize', ok: true, status: 'passed', detail: 'ok' },
        { name: 'tools/list', ok: true, status: 'passed', detail: 'ok' },
        { name: 'tools/call', ok: true, status: 'passed', detail: 'ok' },
      ],
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

  it('runs smoke check and stores structured summary on card', async () => {
    render(<McpPage />)

    await waitFor(() => {
      expect(screen.getByTestId('mcp-card-mcp-1')).toBeTruthy()
    })

    await act(async () => {
      screen.getByRole('button', { name: '验收-mcp-1' }).click()
    })

    await waitFor(() => {
      expect(smokeConnectionMock).toHaveBeenCalledWith('mcp-1')
    })
    await waitFor(() => {
      expect(screen.getByText('3/3 steps passed')).toBeTruthy()
    })
    expect(pushNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '一键验收成功',
      }),
    )
  })
})
