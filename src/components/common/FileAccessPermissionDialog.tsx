import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, FolderPlus, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { normalizeFileAccessFolders } from '@/utils'
import { settingsService } from '@/services'
import { useFileAccessRequestStore, useNotificationStore, useSettingsStore } from '@/stores'

export function FileAccessPermissionDialog() {
  const navigate = useNavigate()
  const pushNotification = useNotificationStore((state) => state.push)
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const current = useFileAccessRequestStore((state) => state.current)
  const resolveCurrent = useFileAccessRequestStore((state) => state.resolveCurrent)
  const [submitting, setSubmitting] = useState(false)

  const suggestedFolder = useMemo(() => {
    if (!current) return ''
    return (current.suggestedFolder || '').trim() || (current.path || '').trim()
  }, [current])

  const blacklisted = current?.reason === 'in_blacklist'

  if (!current) return null

  async function handleAllowFolder() {
    if (!suggestedFolder) {
      resolveCurrent()
      return
    }

    const nextFolders = normalizeFileAccessFolders([...(settings.fileAccessFolders || []), suggestedFolder])
    setSubmitting(true)
    try {
      const saved = await settingsService.updateSettings({
        fileAccessAllowAll: settings.fileAccessAllowAll,
        fileAccessFolders: nextFolders,
        fileAccessBlacklist: settings.fileAccessBlacklist,
      })
      setSettings(saved)
      pushNotification({
        type: 'success',
        title: '已授权目录访问',
        description: suggestedFolder,
      })
      resolveCurrent()
    }
    catch (error) {
      pushNotification({
        type: 'error',
        title: '授权失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
      })
    }
    finally {
      setSubmitting(false)
    }
  }

  function handleOpenSettings() {
    resolveCurrent()
    navigate('/settings/file-access')
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) resolveCurrent() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {blacklisted ? <Ban className="h-5 w-5 text-red-500" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}
            文件访问权限请求
          </DialogTitle>
          <DialogDescription>
            {blacklisted
              ? '该路径被黑名单规则阻止，不能自动授权。'
              : '当前功能访问本地文件时被权限策略拦截。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-(--color-border) bg-(--color-muted)/20 p-3 text-sm">
          <div><span className="text-(--color-muted-foreground)">来源：</span>{current.source.toUpperCase()}</div>
          <div className="break-all"><span className="text-(--color-muted-foreground)">目标路径：</span>{current.path}</div>
          {current.context && (
            <div><span className="text-(--color-muted-foreground)">上下文：</span>{current.context}</div>
          )}
          {!blacklisted && suggestedFolder && (
            <div className="break-all">
              <span className="text-(--color-muted-foreground)">建议授权目录：</span>{suggestedFolder}
            </div>
          )}
        </div>

        <DialogFooter>
          {blacklisted ? (
            <>
              <Button variant="outline" onClick={resolveCurrent}>关闭</Button>
              <Button onClick={handleOpenSettings}>去文件权限设置处理</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={resolveCurrent} disabled={submitting}>暂不授权</Button>
              <Button onClick={() => void handleAllowFolder()} disabled={submitting || !suggestedFolder}>
                <FolderPlus className="h-4 w-4" />
                允许访问此目录
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
