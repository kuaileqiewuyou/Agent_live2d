import { useEffect } from 'react'
import { useSettingsStore } from '@/stores'

export function useTheme() {
  const { settings, setTheme } = useSettingsStore()

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (mode: 'light' | 'dark') => {
      root.classList.remove('light', 'dark')
      root.classList.add(mode)
    }

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(settings.theme)
    }
  }, [settings.theme])

  return { theme: settings.theme, setTheme }
}
