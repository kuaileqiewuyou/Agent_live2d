import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  ImageIcon,
  Info,
  MessageSquare,
  Monitor,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import type { ChatLayoutMode, ThemeMode } from '@/types'
import { APP_NAME, LAYOUT_MODE_LABELS } from '@/constants'
import { settingsService } from '@/services'
import { useNotificationStore, useSettingsStore } from '@/stores'
import { cn } from '@/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'

const THEME_OPTIONS: { value: ThemeMode, label: string, icon: ReactNode }[] = [
  { value: 'light', label: '浅色', icon: <Sun className="h-4 w-4" /> },
  { value: 'dark', label: '深色', icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: '跟随系统', icon: <Monitor className="h-4 w-4" /> },
]

const SAMPLE_BACKGROUNDS = [
  {
    label: '渐变 A',
    value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    label: '渐变 B',
    value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    label: '渐变 C',
    value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
]

export function SettingsPage() {
  const { settings, setSettings, updateSettings } = useSettingsStore()
  const pushNotification = useNotificationStore((state) => state.push)
  const [loaded, setLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const savedSettings = await settingsService.getSettings()
        setSettings(savedSettings)
      }
      catch (error) {
        pushNotification({
          type: 'error',
          title: '加载设置失败',
          description: error instanceof Error ? error.message : '请稍后再试。',
        })
      }
      finally {
        setLoaded(true)
      }
    }

    void loadSettings()
  }, [pushNotification, setSettings])

  async function handleUpdateSettings(updates: Partial<typeof settings>) {
    const previousSettings = settings
    updateSettings(updates)

    try {
      const savedSettings = await settingsService.updateSettings(updates)
      setSettings(savedSettings)
    }
    catch (error) {
      setSettings(previousSettings)
      pushNotification({
        type: 'error',
        title: '保存设置失败',
        description: error instanceof Error ? error.message : '请稍后再试。',
      })
    }
  }

  function handleSetTheme(theme: ThemeMode) {
    void handleUpdateSettings({ theme })
  }

  function handleSetBackground(backgroundImage: string) {
    void handleUpdateSettings({ backgroundImage })
  }

  function handleClearBackground() {
    void handleUpdateSettings({ backgroundImage: null })
  }

  function handleBlurChange(value: number[]) {
    void handleUpdateSettings({ backgroundBlur: value[0] })
  }

  function handleOverlayChange(value: number[]) {
    void handleUpdateSettings({ backgroundOverlayOpacity: value[0] })
  }

  function handleLayoutModeChange(mode: ChatLayoutMode) {
    void handleUpdateSettings({ defaultLayoutMode: mode })
  }

  function handleChooseImage() {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      pushNotification({
        type: 'error',
        title: '文件类型不支持',
        description: '请选择 PNG、JPG、WEBP 或 SVG 图片。',
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      pushNotification({
        type: 'error',
        title: '图片过大',
        description: '为了保证加载体验，请将背景图控制在 5MB 以内。',
      })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (!result) {
        pushNotification({
          type: 'error',
          title: '图片读取失败',
          description: '请重试一次，或更换一张图片。',
        })
        return
      }

      void handleUpdateSettings({ backgroundImage: result })
    }
    reader.onerror = () => {
      pushNotification({
        type: 'error',
        title: '图片读取失败',
        description: '请重试一次，或更换一张图片。',
      })
    }
    reader.readAsDataURL(file)
  }

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-(--color-muted-foreground)">
        正在加载设置...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary)/10">
            <Settings className="h-5 w-5 text-(--color-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-bold">设置</h1>
            <p className="text-xs text-(--color-muted-foreground)">
              自定义应用外观和默认行为
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6">
        <div className="max-w-2xl space-y-6 pb-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Sun className="h-4.5 w-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">外观设置</CardTitle>
              </div>
              <CardDescription>调整应用的视觉风格、背景和氛围效果。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">主题切换</Label>
                <div className="flex gap-2">
                  {THEME_OPTIONS.map(option => (
                    <Button
                      key={option.value}
                      variant={settings.theme === option.value ? 'default' : 'outline'}
                      size="sm"
                      className={cn(
                        'flex-1 gap-2',
                        settings.theme === option.value && 'shadow-sm',
                      )}
                      onClick={() => handleSetTheme(option.value)}
                    >
                      {option.icon}
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">背景</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleChooseImage}
                  >
                    <ImageIcon className="h-4 w-4" />
                    上传背景图
                  </Button>
                  {settings.backgroundImage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-(--color-destructive) hover:text-(--color-destructive)"
                      onClick={handleClearBackground}
                    >
                      <X className="h-4 w-4" />
                      删除背景
                    </Button>
                  )}
                </div>
                <p className="text-xs text-(--color-muted-foreground)">
                  Web 版支持直接上传本地图片，桌面端后续可再补文件路径接入。
                </p>

                <div className="space-y-2">
                  <Label className="text-xs text-(--color-muted-foreground)">
                    示例背景
                  </Label>
                  <div className="flex gap-2">
                    {SAMPLE_BACKGROUNDS.map(background => (
                      <button
                        key={background.label}
                        type="button"
                        aria-label={`示例背景 ${background.label}`}
                        className={cn(
                          'h-10 w-16 cursor-pointer rounded-lg border-2 transition-all hover:scale-105',
                          settings.backgroundImage === background.value
                            ? 'border-(--color-primary) shadow-md'
                            : 'border-(--color-border)',
                        )}
                        style={{ background: background.value }}
                        onClick={() => handleSetBackground(background.value)}
                        title={background.label}
                      />
                    ))}
                  </div>
                </div>

                {settings.backgroundImage && (
                  <div className="space-y-2">
                    <Label className="text-xs text-(--color-muted-foreground)">
                      预览
                    </Label>
                    <div
                      className="relative h-24 w-full overflow-hidden rounded-lg border border-(--color-border)"
                      style={{ background: settings.backgroundImage }}
                    >
                      {settings.backgroundBlur > 0 && (
                        <div
                          className="absolute inset-0"
                          style={{ backdropFilter: `blur(${settings.backgroundBlur}px)` }}
                        />
                      )}
                      {settings.backgroundOverlayOpacity > 0 && (
                        <div
                          className="absolute inset-0 bg-(--color-background)"
                          style={{ opacity: settings.backgroundOverlayOpacity }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">背景模糊度</Label>
                  <span className="text-xs tabular-nums text-(--color-muted-foreground)">
                    {settings.backgroundBlur}px
                  </span>
                </div>
                <Slider
                  value={[settings.backgroundBlur]}
                  min={0}
                  max={20}
                  step={1}
                  onValueChange={handleBlurChange}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">遮罩透明度</Label>
                  <span className="text-xs tabular-nums text-(--color-muted-foreground)">
                    {settings.backgroundOverlayOpacity.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[settings.backgroundOverlayOpacity]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={handleOverlayChange}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4.5 w-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">聊天设置</CardTitle>
              </div>
              <CardDescription>配置新建会话时默认使用的布局模式。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">默认聊天模式</Label>
                  <p className="mt-0.5 text-xs text-(--color-muted-foreground)">
                    新建对话时使用的默认布局。
                  </p>
                </div>
                <Select
                  value={settings.defaultLayoutMode}
                  onValueChange={(value: ChatLayoutMode) => handleLayoutModeChange(value)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LAYOUT_MODE_LABELS) as [ChatLayoutMode, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Info className="h-4.5 w-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">关于</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">应用名称</span>
                <span className="text-sm font-medium">{APP_NAME}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">版本</span>
                <span className="font-mono text-sm font-medium">v0.1.0</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">界面语言</span>
                <span className="text-sm text-(--color-muted-foreground)">中文（当前固定）</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
