import { Outlet } from 'react-router-dom'
import { useSettingsStore } from '@/stores'
import { Sidebar } from '@/components/layout/Sidebar'
import { NewConversationDialog } from '@/components/layout/NewConversationDialog'

export function AppLayout() {
  const { settings } = useSettingsStore()

  return (
    <div className="h-screen w-screen overflow-hidden flex relative">
      {/* Background image layer */}
      {settings.backgroundImage && (
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{
            backgroundImage: `url(${settings.backgroundImage})`,
            filter: `blur(${settings.backgroundBlur}px)`,
          }}
        />
      )}
      {settings.backgroundImage && (
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: `rgba(var(--color-background-rgb, 0, 0, 0), ${settings.backgroundOverlayOpacity})`,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <NewConversationDialog />
    </div>
  )
}
