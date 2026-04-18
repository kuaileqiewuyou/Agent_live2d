import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Folder, FolderOpen, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_SETTINGS } from '@/constants'
import { settingsService } from '@/services'
import { useNotificationStore, useSettingsStore } from '@/stores'
import { isLocalAbsolutePath, normalizeFileAccessFolderPath, normalizeFileAccessFolders } from '@/utils'
import { isDesktopRuntime } from '@/utils/live2d-file'

interface FileAccessSnapshot {
  fileAccessAllowAll: boolean
  fileAccessFolders: string[]
  fileAccessBlacklist: string[]
}

function normalizeSnapshot(snapshot: FileAccessSnapshot): FileAccessSnapshot {
  return {
    fileAccessAllowAll: Boolean(snapshot.fileAccessAllowAll),
    fileAccessFolders: normalizeFileAccessFolders(snapshot.fileAccessFolders || []),
    fileAccessBlacklist: normalizeFileAccessFolders(snapshot.fileAccessBlacklist || []),
  }
}

function samePath(left: string, right: string): boolean {
  return normalizeFileAccessFolderPath(left).toLowerCase() === normalizeFileAccessFolderPath(right).toLowerCase()
}

export function FileAccessPage() {
  const pushNotification = useNotificationStore((state) => state.push)
  const storeSettings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const settings = storeSettings || { ...DEFAULT_SETTINGS }
  const [folders, setFolders] = useState<string[]>([])
  const [blacklist, setBlacklist] = useState<string[]>([])
  const [allowAll, setAllowAll] = useState<boolean>(true)
  const [manualPath, setManualPath] = useState('')
  const [blacklistPath, setBlacklistPath] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const isDesktop = useMemo(() => isDesktopRuntime(), [])

  const reloadFromSettings = useCallback(async () => {
    try {
      const latest = await settingsService.getSettings()
      setSettings(latest)
      const normalized = normalizeSnapshot({
        fileAccessAllowAll: latest.fileAccessAllowAll,
        fileAccessFolders: latest.fileAccessFolders || [],
        fileAccessBlacklist: latest.fileAccessBlacklist || [],
      })
      setAllowAll(normalized.fileAccessAllowAll)
      setFolders(normalized.fileAccessFolders)
      setBlacklist(normalized.fileAccessBlacklist)
    }
    catch (error) {
      const fallback = useSettingsStore.getState().settings || { ...DEFAULT_SETTINGS }
      const normalized = normalizeSnapshot({
        fileAccessAllowAll: fallback.fileAccessAllowAll,
        fileAccessFolders: fallback.fileAccessFolders || [],
        fileAccessBlacklist: fallback.fileAccessBlacklist || [],
      })
      setAllowAll(normalized.fileAccessAllowAll)
      setFolders(normalized.fileAccessFolders)
      setBlacklist(normalized.fileAccessBlacklist)
      pushNotification({
        type: 'error',
        title: '读取文件权限失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }, [pushNotification, setSettings])

  useEffect(() => {
    void reloadFromSettings()
  }, [reloadFromSettings])

  const saveFileAccess = useCallback(async (nextSnapshot: FileAccessSnapshot) => {
    const normalized = normalizeSnapshot(nextSnapshot)
    const previousSettings = settings
    const optimistic = {
      ...settings,
      fileAccessMode: 'compat' as const,
      fileAccessAllowAll: normalized.fileAccessAllowAll,
      fileAccessFolders: normalized.fileAccessFolders,
      fileAccessBlacklist: normalized.fileAccessBlacklist,
    }

    setIsSaving(true)
    setSettings(optimistic)
    setAllowAll(normalized.fileAccessAllowAll)
    setFolders(normalized.fileAccessFolders)
    setBlacklist(normalized.fileAccessBlacklist)

    try {
      const saved = await settingsService.updateSettings({
        fileAccessMode: 'compat',
        fileAccessAllowAll: normalized.fileAccessAllowAll,
        fileAccessFolders: normalized.fileAccessFolders,
        fileAccessBlacklist: normalized.fileAccessBlacklist,
      })
      const normalizedSaved = normalizeSnapshot({
        fileAccessAllowAll: saved.fileAccessAllowAll,
        fileAccessFolders: saved.fileAccessFolders || [],
        fileAccessBlacklist: saved.fileAccessBlacklist || [],
      })
      setSettings(saved)
      setAllowAll(normalizedSaved.fileAccessAllowAll)
      setFolders(normalizedSaved.fileAccessFolders)
      setBlacklist(normalizedSaved.fileAccessBlacklist)
    }
    catch (error) {
      setSettings(previousSettings)
      const normalizedPrevious = normalizeSnapshot({
        fileAccessAllowAll: previousSettings.fileAccessAllowAll,
        fileAccessFolders: previousSettings.fileAccessFolders || [],
        fileAccessBlacklist: previousSettings.fileAccessBlacklist || [],
      })
      setAllowAll(normalizedPrevious.fileAccessAllowAll)
      setFolders(normalizedPrevious.fileAccessFolders)
      setBlacklist(normalizedPrevious.fileAccessBlacklist)
      pushNotification({
        type: 'error',
        title: '保存文件权限失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setIsSaving(false)
    }
  }, [setSettings, settings, pushNotification])

  const handleAllowAllToggle = useCallback((checked: boolean) => {
    void saveFileAccess({
      fileAccessAllowAll: checked,
      fileAccessFolders: folders,
      fileAccessBlacklist: blacklist,
    })
    pushNotification({
      type: 'info',
      title: checked ? '已开启完全访问权限' : '已关闭完全访问权限',
      description: checked
        ? '白名单限制已放开，但黑名单仍会优先拦截。'
        : '仅白名单目录可访问（黑名单仍优先拦截）。',
    })
  }, [blacklist, folders, pushNotification, saveFileAccess])

  const handleAddAllowlistManual = useCallback(() => {
    const normalized = normalizeFileAccessFolderPath(manualPath)
    if (!normalized) return

    if (!isLocalAbsolutePath(normalized)) {
      pushNotification({
        type: 'error',
        title: '路径格式不正确',
        description: '请填写本地绝对目录路径，例如 D:\\data\\models。',
      })
      return
    }

    const nextFolders = normalizeFileAccessFolders([...folders, normalized])
    if (nextFolders.length === folders.length) {
      pushNotification({
        type: 'info',
        title: '目录已存在',
        description: normalized,
      })
      return
    }

    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: nextFolders,
      fileAccessBlacklist: blacklist,
    })
    setManualPath('')
    pushNotification({
      type: 'success',
      title: '已添加白名单目录',
      description: normalized,
    })
  }, [allowAll, blacklist, folders, manualPath, pushNotification, saveFileAccess])

  const handleAddBlacklistManual = useCallback(() => {
    const normalized = normalizeFileAccessFolderPath(blacklistPath)
    if (!normalized) return

    if (!isLocalAbsolutePath(normalized)) {
      pushNotification({
        type: 'error',
        title: '路径格式不正确',
        description: '请填写本地绝对目录路径，例如 D:\\data\\private。',
      })
      return
    }

    const nextBlacklist = normalizeFileAccessFolders([...blacklist, normalized])
    if (nextBlacklist.length === blacklist.length) {
      pushNotification({
        type: 'info',
        title: '黑名单目录已存在',
        description: normalized,
      })
      return
    }

    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: folders,
      fileAccessBlacklist: nextBlacklist,
    })
    setBlacklistPath('')
    pushNotification({
      type: 'success',
      title: '已添加黑名单目录',
      description: normalized,
    })
  }, [allowAll, blacklist, blacklistPath, folders, pushNotification, saveFileAccess])

  const handleBrowseDirectory = useCallback(async (target: 'allowlist' | 'blacklist') => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: false,
        title: target === 'allowlist' ? '选择白名单目录' : '选择黑名单目录',
      })

      if (!selected || typeof selected !== 'string') return
      const normalized = normalizeFileAccessFolderPath(selected)
      if (!normalized || !isLocalAbsolutePath(normalized)) {
        pushNotification({
          type: 'error',
          title: '目录无效',
          description: '请选择本地绝对目录。',
        })
        return
      }

      if (target === 'allowlist') {
        const nextFolders = normalizeFileAccessFolders([...folders, normalized])
        if (nextFolders.length === folders.length) {
          pushNotification({
            type: 'info',
            title: '目录已存在',
            description: normalized,
          })
          return
        }
        await saveFileAccess({
          fileAccessAllowAll: allowAll,
          fileAccessFolders: nextFolders,
          fileAccessBlacklist: blacklist,
        })
        pushNotification({
          type: 'success',
          title: '已添加白名单目录',
          description: normalized,
        })
        return
      }

      const nextBlacklist = normalizeFileAccessFolders([...blacklist, normalized])
      if (nextBlacklist.length === blacklist.length) {
        pushNotification({
          type: 'info',
          title: '黑名单目录已存在',
          description: normalized,
        })
        return
      }
      await saveFileAccess({
        fileAccessAllowAll: allowAll,
        fileAccessFolders: folders,
        fileAccessBlacklist: nextBlacklist,
      })
      pushNotification({
        type: 'success',
        title: '已添加黑名单目录',
        description: normalized,
      })
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '选择目录失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
  }, [allowAll, blacklist, folders, pushNotification, saveFileAccess])

  const handleRemoveAllowlist = useCallback((path: string) => {
    const nextFolders = folders.filter(item => !samePath(item, path))
    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: nextFolders,
      fileAccessBlacklist: blacklist,
    })
    pushNotification({
      type: 'success',
      title: '已移除白名单目录',
      description: path,
    })
  }, [allowAll, blacklist, folders, pushNotification, saveFileAccess])

  const handleRemoveBlacklist = useCallback((path: string) => {
    const nextBlacklist = blacklist.filter(item => !samePath(item, path))
    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: folders,
      fileAccessBlacklist: nextBlacklist,
    })
    pushNotification({
      type: 'success',
      title: '已移除黑名单目录',
      description: path,
    })
  }, [allowAll, blacklist, folders, pushNotification, saveFileAccess])

  const handleClearAllowlist = useCallback(() => {
    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: [],
      fileAccessBlacklist: blacklist,
    })
    pushNotification({
      type: 'info',
      title: '已清空白名单',
      description: 'compat 策略下，白名单为空时行为由“完全访问权限”开关决定。',
    })
  }, [allowAll, blacklist, pushNotification, saveFileAccess])

  const handleClearBlacklist = useCallback(() => {
    void saveFileAccess({
      fileAccessAllowAll: allowAll,
      fileAccessFolders: folders,
      fileAccessBlacklist: [],
    })
    pushNotification({
      type: 'info',
      title: '已清空黑名单',
    })
  }, [allowAll, folders, pushNotification, saveFileAccess])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-(--color-border) px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary)/10">
            <ShieldCheck className="h-5 w-5 text-(--color-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">文件访问权限详细设置</h1>
            <p className="text-xs text-(--color-muted-foreground)">
              策略优先级：黑名单 &gt; 完全访问权限 &gt; 白名单（compat）。
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">访问策略</CardTitle>
              <CardDescription>
                完全访问权限开启时允许访问所有本地目录，但黑名单仍然优先拦截。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-(--color-border) px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="file-access-allow-all" className="text-sm font-medium">
                    完全访问权限
                  </Label>
                  <p className="text-xs text-(--color-muted-foreground)">
                    {allowAll ? '当前已开启：白名单不限制访问。' : '当前已关闭：仅白名单目录可访问。'}
                  </p>
                </div>
                <Switch
                  id="file-access-allow-all"
                  checked={allowAll}
                  onCheckedChange={handleAllowAllToggle}
                  disabled={isSaving}
                />
              </div>
              <p className="text-xs text-(--color-muted-foreground)">
                本地单机场景下，Tauri 读取 scope 已放宽，真正访问限制由此策略执行。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">白名单目录（允许访问）</CardTitle>
              <CardDescription>当前共 {folders.length} 项。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={manualPath}
                  onChange={(event) => setManualPath(event.target.value)}
                  placeholder="输入绝对目录路径，例如 D:\\data\\models"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddAllowlistManual()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddAllowlistManual} disabled={!manualPath.trim() || isSaving}>
                  <Plus className="h-4 w-4" />
                  添加
                </Button>
                {isDesktop && (
                  <Button type="button" onClick={() => void handleBrowseDirectory('allowlist')} disabled={isSaving}>
                    <FolderOpen className="h-4 w-4" />
                    浏览文件夹
                  </Button>
                )}
              </div>

              {folders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-(--color-border) px-4 py-6 text-center text-sm text-(--color-muted-foreground)">
                  当前白名单为空。
                </div>
              ) : (
                <div className="space-y-2">
                  {folders.map(path => (
                    <div
                      key={path}
                      className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Folder className="h-4 w-4 text-(--color-primary)" />
                          <span className="truncate">{path}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveAllowlist(path)}
                        aria-label="删除白名单目录"
                        disabled={isSaving}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {folders.length > 0 && (
                <Button type="button" variant="outline" onClick={handleClearAllowlist} disabled={isSaving}>
                  清空白名单
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ban className="h-4 w-4 text-red-500" />
                黑名单目录（禁止访问）
              </CardTitle>
              <CardDescription>当前共 {blacklist.length} 项。黑名单规则优先级最高。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={blacklistPath}
                  onChange={(event) => setBlacklistPath(event.target.value)}
                  placeholder="输入绝对目录路径，例如 D:\\data\\private"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddBlacklistManual()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddBlacklistManual} disabled={!blacklistPath.trim() || isSaving}>
                  <Plus className="h-4 w-4" />
                  添加
                </Button>
                {isDesktop && (
                  <Button type="button" onClick={() => void handleBrowseDirectory('blacklist')} disabled={isSaving}>
                    <FolderOpen className="h-4 w-4" />
                    浏览文件夹
                  </Button>
                )}
              </div>

              {blacklist.length === 0 ? (
                <div className="rounded-lg border border-dashed border-(--color-border) px-4 py-6 text-center text-sm text-(--color-muted-foreground)">
                  当前黑名单为空。
                </div>
              ) : (
                <div className="space-y-2">
                  {blacklist.map(path => (
                    <div
                      key={path}
                      className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Ban className="h-4 w-4 text-red-500" />
                          <span className="truncate">{path}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveBlacklist(path)}
                        aria-label="删除黑名单目录"
                        disabled={isSaving}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {blacklist.length > 0 && (
                <Button type="button" variant="outline" onClick={handleClearBlacklist} disabled={isSaving}>
                  清空黑名单
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
