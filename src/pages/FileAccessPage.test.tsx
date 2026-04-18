/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FileAccessPage } from '@/pages/FileAccessPage'
import { useSettingsStore } from '@/stores'
import { DEFAULT_SETTINGS } from '@/constants'

const getSettingsMock = vi.fn()
const updateSettingsMock = vi.fn()

vi.mock('@/services', () => ({
  settingsService: {
    getSettings: (...args: unknown[]) => getSettingsMock(...args),
    updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
    getCachedSettings: () => null,
  },
}))

vi.mock('@/utils/live2d-file', () => ({
  isDesktopRuntime: () => false,
}))

function makeSettings(
  overrides: Partial<typeof DEFAULT_SETTINGS> & {
    fileAccessAllowAll?: boolean
    fileAccessFolders?: string[]
    fileAccessBlacklist?: string[]
  } = {},
) {
  return {
    ...DEFAULT_SETTINGS,
    fileAccessMode: 'compat' as const,
    fileAccessAllowAll: true,
    fileAccessFolders: [],
    fileAccessBlacklist: [],
    ...overrides,
  }
}

describe('FileAccessPage', () => {
  beforeEach(() => {
    getSettingsMock.mockReset()
    updateSettingsMock.mockReset()
    useSettingsStore.setState({ settings: makeSettings() })
    cleanup()
  })

  it('renders allowlist and blacklist from backend settings', async () => {
    getSettingsMock.mockResolvedValue(makeSettings({
      fileAccessAllowAll: false,
      fileAccessFolders: ['D:/Else/live2d'],
      fileAccessBlacklist: ['D:/Else/live2d/private'],
    }))
    updateSettingsMock.mockImplementation(async (payload: {
      fileAccessAllowAll?: boolean
      fileAccessFolders?: string[]
      fileAccessBlacklist?: string[]
    }) =>
      makeSettings({
        fileAccessAllowAll: payload.fileAccessAllowAll ?? false,
        fileAccessFolders: payload.fileAccessFolders || [],
        fileAccessBlacklist: payload.fileAccessBlacklist || [],
      }))

    render(<FileAccessPage />)

    await screen.findByText('D:/Else/live2d')
    await screen.findByText('D:/Else/live2d/private')
    expect(screen.getByText('当前共 1 项。')).toBeTruthy()
  })

  it('supports toggling allow-all switch', async () => {
    getSettingsMock.mockResolvedValue(makeSettings({
      fileAccessAllowAll: false,
      fileAccessFolders: ['D:/Else/live2d'],
      fileAccessBlacklist: [],
    }))
    updateSettingsMock.mockImplementation(async (payload: {
      fileAccessAllowAll?: boolean
      fileAccessFolders?: string[]
      fileAccessBlacklist?: string[]
    }) =>
      makeSettings({
        fileAccessAllowAll: payload.fileAccessAllowAll ?? false,
        fileAccessFolders: payload.fileAccessFolders || [],
        fileAccessBlacklist: payload.fileAccessBlacklist || [],
      }))

    render(<FileAccessPage />)
    await screen.findByText('D:/Else/live2d')

    const switchControl = screen.getByRole('switch')
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        fileAccessAllowAll: true,
        fileAccessFolders: ['D:/Else/live2d'],
        fileAccessBlacklist: [],
      }))
    })
  })

  it('supports add/remove allowlist path', async () => {
    getSettingsMock.mockResolvedValue(makeSettings({
      fileAccessAllowAll: false,
      fileAccessFolders: ['D:/Else/live2d'],
    }))
    updateSettingsMock.mockImplementation(async (payload: {
      fileAccessAllowAll?: boolean
      fileAccessFolders?: string[]
      fileAccessBlacklist?: string[]
    }) =>
      makeSettings({
        fileAccessAllowAll: payload.fileAccessAllowAll ?? false,
        fileAccessFolders: payload.fileAccessFolders || [],
        fileAccessBlacklist: payload.fileAccessBlacklist || [],
      }))

    render(<FileAccessPage />)
    await screen.findByText('D:/Else/live2d')

    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: 'd:\\Else\\models\\' } })
    fireEvent.keyDown(inputs[0] as HTMLInputElement, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        fileAccessFolders: ['D:/Else/live2d', 'D:/Else/models'],
      }))
    })

    const deleteButtons = screen.getAllByLabelText('删除白名单目录')
    fireEvent.click(deleteButtons[0] as HTMLButtonElement)

    await waitFor(() => {
      const calls = updateSettingsMock.mock.calls as unknown[][]
      const lastPayload = calls[calls.length - 1]?.[0] as { fileAccessFolders?: string[] }
      expect(lastPayload.fileAccessFolders).toEqual(['D:/Else/models'])
    })
  })

  it('supports add/clear blacklist', async () => {
    getSettingsMock.mockResolvedValue(makeSettings({
      fileAccessAllowAll: true,
      fileAccessFolders: ['D:/Else/live2d'],
      fileAccessBlacklist: [],
    }))
    updateSettingsMock.mockImplementation(async (payload: {
      fileAccessAllowAll?: boolean
      fileAccessFolders?: string[]
      fileAccessBlacklist?: string[]
    }) =>
      makeSettings({
        fileAccessAllowAll: payload.fileAccessAllowAll ?? true,
        fileAccessFolders: payload.fileAccessFolders || [],
        fileAccessBlacklist: payload.fileAccessBlacklist || [],
      }))

    render(<FileAccessPage />)
    await screen.findByText('D:/Else/live2d')

    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: 'D:\\Else\\live2d\\private\\' } })
    fireEvent.keyDown(inputs[1] as HTMLInputElement, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith(expect.objectContaining({
        fileAccessBlacklist: ['D:/Else/live2d/private'],
      }))
    })

    const clearButton = screen.getByRole('button', { name: '清空黑名单' })
    fireEvent.click(clearButton)

    await waitFor(() => {
      const calls = updateSettingsMock.mock.calls as unknown[][]
      const lastPayload = calls[calls.length - 1]?.[0] as { fileAccessBlacklist?: string[] }
      expect(lastPayload.fileAccessBlacklist).toEqual([])
    })
  })
})
