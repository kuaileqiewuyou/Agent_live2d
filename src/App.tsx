import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTheme } from '@/hooks'
import { settingsService } from '@/services'
import { useNotificationStore, useSettingsStore } from '@/stores'
import { Toaster } from '@/components/ui/toaster'
import { AppLayout } from '@/layouts/AppLayout'

const ChatPage = lazy(async () => {
  const module = await import('@/pages/ChatPage')
  return { default: module.ChatPage }
})
const PersonaPage = lazy(async () => {
  const module = await import('@/pages/PersonaPage')
  return { default: module.PersonaPage }
})
const ModelConfigPage = lazy(async () => {
  const module = await import('@/pages/ModelConfigPage')
  return { default: module.ModelConfigPage }
})
const SkillsPage = lazy(async () => {
  const module = await import('@/pages/SkillsPage')
  return { default: module.SkillsPage }
})
const McpPage = lazy(async () => {
  const module = await import('@/pages/McpPage')
  return { default: module.McpPage }
})
const MemoryPage = lazy(async () => {
  const module = await import('@/pages/MemoryPage')
  return { default: module.MemoryPage }
})
const Live2DModelsPage = lazy(async () => {
  const module = await import('@/pages/Live2DModelsPage')
  return { default: module.Live2DModelsPage }
})
const SettingsPage = lazy(async () => {
  const module = await import('@/pages/SettingsPage')
  return { default: module.SettingsPage }
})
const FileAccessPage = lazy(async () => {
  const module = await import('@/pages/FileAccessPage')
  return { default: module.FileAccessPage }
})

function PageFallback() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-(--color-muted-foreground)">
      正在加载页面...
    </div>
  )
}

export function App() {
  useTheme()
  const setSettings = useSettingsStore((state) => state.setSettings)
  const pushNotification = useNotificationStore((state) => state.push)

  useEffect(() => {
    let cancelled = false

    async function bootstrapSettings() {
      try {
        const savedSettings = await settingsService.getSettings()
        if (!cancelled) {
          setSettings(savedSettings)
        }
      }
      catch (error) {
        if (!cancelled) {
          pushNotification({
            type: 'error',
            title: '加载全局设置失败',
            description: error instanceof Error ? error.message : '请稍后再试。',
          })
        }
      }
    }

    void bootstrapSettings()

    return () => {
      cancelled = true
    }
  }, [pushNotification, setSettings])

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/personas" element={<PersonaPage />} />
            <Route path="/model-config" element={<ModelConfigPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/live2d" element={<Live2DModelsPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/file-access" element={<FileAccessPage />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
