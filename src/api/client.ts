const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

import { keysToCamel, keysToSnake } from '@/utils/case-convert'

export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

/**
 * 缁熶竴 API 璇锋眰灏佽
 * - 鍙戦€佹椂鑷姩灏?body 浠?camelCase 杞负 snake_case
 * - 鎺ユ敹鏃惰嚜鍔ㄥ皢鍝嶅簲浠?snake_case 杞负 camelCase
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  if (USE_MOCK) {
    throw new Error(`Mock mode: endpoint ${endpoint} should be handled by service layer`)
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  // 鑷姩杞崲璇锋眰浣撲负 snake_case
  let processedOptions = options
  if (options?.body && typeof options.body === 'string') {
    try {
      const parsed = JSON.parse(options.body)
      processedOptions = {
        ...options,
        body: JSON.stringify(keysToSnake(parsed)),
      }
    } catch {
      // 闈?JSON body锛屼繚鎸佸師鏍?    }
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...processedOptions?.headers },
    ...processedOptions,
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  // 鑷姩杞崲鍝嶅簲涓?camelCase
  const raw = await response.json()
  return keysToCamel<ApiResponse<T>>(raw)
}

export function isMockMode(): boolean {
  return USE_MOCK
}
