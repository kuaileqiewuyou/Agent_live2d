import { apiRequest } from '@/api'
import type {
  OpsCommandExecuteRequest,
  OpsCommandExecuteResponse,
  OpsCommandPreviewRequest,
  OpsCommandPreviewResponse,
  OpsCommandSession,
} from '@/types'

interface OpsCommandSessionEnvelope {
  session: OpsCommandSession
}

async function previewCommand(payload: OpsCommandPreviewRequest): Promise<OpsCommandSession> {
  const response = await apiRequest<OpsCommandPreviewResponse>('/api/ops/commands/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.data.session
}

async function executeCommand(payload: OpsCommandExecuteRequest): Promise<OpsCommandExecuteResponse> {
  const response = await apiRequest<OpsCommandExecuteResponse>('/api/ops/commands/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.data
}

async function getCommandSession(sessionId: string): Promise<OpsCommandSession> {
  const response = await apiRequest<OpsCommandSessionEnvelope>(`/api/ops/commands/${sessionId}`)
  return response.data.session
}

export const opsCommandService = {
  previewCommand,
  executeCommand,
  getCommandSession,
}
