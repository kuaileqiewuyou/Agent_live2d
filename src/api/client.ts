import { normalizeRequestError, parseApiError } from '@/api/errors'
import { keysToCamel, keysToSnake } from '@/utils/case-convert'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001'

export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

/**
 * 统一的 API 请求封装。
 * - 请求体中的 camelCase 会转换为 snake_case
 * - 响应中的 snake_case 会转换为 camelCase
 * - 网络错误和接口错误会被标准化为可读提示
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  if (USE_MOCK) {
    throw new Error(`Mock mode: endpoint ${endpoint} should be handled by service layer`)
  }

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
      // Non-JSON bodies are passed through unchanged.
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...processedOptions?.headers },
      ...processedOptions,
    })

    if (!response.ok) {
      throw await parseApiError(response)
    }

    const raw = await response.json()
    return keysToCamel<ApiResponse<T>>(raw)
  }
  catch (error) {
    throw normalizeRequestError(error)
  }
}

export function isMockMode(): boolean {
  return USE_MOCK
}
