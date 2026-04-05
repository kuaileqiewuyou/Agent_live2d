export const GENERIC_ERROR_MESSAGE = '请求失败，请稍后重试。'
export const NETWORK_ERROR_MESSAGE = '无法连接到后端服务，请确认后端已启动且端口配置正确。'

export class ApiRequestError extends Error {
  code?: string
  status?: number

  constructor(message: string, options: { code?: string, status?: number } = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = options.code
    this.status = options.status
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractCode(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  if (typeof value.code === 'string' && value.code.trim()) {
    return value.code
  }

  if (isPlainObject(value.data) && typeof value.data.code === 'string' && value.data.code.trim()) {
    return value.data.code
  }

  return undefined
}

function extractMessage(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message
  }

  if (isPlainObject(value.data) && typeof value.data.message === 'string' && value.data.message.trim()) {
    return value.data.message
  }

  return undefined
}

export async function parseApiError(response: Response): Promise<Error> {
  try {
    const payload = await response.json()
    const message = extractMessage(payload)
    const code = extractCode(payload)
    if (message) {
      return new ApiRequestError(message, { code, status: response.status })
    }
  }
  catch {
    // Ignore invalid JSON and fall back to status-based messages.
  }

  if (response.status >= 500) {
    return new ApiRequestError('服务端暂时不可用，请稍后重试。', { status: response.status, code: 'internal_error' })
  }

  if (response.status === 404) {
    return new ApiRequestError('请求的资源不存在。', { status: response.status, code: 'not_found' })
  }

  if (response.status === 422) {
    return new ApiRequestError('提交的数据格式不正确，请检查后重试。', { status: response.status, code: 'validation_error' })
  }

  return new ApiRequestError(`请求失败（${response.status} ${response.statusText}）。`, { status: response.status })
}

export function normalizeRequestError(error: unknown): Error {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return new ApiRequestError(NETWORK_ERROR_MESSAGE, { code: 'network_error' })
  }

  if (error instanceof ApiRequestError) {
    return error
  }

  if (error instanceof Error) {
    return error.message.trim()
      ? new ApiRequestError(error.message)
      : new ApiRequestError(GENERIC_ERROR_MESSAGE)
  }

  return new ApiRequestError(GENERIC_ERROR_MESSAGE)
}

export function isNetworkError(error: unknown): boolean {
  return normalizeRequestError(error).message === NETWORK_ERROR_MESSAGE
}
