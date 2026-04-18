import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '@/api/errors'
import { parseForbiddenPathViolation } from '@/utils/forbidden-path'

describe('parseForbiddenPathViolation', () => {
  it('parses structured forbidden_path from ApiRequestError', () => {
    const error = new ApiRequestError('forbidden_path: D:/Else/live2d/private/a.txt', {
      code: 'forbidden_path',
      details: {
        path: 'D:/Else/live2d/private/a.txt',
        reason: 'in_blacklist',
        context: 'MCP tools/call.arguments',
        suggested_folder: 'D:/Else/live2d/private',
      },
    })

    const violation = parseForbiddenPathViolation(error)
    expect(violation).not.toBeNull()
    expect(violation?.path).toBe('D:/Else/live2d/private/a.txt')
    expect(violation?.reason).toBe('in_blacklist')
    expect(violation?.context).toBe('MCP tools/call.arguments')
    expect(violation?.suggestedFolder).toBe('D:/Else/live2d/private')
  })

  it('parses plain-text forbidden path message', () => {
    const violation = parseForbiddenPathViolation(
      'MCP call failed: forbidden_path: D:/Else/live2d/model.model3.json. blocked by tools',
    )
    expect(violation).not.toBeNull()
    expect(violation?.path).toBe('D:/Else/live2d/model.model3.json')
    expect(violation?.reason).toBe('unknown')
    expect(violation?.suggestedFolder).toBe('D:/Else/live2d')
  })
})
