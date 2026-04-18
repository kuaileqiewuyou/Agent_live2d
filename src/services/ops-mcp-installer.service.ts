import { apiRequest } from '@/api'
import { ApiRequestError } from '@/api/errors'
import type {
  OpsMCPInstallExecuteRequest,
  OpsMCPInstallExecuteResponse,
  OpsMCPInstallPreviewRequest,
  OpsMCPInstallPreviewResponse,
  OpsMCPInstallSession,
} from '@/types'

interface OpsInstallSessionEnvelope {
  session: OpsMCPInstallSession
}

function isInstallSessionOrStepNotFound(error: ApiRequestError): boolean {
  const message = error.message.trim().toLowerCase()
  return message.includes('install session not found') || message.includes('step not found')
}

function normalizeApiRequestLikeError(error: unknown): ApiRequestError | null {
  if (error instanceof ApiRequestError) {
    return error
  }

  if (!error || typeof error !== 'object') {
    return null
  }

  const candidate = error as {
    message?: unknown
    code?: unknown
    status?: unknown
    details?: unknown
  }

  if (typeof candidate.message !== 'string') {
    return null
  }

  return new ApiRequestError(candidate.message, {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    status: typeof candidate.status === 'number' ? candidate.status : undefined,
    details: candidate.details && typeof candidate.details === 'object'
      ? candidate.details as Record<string, unknown>
      : undefined,
  })
}

function normalizeInstallerError(error: unknown): never {
  const normalizedError = normalizeApiRequestLikeError(error)
  if (!normalizedError) {
    throw error
  }

  if (normalizedError.code !== 'not_found' || isInstallSessionOrStepNotFound(normalizedError)) {
    const mappedError = mapInstallerErrorByCode(normalizedError)
    throw mappedError
  }

  throw new ApiRequestError(
    '后端不支持 MCP 安装接口，请重启本地后端后重试，确保已加载最新代码。',
    {
      code: 'endpoint_not_available',
      status: normalizedError.status,
      details: normalizedError.details,
    },
  )
}

function mapInstallerErrorByCode(error: ApiRequestError): ApiRequestError {
  if (error.code === 'github_readme_unavailable') {
    return new ApiRequestError(
      '无法读取 GitHub README，请检查仓库链接、网络状态或稍后重试。',
      {
        code: error.code,
        status: error.status,
        details: error.details,
      },
    )
  }

  if (error.code === 'github_readme_parse_failed' || error.code === 'invalid_link') {
    return new ApiRequestError(
      '未能从 README 中识别出可安装的 MCP 配置。建议直接粘贴 JSON 配置片段后重试。',
      {
        code: error.code,
        status: error.status,
        details: error.details,
      },
    )
  }

  return error
}

async function previewInstall(payload: OpsMCPInstallPreviewRequest): Promise<OpsMCPInstallSession> {
  try {
    const response = await apiRequest<OpsMCPInstallPreviewResponse>('/api/ops/mcp/install/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.data.session
  }
  catch (error) {
    normalizeInstallerError(error)
  }
}

async function executeInstallStep(payload: OpsMCPInstallExecuteRequest): Promise<OpsMCPInstallExecuteResponse> {
  try {
    const response = await apiRequest<OpsMCPInstallExecuteResponse>('/api/ops/mcp/install/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.data
  }
  catch (error) {
    normalizeInstallerError(error)
  }
}

async function getInstallSession(sessionId: string): Promise<OpsMCPInstallSession> {
  try {
    const response = await apiRequest<OpsInstallSessionEnvelope>(`/api/ops/mcp/install/${sessionId}`)
    return response.data.session
  }
  catch (error) {
    normalizeInstallerError(error)
  }
}

export const opsMcpInstallerService = {
  previewInstall,
  executeInstallStep,
  getInstallSession,
}
