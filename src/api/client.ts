const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

import { keysToCamel, keysToSnake } from '@/utils/case-convert'

export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

/**
 * Unified API request helper.
 * - Convert request JSON body from camelCase to snake_case.
 * - Convert response payload from snake_case to camelCase.
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  if (USE_MOCK) {
    throw new Error(`Mock mode: endpoint ${endpoint} should be handled by service layer`)
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  let processedOptions = options
  if (options?.body && typeof options.body === 'string') {
    try {
      const parsed = JSON.parse(options.body)
      processedOptions = {
        ...options,
        body: JSON.stringify(keysToSnake(parsed)),
      }
    }
    catch {
      // Ignore invalid JSON body and keep original payload.
    }
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...processedOptions?.headers },
    ...processedOptions,
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  const raw = await response.json()
  return keysToCamel<ApiResponse<T>>(raw)
}

export function isMockMode(): boolean {
  return USE_MOCK
}
