import { Suspense, lazy } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSettingsStore, useUIStore } from '@/stores'

const NewConversationDialog = lazy(async () => {
  const module = await import('@/components/layout/NewConversationDialog')
  return { default: module.NewConversationDialog }
})

export function AppLayout() {
  const { settings } = useSettingsStore()
  const showNewConversationDialog = useUIStore((state) => state.showNewConversationDialog)
  const backgroundValue = settings.backgroundImage?.trim()
  const isGradientBackground
    = !!backgroundValue
      && /^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\(/.test(backgroundValue)
  const backgroundStyle = backgroundValue
    ? isGradientBackground
      ? { background: backgroundValue }
      : { backgroundImage: `url(${backgroundValue})` }
    : undefined

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {backgroundStyle && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            ...backgroundStyle,
            filter: `blur(${settings.backgroundBlur}px)`,
          }}
        />
      )}
      {backgroundStyle && (
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: `rgba(var(--color-background-rgb, 0, 0, 0), ${settings.backgroundOverlayOpacity})`,
          }}
        />
      )}

      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {showNewConversationDialog && (
        <Suspense fallback={null}>
          <NewConversationDialog />
        </Suspense>
      )}
    </div>
  )
}
