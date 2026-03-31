import { useState, useEffect } from 'react'
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  ImageIcon,
  X,
  MessageSquare,
  Info,
} from 'lucide-react'
import type { ThemeMode, ChatLayoutMode } from '@/types'
import { cn } from '@/utils'
import { settingsService } from '@/services'
import { useSettingsStore } from '@/stores'
import { APP_NAME, LAYOUT_MODE_LABELS } from '@/constants'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: '浅色', icon: <Sun className="w-4 h-4" /> },
  { value: 'dark', label: '深色', icon: <Moon className="w-4 h-4" /> },
  { value: 'system', label: '跟随系统', icon: <Monitor className="w-4 h-4" /> },
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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    settingsService.getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [setSettings])

  async function handleUpdateSettings(updates: Partial<typeof settings>) {
    updateSettings(updates)
    await settingsService.updateSettings(updates)
  }

  function handleSetTheme(theme: ThemeMode) {
    handleUpdateSettings({ theme })
  }

  function handleSetBackground(bg: string) {
    handleUpdateSettings({ backgroundImage: bg })
  }

  function handleClearBackground() {
    handleUpdateSettings({ backgroundImage: undefined })
  }

  function handleBlurChange(value: number[]) {
    handleUpdateSettings({ backgroundBlur: value[0] })
  }

  function handleOverlayChange(value: number[]) {
    handleUpdateSettings({ backgroundOverlayOpacity: value[0] })
  }

  function handleLayoutModeChange(mode: ChatLayoutMode) {
    handleUpdateSettings({ defaultLayoutMode: mode })
  }

  function handleChooseImage() {
    // In non-Tauri mode, set a sample gradient as demo
    alert('在桌面版中将打开文件选择对话框。\n当前为 Web 模式，请使用下方示例背景。')
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-(--color-muted-foreground) text-sm">
        加载设置中...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-(--color-primary)/10">
            <Settings className="w-5 h-5 text-(--color-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-bold">设置</h1>
            <p className="text-xs text-(--color-muted-foreground)">
              自定义应用外观和行为
            </p>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <ScrollArea className="flex-1 px-6">
        <div className="max-w-2xl space-y-6 pb-6">
          {/* Appearance Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Sun className="w-4.5 h-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">外观设置</CardTitle>
              </div>
              <CardDescription>调整应用的视觉风格和背景</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">主题切换</Label>
                <div className="flex gap-2">
                  {THEME_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={
                        settings.theme === option.value ? 'default' : 'outline'
                      }
                      size="sm"
                      className={cn(
                        'gap-2 flex-1',
                        settings.theme === option.value &&
                          'shadow-sm',
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

              {/* Background Image */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">背景图片</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleChooseImage}
                  >
                    <ImageIcon className="w-4 h-4" />
                    选择图片
                  </Button>
                  {settings.backgroundImage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-(--color-destructive) hover:text-(--color-destructive)"
                      onClick={handleClearBackground}
                    >
                      <X className="w-4 h-4" />
                      清除背景
                    </Button>
                  )}
                </div>

                {/* Sample backgrounds */}
                <div className="space-y-2">
                  <Label className="text-xs text-(--color-muted-foreground)">
                    示例背景
                  </Label>
                  <div className="flex gap-2">
                    {SAMPLE_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.label}
                        className={cn(
                          'w-16 h-10 rounded-lg border-2 transition-all cursor-pointer hover:scale-105',
                          settings.backgroundImage === bg.value
                            ? 'border-(--color-primary) shadow-md'
                            : 'border-(--color-border)',
                        )}
                        style={{ background: bg.value }}
                        onClick={() => handleSetBackground(bg.value)}
                        title={bg.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {settings.backgroundImage && (
                  <div className="space-y-2">
                    <Label className="text-xs text-(--color-muted-foreground)">
                      预览
                    </Label>
                    <div
                      className="w-full h-24 rounded-lg border border-(--color-border) overflow-hidden relative"
                      style={{ background: settings.backgroundImage }}
                    >
                      {settings.backgroundBlur > 0 && (
                        <div
                          className="absolute inset-0"
                          style={{
                            backdropFilter: `blur(${settings.backgroundBlur}px)`,
                          }}
                        />
                      )}
                      {settings.backgroundOverlayOpacity > 0 && (
                        <div
                          className="absolute inset-0 bg-(--color-background)"
                          style={{
                            opacity: settings.backgroundOverlayOpacity,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Background Blur */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">背景模糊度</Label>
                  <span className="text-xs text-(--color-muted-foreground) tabular-nums">
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

              {/* Background Overlay Opacity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">遮罩透明度</Label>
                  <span className="text-xs text-(--color-muted-foreground) tabular-nums">
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

          {/* Chat Settings Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4.5 h-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">聊天设置</CardTitle>
              </div>
              <CardDescription>配置聊天界面的默认行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Default Layout Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">默认聊天模式</Label>
                  <p className="text-xs text-(--color-muted-foreground) mt-0.5">
                    新建对话时使用的默认布局
                  </p>
                </div>
                <Select
                  value={settings.defaultLayoutMode}
                  onValueChange={(v: ChatLayoutMode) =>
                    handleLayoutModeChange(v)
                  }
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(LAYOUT_MODE_LABELS) as [
                        ChatLayoutMode,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* About Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Info className="w-4.5 h-4.5 text-(--color-muted-foreground)" />
                <CardTitle className="text-base">关于</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">
                  应用名称
                </span>
                <span className="text-sm font-medium">{APP_NAME}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">
                  版本
                </span>
                <span className="text-sm font-medium font-mono">v0.1.0</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--color-muted-foreground)">
                  界面语言
                </span>
                <span className="text-sm text-(--color-muted-foreground)">
                  中文（暂不可更改）
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
