import { API_BASE_URL } from '@/api'

export const BACKEND_API_BASE_URL = API_BASE_URL

interface CheckBackendHealthOptions {
  timeoutMs?: number
}

export async function checkBackendHealth(
  options: CheckBackendHealthOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 3000
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok
  }
  catch {
    return false
  }
  finally {
    window.clearTimeout(timer)
  }
}
