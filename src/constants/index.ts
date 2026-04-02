import type { ProviderType } from '../types/model-config'
import type { Live2DState } from '../types/live2d'
import type { ChatLayoutMode } from '../types/conversation'
import type { MCPTransportType } from '../types/mcp'
import type { AppSettings } from '../types/settings'

export const APP_NAME = 'AI 伙伴'

export const TERMS = {
  skill: 'Skill',
  skills: 'Skills',
  toolCall: 'Tool Call',
  enableToolCall: 'Enable Tool Call',
  fallbackChineseSkill: '技能',
  fallbackChineseToolCall: '工具调用',
} as const

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  'openai-compatible': 'OpenAI 兼容',
  'anthropic': 'Anthropic',
  'gemini': 'Gemini',
  'ollama': 'Ollama',
}

export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  'anthropic': 'https://api.anthropic.com',
  'gemini': 'https://generativelanguage.googleapis.com',
  'ollama': 'http://localhost:11434',
}

export const LIVE2D_STATE_LABELS: Record<Live2DState, string> = {
  idle: '待机',
  talking: '说话中',
  thinking: '思考中',
  happy: '开心',
  sad: '难过',
}

export const LAYOUT_MODE_LABELS: Record<ChatLayoutMode, string> = {
  chat: '微信式聊天',
  companion: '陪伴气泡',
}

export const MCP_TRANSPORT_LABELS: Record<MCPTransportType, string> = {
  stdio: '标准输入输出',
  http: 'HTTP',
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  backgroundBlur: 0,
  backgroundOverlayOpacity: 0.5,
  defaultLayoutMode: 'chat',
  language: 'zh-CN',
}
