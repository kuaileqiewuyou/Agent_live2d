export type OpsMCPInstallStepStatus = 'pending' | 'running' | 'passed' | 'failed'

export interface OpsMCPInstallStep {
  id: string
  name: string
  title: string
  status: OpsMCPInstallStepStatus | string
  requiresConfirm: boolean
  detail: string
  result?: Record<string, unknown>
  errorCategory?: string
  startedAt?: string
  finishedAt?: string
}

export interface OpsMCPParsedConfig {
  sourceType: string
  name: string
  description: string
  transportType: 'http' | 'stdio' | string
  endpointOrCommand: string
  advancedConfig?: Record<string, unknown>
  raw?: Record<string, unknown>
}

export interface OpsMCPEnvProbeItem {
  command: string
  available: boolean
  path?: string
  version?: string
  detail: string
}

export interface OpsMCPInstallSession {
  id: string
  link: string
  conversationId?: string
  status: string
  summary: string
  parsedConfig: OpsMCPParsedConfig
  envReport: OpsMCPEnvProbeItem[]
  steps: OpsMCPInstallStep[]
  serverId?: string
  createdAt: string
  updatedAt: string
}

export interface OpsMCPInstallPreviewRequest {
  link: string
  conversationId?: string
}

export interface OpsMCPInstallExecuteRequest {
  sessionId: string
  stepId: string
}

export interface OpsMCPInstallPreviewResponse {
  session: OpsMCPInstallSession
}

export interface OpsMCPInstallExecuteResponse {
  session: OpsMCPInstallSession
  step: OpsMCPInstallStep
}

export interface OpsCommandPreview {
  command: string
  argv: string[]
  cwd: string
  riskLevel: string
  requiresConfirm: boolean
  notes: string[]
}

export interface OpsCommandResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface OpsCommandSession {
  id: string
  conversationId?: string
  status: string
  summary: string
  preview: OpsCommandPreview
  result?: OpsCommandResult | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  errorCategory?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface OpsCommandPreviewRequest {
  command: string
  cwd?: string
  conversationId?: string
}

export interface OpsCommandExecuteRequest {
  sessionId: string
}

export interface OpsCommandPreviewResponse {
  session: OpsCommandSession
}

export interface OpsCommandExecuteResponse {
  session: OpsCommandSession
}
