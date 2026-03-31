import type { Skill } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockSkills } from '@/mock'

interface ListResponse<T> {
  items: T[]
  total: number
}

let skills: Skill[] = [...mockSkills]

function normalizeSkill(skill: Skill): Skill {
  return {
    ...skill,
    icon: skill.icon || 'mdi:code-braces',
    summary: skill.summary || skill.description,
  }
}

async function getSkills(): Promise<Skill[]> {
  if (isMockMode()) {
    return [...skills]
  }
  const res = await apiRequest<ListResponse<Skill>>('/api/skills')
  return res.data.items.map(normalizeSkill)
}

async function getSkill(id: string): Promise<Skill | undefined> {
  if (isMockMode()) {
    return skills.find((s) => s.id === id)
  }
  const res = await apiRequest<Skill>(`/api/skills/${id}`)
  return normalizeSkill(res.data)
}

async function toggleSkill(id: string, enabled: boolean): Promise<Skill> {
  if (isMockMode()) {
    const index = skills.findIndex((s) => s.id === id)
    if (index === -1) {
      throw new Error(`Skill not found: ${id}`)
    }
    const updated: Skill = {
      ...skills[index],
      enabled,
    }
    skills[index] = updated
    return updated
  }
  const res = await apiRequest<Skill>(`/api/skills/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
  return normalizeSkill(res.data)
}

export const skillService = {
  getSkills,
  getSkill,
  toggleSkill,
}
