const GENERIC_ERROR_MESSAGE = '请求失败，请稍后重试。'
const NETWORK_ERROR_MESSAGE = '无法连接到后端服务，请确认后端已启动且端口配置正确。'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

    if (message) {
      return new Error(message)
    }
  }
  catch {
    // Ignore invalid JSON and fall back to status-based messages.
  }

  if (response.status >= 500) {
    return new Error('服务端暂时不可用，请稍后重试。')
  }

  if (response.status === 404) {
    return new Error('请求的资源不存在。')
  }

  if (response.status === 422) {
    return new Error('提交的数据格式不正确，请检查后重试。')
  }

  return new Error(`请求失败（${response.status} ${response.statusText}）`)
}

export function normalizeRequestError(error: unknown): Error {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return new Error(NETWORK_ERROR_MESSAGE)
  }

  if (error instanceof Error) {
    return error.message.trim() ? error : new Error(GENERIC_ERROR_MESSAGE)
  }

  return new Error(GENERIC_ERROR_MESSAGE)
}
