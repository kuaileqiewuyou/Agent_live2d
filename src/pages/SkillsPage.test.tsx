/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkillsPage } from '@/pages/SkillsPage'
import type { Skill } from '@/types'

const getSkillsMock = vi.fn()
const deleteSkillMock = vi.fn()
const toggleSkillMock = vi.fn()
const pushNotificationMock = vi.fn()

vi.mock('@/services', () => ({
  skillService: {
    getSkills: (...args: unknown[]) => getSkillsMock(...args),
    deleteSkill: (...args: unknown[]) => deleteSkillMock(...args),
    toggleSkill: (...args: unknown[]) => toggleSkillMock(...args),
  },
}))

vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (state: { push: typeof pushNotificationMock }) => unknown) =>
    selector({ push: pushNotificationMock }),
}))

vi.mock('@/components/common/BackendHealthStatus', () => ({
  BackendHealthStatus: () => null,
}))

vi.mock('@/features/skills/SkillCard', () => ({
  SkillCard: ({ skill }: { skill: Skill }) => <div>{skill.name}</div>,
}))

const e2eSkill: Skill = {
  id: 'skill-e2e-1',
  name: 'E2E Helper Skill',
  description: 'E2E test helper',
  icon: 'mdi:code-braces',
  tags: ['e2e'],
  version: 'v1.0.0',
  author: 'test',
  enabled: true,
  scope: ['chat'],
}

const normalSkill: Skill = {
  id: 'skill-real-1',
  name: 'Knowledge Search',
  description: 'Search production knowledge base',
  icon: 'mdi:database-search',
  tags: ['prod'],
  version: 'v1.0.0',
  author: 'test',
  enabled: true,
  scope: ['chat'],
}

describe('SkillsPage cleanup test skills', () => {
  beforeEach(() => {
    getSkillsMock.mockReset()
    deleteSkillMock.mockReset()
    toggleSkillMock.mockReset()
    pushNotificationMock.mockReset()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('deletes e2e-tagged skills in one click and refreshes list', async () => {
    getSkillsMock
      .mockResolvedValueOnce([e2eSkill, normalSkill])
      .mockResolvedValueOnce([normalSkill])
    deleteSkillMock.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SkillsPage />)

    const cleanupButton = await screen.findByTestId('cleanup-test-skills-btn')
    expect((cleanupButton as HTMLButtonElement).disabled).toBe(false)

    await userEvent.click(cleanupButton)

    await waitFor(() => {
      expect(deleteSkillMock).toHaveBeenCalledWith('skill-e2e-1')
      expect(getSkillsMock).toHaveBeenCalledTimes(2)
    })
    expect(pushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
    }))
  })

  it('keeps cleanup button disabled when no test skill exists', async () => {
    getSkillsMock.mockResolvedValue([normalSkill])

    render(<SkillsPage />)

    const cleanupButton = await screen.findByTestId('cleanup-test-skills-btn')
    expect((cleanupButton as HTMLButtonElement).disabled).toBe(true)
  })
})
