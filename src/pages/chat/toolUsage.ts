import type { ManualToolInputParams } from '@/types'

export interface StreamToolUsage {
  manualCount?: number
  automaticCount?: number
  totalCount?: number
  manualTools?: string[]
  automaticTools?: string[]
}

export interface StreamToolResultMeta {
  type?: 'skill' | 'mcp'
  name?: string
  label?: string
  title?: string
  summary?: string
  result?: string
  toolName?: string
  executionMode?: string
  error?: string | boolean
  manual?: boolean
  inputText?: string
  inputParams?: ManualToolInputParams
}

const TOOL_LABEL_FALLBACK = 'Tool'

export function normalizeToolLabel(rawValue?: string) {
  const raw = `${rawValue || ''}`.trim()
  if (!raw) return TOOL_LABEL_FALLBACK

  const normalized = raw
    .replace(/^Skill[:：]\s*/i, '')
    .replace(/^MCP[:：]\s*/i, '')
    .replace(/^技能[:：]\s*/i, '')
    .trim()

  return normalized || TOOL_LABEL_FALLBACK
}

export function deriveToolUsage(toolResults: StreamToolResultMeta[]): StreamToolUsage {
  const manualResults = toolResults.filter(item => Boolean(item.manual))
  const automaticResults = toolResults.filter(item => !item.manual)
  const pickLabel = (item: StreamToolResultMeta) => normalizeToolLabel(item.label || item.name || item.title)

  return {
    manualCount: manualResults.length,
    automaticCount: automaticResults.length,
    totalCount: toolResults.length,
    manualTools: manualResults.map(pickLabel),
    automaticTools: automaticResults.map(pickLabel),
  }
}
