export const CHAT_PAGE_COPY = {
  emptyConversationTitle: '选择一个会话开始聊天',
  emptyConversationDescription: '从左侧列表打开已有会话，或先创建一个新的对话。',
  memoryPanelTitle: '关联记忆',
  collapse: '收起',
  expand: '展开',
  recentActionPrefix: '最近动作：',
  recentUpdatedPrefix: '最近更新：',
  viewAllMemories: '查看全部记忆',
  summarizeInProgress: '生成摘要中...',
  summarizeNow: '为当前会话生成摘要',
  rememberInProgress: '写入记忆中...',
  rememberLatestMessage: '记住最近一条用户消息',
  memoryEmptyState: '当前会话还没有可展示的长期记忆。',
  loadConversationFailed: '加载会话失败',
  executionQueued: '等待执行',
  executionRunning: '执行中',
  executionSuccess: '执行完成',
  executionFailed: '执行失败',
  manualMcpSender: '手动调用 MCP 服务',
  manualSkillSender: '手动调用 Skill',
  autoMcpSender: '自动调用 MCP 服务',
  autoSkillSender: '自动调用 Skill',
  summarizeFailed: '生成摘要失败',
  rememberFailed: '写入长期记忆失败',
} as const

export function formatManualToolCallingStatus(count: number) {
  return `正在按你的指定调用 ${count} 个工具...`
}

export function formatAutoToolCallingStatus(count: number) {
  return `正在自动调用 ${count} 个工具...`
}
