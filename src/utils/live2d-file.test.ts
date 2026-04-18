import { afterEach, describe, expect, it, vi } from 'vitest'

const { convertFileSrcMock } = vi.hoisted(() => ({
  convertFileSrcMock: vi.fn((path: string) => `asset://local/${encodeURIComponent(path)}`),
}))

const { readTextFileMock } = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
}))

const { getCachedSettingsMock } = vi.hoisted(() => ({
  getCachedSettingsMock: vi.fn(),
}))

vi.mock('@/services/settings.service', () => ({
  settingsService: {
    getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: convertFileSrcMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: readTextFileMock,
  exists: vi.fn(async () => false),
}))

import {
  extractLive2DReferencedFiles,
  isLocalAbsolutePath,
  isModel3JsonPath,
  normalizeRelativeReferencePath,
  resolveLive2DModelSource,
  resolveLive2DModelPath,
  validateLive2DModelPath,
} from '@/utils/live2d-file'

afterEach(() => {
  vi.unstubAllGlobals()
  convertFileSrcMock.mockClear()
  readTextFileMock.mockReset()
  getCachedSettingsMock.mockReset()
  getCachedSettingsMock.mockReturnValue({
    fileAccessAllowAll: true,
    fileAccessFolders: [],
    fileAccessBlacklist: [],
  })
})

describe('live2d-file utils', () => {
  it('validates model entry file suffix', () => {
    expect(isModel3JsonPath('/live2d/laffey/Laffey.model3.json')).toBe(true)
    expect(isModel3JsonPath('https://example.com/a.model3.json?x=1')).toBe(true)
    expect(isModel3JsonPath('D:\\model\\foo.json')).toBe(false)
    expect(isModel3JsonPath('foo.model.json')).toBe(false)
  })

  it('detects local absolute paths', () => {
    expect(isLocalAbsolutePath('D:\\models\\foo.model3.json')).toBe(true)
    expect(isLocalAbsolutePath('\\\\server\\share\\foo.model3.json')).toBe(true)
    expect(isLocalAbsolutePath('/usr/local/foo.model3.json')).toBe(true)
    expect(isLocalAbsolutePath('relative/foo.model3.json')).toBe(false)
    expect(isLocalAbsolutePath('https://example.com/foo.model3.json')).toBe(false)
  })

  it('converts desktop local file path into runtime URL', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })

    const result = await resolveLive2DModelPath('D:\\models\\foo.model3.json')

    expect(convertFileSrcMock).toHaveBeenCalledWith('D:\\models\\foo.model3.json')
    expect(result).toBe('asset://local/D%3A%5Cmodels%5Cfoo.model3.json')
  })

  it('keeps path unchanged outside desktop runtime', async () => {
    const result = await resolveLive2DModelPath('/live2d/laffey/Laffey.model3.json')

    expect(convertFileSrcMock).not.toHaveBeenCalled()
    expect(result).toBe('/live2d/laffey/Laffey.model3.json')
  })

  it('extracts referenced files from model3 json', () => {
    const refs = extractLive2DReferencedFiles({
      Version: 3,
      FileReferences: {
        Moc: 'Laffey II.moc3',
        Textures: ['Laffey II.4096/texture_00.png'],
        Physics: 'Laffey II.physics3.json',
        Expressions: [
          { Name: 'blink', File: 'blink.exp3.json' },
        ],
        Motions: {
          idle: [{ File: 'idle.motion3.json' }],
        },
      },
    })

    expect(refs).toEqual(expect.arrayContaining([
      'Laffey II.moc3',
      'Laffey II.4096/texture_00.png',
      'Laffey II.physics3.json',
      'blink.exp3.json',
      'idle.motion3.json',
    ]))
  })

  it('returns empty refs for invalid model payload', () => {
    expect(extractLive2DReferencedFiles(null)).toEqual([])
    expect(extractLive2DReferencedFiles({})).toEqual([])
    expect(extractLive2DReferencedFiles({ FileReferences: {} })).toEqual([])
  })

  it('normalizes relative reference paths with dot segments', () => {
    expect(normalizeRelativeReferencePath('./Laffey Ⅱ.moc3')).toBe('Laffey Ⅱ.moc3')
    expect(normalizeRelativeReferencePath('../models/Laffey Ⅱ.physics3.json')).toBe('models/Laffey Ⅱ.physics3.json')
    expect(normalizeRelativeReferencePath('.\\Laffey Ⅱ.4096\\texture_00.png')).toBe('Laffey Ⅱ.4096/texture_00.png')
  })

  it('normalizes mojibake local refs and converts them to runtime URLs', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    readTextFileMock.mockResolvedValueOnce(JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'Laffey 鈪?moc3',
        Physics: 'Laffey 鈪?physics3.json',
        DisplayInfo: 'Laffey 鈪?cdi3.json',
        Textures: ['Laffey 鈪?4096/texture_00.png'],
      },
    }))

    const source = await resolveLive2DModelSource('D:\\live2d\\laffey2\\Laffey2.model3.json')

    expect(typeof source).toBe('object')
    expect(source).toMatchObject({
      url: 'asset://local/D%3A%5Clive2d%5Claffey2%5CLaffey2.model3.json',
      FileReferences: {
        Moc: 'asset://local/D%3A%5Clive2d%5Claffey2%5CLaffey2.moc3',
        Physics: 'asset://local/D%3A%5Clive2d%5Claffey2%5CLaffey2.physics3.json',
        DisplayInfo: 'asset://local/D%3A%5Clive2d%5Claffey2%5CLaffey2.cdi3.json',
        Textures: ['asset://local/D%3A%5Clive2d%5Claffey2%5CLaffey2.4096%5Ctexture_00.png'],
      },
    })
  })

  it('returns forbiddenPath when local entry is outside allowlist', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    getCachedSettingsMock.mockReturnValue({
      fileAccessAllowAll: false,
      fileAccessFolders: [],
      fileAccessBlacklist: [],
    })

    const result = await validateLive2DModelPath('D:\\live2d\\laffey2\\Laffey2.model3.json')

    expect(result.valid).toBe(false)
    expect(result.forbiddenPath).toMatchObject({
      code: 'forbidden_path',
      reason: 'not_in_allowlist',
      path: 'D:/live2d/laffey2/Laffey2.model3.json',
      context: 'Live2D model entry read',
    })
  })

  it('returns forbiddenPath when path is in blacklist even with allowAll', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    getCachedSettingsMock.mockReturnValue({
      fileAccessAllowAll: true,
      fileAccessFolders: [],
      fileAccessBlacklist: ['D:/live2d/laffey2'],
    })

    const result = await validateLive2DModelPath('D:\\live2d\\laffey2\\Laffey2.model3.json')

    expect(result.valid).toBe(false)
    expect(result.forbiddenPath).toMatchObject({
      code: 'forbidden_path',
      reason: 'in_blacklist',
      path: 'D:/live2d/laffey2/Laffey2.model3.json',
      context: 'Live2D model entry read',
    })
  })
})
