/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/constants'
import { LEGACY_FILE_ACCESS_FOLDERS_KEY } from '@/utils'

const apiRequestMock = vi.fn()
const isMockModeMock = vi.fn(() => false)

vi.mock('@/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  isMockMode: () => isMockModeMock(),
}))

describe('settingsService file access sync', () => {
  beforeEach(() => {
    vi.resetModules()
    apiRequestMock.mockReset()
    isMockModeMock.mockReset()
    isMockModeMock.mockReturnValue(false)
    window.localStorage.clear()
  })

  it('migrates legacy file access folders into backend settings when backend is still allow-all', async () => {
    window.localStorage.setItem(
      LEGACY_FILE_ACCESS_FOLDERS_KEY,
      JSON.stringify(['d:\\Else\\live2d\\']),
    )

    apiRequestMock.mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/settings' && !options) {
        return {
          success: true,
          data: {
            ...DEFAULT_SETTINGS,
            fileAccessMode: 'compat',
            fileAccessAllowAll: true,
            fileAccessFolders: [],
            fileAccessBlacklist: [],
          },
        }
      }
      if (endpoint === '/api/settings' && options?.method === 'PATCH') {
        return {
          success: true,
          data: {
            ...DEFAULT_SETTINGS,
            fileAccessMode: 'compat',
            fileAccessAllowAll: false,
            fileAccessFolders: ['D:/Else/live2d'],
            fileAccessBlacklist: [],
          },
        }
      }
      throw new Error(`unexpected endpoint: ${endpoint}`)
    })

    const { settingsService } = await import('@/services/settings.service')
    const settings = await settingsService.getSettings()

    expect(settings.fileAccessMode).toBe('compat')
    expect(settings.fileAccessAllowAll).toBe(false)
    expect(settings.fileAccessFolders).toEqual(['D:/Else/live2d'])
    expect(settings.fileAccessBlacklist).toEqual([])
    expect(apiRequestMock).toHaveBeenCalledTimes(2)
    const [, patchOptions] = apiRequestMock.mock.calls[1] as [string, RequestInit]
    const patchBody = JSON.parse(String(patchOptions.body))
    expect(patchBody.fileAccessAllowAll).toBe(false)
    expect(patchBody.fileAccessFolders).toEqual(['D:/Else/live2d'])
  })

  it('normalizes fileAccess folders and blacklist before update', async () => {
    apiRequestMock.mockResolvedValue({
      success: true,
      data: {
        ...DEFAULT_SETTINGS,
        fileAccessMode: 'compat',
        fileAccessAllowAll: false,
        fileAccessFolders: ['D:/Else/live2d'],
        fileAccessBlacklist: ['D:/Else/live2d/private'],
      },
    })

    const { settingsService } = await import('@/services/settings.service')
    const updated = await settingsService.updateSettings({
      fileAccessAllowAll: false,
      fileAccessFolders: ['d:\\Else\\live2d\\', 'D:/Else/live2d'],
      fileAccessBlacklist: ['d:\\Else\\live2d\\private\\', 'D:/Else/live2d/private'],
    })

    expect(updated.fileAccessAllowAll).toBe(false)
    expect(updated.fileAccessFolders).toEqual(['D:/Else/live2d'])
    expect(updated.fileAccessBlacklist).toEqual(['D:/Else/live2d/private'])

    const [, options] = apiRequestMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(options.body))
    expect(body.fileAccessMode).toBe('compat')
    expect(body.fileAccessAllowAll).toBe(false)
    expect(body.fileAccessFolders).toEqual(['D:/Else/live2d'])
    expect(body.fileAccessBlacklist).toEqual(['D:/Else/live2d/private'])
  })
})
