import { describe, expect, it } from 'vitest'
import { deriveToolUsage, normalizeToolLabel, type StreamToolResultMeta } from '@/pages/chat/toolUsage'

describe('toolUsage helpers', () => {
  it('normalizes Skill/MCP prefixes from tool labels', () => {
    expect(normalizeToolLabel('Skill: Summary Skill')).toBe('Summary Skill')
    expect(normalizeToolLabel('Skill：Summary Skill')).toBe('Summary Skill')
    expect(normalizeToolLabel('MCP: Local MCP')).toBe('Local MCP')
    expect(normalizeToolLabel('MCP：Local MCP')).toBe('Local MCP')
  })

  it('keeps backward compatibility with Chinese prefix', () => {
    expect(normalizeToolLabel('技能: 总结助手')).toBe('总结助手')
    expect(normalizeToolLabel('技能：总结助手')).toBe('总结助手')
  })

  it('returns default label when raw value is empty', () => {
    expect(normalizeToolLabel('')).toBe('Tool')
    expect(normalizeToolLabel('   ')).toBe('Tool')
    expect(normalizeToolLabel(undefined)).toBe('Tool')
  })

  it('derives manual and automatic usage stats and labels', () => {
    const results: StreamToolResultMeta[] = [
      { type: 'skill', label: 'Skill: Summary Skill', manual: true },
      { type: 'mcp', name: 'MCP: Local MCP', manual: false },
      { type: 'skill', title: '技能：回忆助手', manual: false },
      { type: 'skill', manual: true },
    ]

    expect(deriveToolUsage(results)).toEqual({
      manualCount: 2,
      automaticCount: 2,
      totalCount: 4,
      manualTools: ['Summary Skill', 'Tool'],
      automaticTools: ['Local MCP', '回忆助手'],
    })
  })
})
