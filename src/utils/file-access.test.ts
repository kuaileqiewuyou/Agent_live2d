import { describe, expect, it } from 'vitest'
import {
  evaluateFileAccessPermission,
  getSuggestedFolderForPath,
  hasFileAccessPermission,
  normalizeFileAccessFolderPath,
  normalizeFileAccessFolders,
} from '@/utils/file-access'

describe('file-access utils', () => {
  it('normalizes folder paths and removes duplicates', () => {
    expect(normalizeFileAccessFolders([
      'd:\\Else\\live2d\\',
      'D:/Else/live2d',
      'D:/Else/live2d/sub/',
      'relative/path',
    ])).toEqual(['D:/Else/live2d', 'D:/Else/live2d/sub'])
  })

  it('keeps legacy compat behavior when allowAll is not provided', () => {
    expect(hasFileAccessPermission('D:/Else/live2d/a.model3.json', [])).toBe(true)
    expect(hasFileAccessPermission('D:/Else/live2d/a.model3.json', ['D:/Else/live2d'])).toBe(true)
    expect(hasFileAccessPermission('D:/Else/live2d/sub/a.png', ['D:/Else/live2d'])).toBe(true)
    expect(hasFileAccessPermission('D:/Else/other/a.png', ['D:/Else/live2d'])).toBe(false)
  })

  it('supports allowAll + blacklist strategy', () => {
    expect(hasFileAccessPermission('D:/Else/live2d/a.model3.json', [], { allowAll: true, blacklist: [] })).toBe(true)
    expect(hasFileAccessPermission('D:/Else/live2d/private/a.model3.json', [], {
      allowAll: true,
      blacklist: ['D:/Else/live2d/private'],
    })).toBe(false)

    const decision = evaluateFileAccessPermission('D:/Else/live2d/private/a.model3.json', {
      allowAll: true,
      folders: [],
      blacklist: ['D:/Else/live2d/private'],
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('in_blacklist')
  })

  it('enforces allow-list when allowAll=false', () => {
    expect(hasFileAccessPermission('D:/Else/live2d/a.model3.json', [], { allowAll: false, blacklist: [] })).toBe(false)
    expect(hasFileAccessPermission('D:/Else/live2d/a.model3.json', ['D:/Else/live2d'], {
      allowAll: false,
      blacklist: [],
    })).toBe(true)
  })

  it('normalizes single folder path', () => {
    expect(normalizeFileAccessFolderPath(' /srv/live2d/ ')).toBe('/srv/live2d')
    expect(normalizeFileAccessFolderPath('C:\\')).toBe('C:/')
  })

  it('builds suggested folder from file path', () => {
    expect(getSuggestedFolderForPath('D:/Else/live2d/Laffey.model3.json')).toBe('D:/Else/live2d')
    expect(getSuggestedFolderForPath('D:/Else/live2d')).toBe('D:/Else/live2d')
  })
})
