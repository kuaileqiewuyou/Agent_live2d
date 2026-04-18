/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppLayout } from '@/layouts/AppLayout'
import { DEFAULT_SETTINGS } from '@/constants'
import { useAppStore, useSettingsStore, useUIStore } from '@/stores'

const retryMock = vi.fn()
const RESIZE_HANDLE_NAME = '调整侧边栏宽度'

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
  useNavigate: () => vi.fn(),
}))

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <aside data-testid="layout-sidebar" className="h-full w-full" />,
}))

describe('AppLayout sidebar resize', () => {
  beforeEach(() => {
    cleanup()
    window.localStorage.clear()
    retryMock.mockReset()
    useBackendHealthMock.mockReset()
    useBackendHealthMock.mockReturnValue(makeHealthState())
    useAppStore.setState({
      sidebarCollapsed: false,
    })
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
    })
    useUIStore.setState({
      showNewConversationDialog: false,
    })
  })

  it('renders layout with default sidebar width', () => {
    render(<AppLayout />)

    const shell = screen.getByTestId('sidebar-shell')

    expect((shell as HTMLElement).style.width).toBe('280px')
    expect(screen.getByTestId('layout-sidebar')).toBeTruthy()
    expect(screen.getByTestId('layout-outlet')).toBeTruthy()
    expect(screen.getByRole('button', { name: RESIZE_HANDLE_NAME })).toBeTruthy()
  })

  it('supports drag resize with in-memory updates and persists only on mouseup', () => {
    render(<AppLayout />)

    const shell = screen.getByTestId('sidebar-shell')
    const handle = screen.getByRole('button', { name: RESIZE_HANDLE_NAME })

    expect((shell as HTMLElement).className).toContain('transition-[width]')

    fireEvent.mouseDown(handle, { clientX: 280 })
    expect((shell as HTMLElement).className).not.toContain('transition-[width]')

    fireEvent.mouseMove(window, { clientX: 360 })
    expect(window.localStorage.getItem('app.sidebarWidth')).toBeNull()

    fireEvent.mouseUp(window)

    expect((shell as HTMLElement).style.width).toBe('360px')
    expect((shell as HTMLElement).className).toContain('transition-[width]')
    expect(window.localStorage.getItem('app.sidebarWidth')).toBe('360')
  })

  it('resets width to default on double click', () => {
    render(<AppLayout />)

    const shell = screen.getByTestId('sidebar-shell')
    const handle = screen.getByRole('button', { name: RESIZE_HANDLE_NAME })

    fireEvent.mouseDown(handle, { clientX: 280 })
    fireEvent.mouseMove(window, { clientX: 340 })
    fireEvent.mouseUp(window)
    expect((shell as HTMLElement).style.width).toBe('340px')

    fireEvent.doubleClick(handle)

    expect((shell as HTMLElement).style.width).toBe('280px')
    expect(window.localStorage.getItem('app.sidebarWidth')).toBe('280')
  })

  it('uses collapsed width and hides resize handle when sidebar is collapsed', () => {
    useAppStore.setState({
      sidebarCollapsed: true,
    })

    render(<AppLayout />)

    const shell = screen.getByTestId('sidebar-shell')
    expect((shell as HTMLElement).style.width).toBe('64px')
    expect(screen.queryByRole('button', { name: RESIZE_HANDLE_NAME })).toBeNull()
  })
})
