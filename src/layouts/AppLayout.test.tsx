/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppLayout } from '@/layouts/AppLayout'
import { useSettingsStore, useUIStore } from '@/stores'
import { DEFAULT_SETTINGS } from '@/constants'

const retryMock = vi.fn()

function makeHealthState(overrides = {}) {
  return {
    isReachable: true,
    hasChecked: false,
    checking: false,
    lastCheckedAt: null as string | null,
    apiBaseUrl: 'http://127.0.0.1:8001',
    consecutiveFailures: 0,
    wasConnected: false,
    retry: retryMock,
    ...overrides,
  }
}

const useBackendHealthMock = vi.fn(() => makeHealthState())

vi.mock('@/hooks', () => ({
  useBackendHealth: () => useBackendHealthMock(),
  LIKELY_DOWN_THRESHOLD: 3,
}))

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="layout-outlet" />,
}))

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <aside data-testid="layout-sidebar" />,
}))

describe('AppLayout backend preflight banner', () => {
  beforeEach(() => {
    cleanup()
    retryMock.mockReset()
    useBackendHealthMock.mockReset()
    useBackendHealthMock.mockReturnValue(makeHealthState())
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
    })
    useUIStore.setState({
      showNewConversationDialog: false,
    })
  })

  it('shows offline preflight banner with details and retry action', async () => {
    useBackendHealthMock.mockReturnValue(makeHealthState({
      isReachable: false,
      hasChecked: true,
      consecutiveFailures: 5,
      lastCheckedAt: new Date().toISOString(),
    }))

    render(<AppLayout />)

    expect(screen.getByText('后端连接失败')).toBeTruthy()
    expect(screen.queryByText(/API Base URL/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(screen.getByText(/API Base URL/)).toBeTruthy()
    expect(screen.getByText(/连续失败：5 次/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '立即重试' }))
    expect(retryMock).toHaveBeenCalledTimes(1)
  })

  it('hides offline preflight banner when backend is reachable', () => {
    useBackendHealthMock.mockReturnValue(makeHealthState({
      isReachable: true,
      hasChecked: true,
      lastCheckedAt: new Date().toISOString(),
    }))

    render(<AppLayout />)

    expect(screen.queryByText('后端连接失败')).toBeNull()
    expect(screen.queryByText('后端未就绪')).toBeNull()
    expect(screen.getByTestId('layout-sidebar')).toBeTruthy()
    expect(screen.getByTestId('layout-outlet')).toBeTruthy()
  })

  it('shows restarting banner when backend was previously connected', () => {
    useBackendHealthMock.mockReturnValue(makeHealthState({
      isReachable: false,
      hasChecked: true,
      consecutiveFailures: 1,
      wasConnected: true,
      lastCheckedAt: new Date().toISOString(),
    }))

    render(<AppLayout />)

    expect(screen.getByText('后端重启中')).toBeTruthy()
    expect(screen.getByText(/正在自动重试连接/)).toBeTruthy()
  })

  it('shows never-connected banner on first launch without backend', () => {
    useBackendHealthMock.mockReturnValue(makeHealthState({
      isReachable: false,
      hasChecked: true,
      consecutiveFailures: 1,
      wasConnected: false,
      lastCheckedAt: new Date().toISOString(),
    }))

    render(<AppLayout />)

    expect(screen.getByText('后端未就绪')).toBeTruthy()
  })
})
