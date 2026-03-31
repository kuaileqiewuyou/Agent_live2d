import { Routes, Route, Navigate } from 'react-router-dom'
import { useTheme } from '@/hooks'
import { AppLayout } from '@/layouts/AppLayout'
import { ChatPage } from '@/pages/ChatPage'
import { PersonaPage } from '@/pages/PersonaPage'
import { ModelConfigPage } from '@/pages/ModelConfigPage'
import { SkillsPage } from '@/pages/SkillsPage'
import { McpPage } from '@/pages/McpPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { Toaster } from '@/components/ui/toaster'

export function App() {
  useTheme()

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/personas" element={<PersonaPage />} />
          <Route path="/model-config" element={<ModelConfigPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/mcp" element={<McpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}
