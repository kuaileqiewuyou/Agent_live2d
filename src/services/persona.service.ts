import type { Persona } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockPersonas } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let personas: Persona[] = [...mockPersonas]

async function getPersonas(): Promise<Persona[]> {
  if (isMockMode()) {
    return [...personas]
  }
  const res = await apiRequest<ListResponse<Persona>>('/api/personas')
  return res.data.items
}

async function getPersona(id: string): Promise<Persona | undefined> {
  if (isMockMode()) {
    return personas.find((p) => p.id === id)
  }
  const res = await apiRequest<Persona>(`/api/personas/${id}`)
  return res.data
}

async function createPersona(
  data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Persona> {
  if (isMockMode()) {
    const now = new Date().toISOString()
    const persona: Persona = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    personas.push(persona)
    return persona
  }
  const res = await apiRequest<Persona>('/api/personas', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.data
}

async function updatePersona(id: string, data: Partial<Persona>): Promise<Persona> {
  if (isMockMode()) {
    const index = personas.findIndex((p) => p.id === id)
    if (index === -1) {
      throw new Error(`Persona not found: ${id}`)
    }
    const updated: Persona = {
      ...personas[index],
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    }
    personas[index] = updated
    return updated
  }
  const res = await apiRequest<Persona>(`/api/personas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return res.data
}

async function deletePersona(id: string): Promise<void> {
  if (isMockMode()) {
    personas = personas.filter((p) => p.id !== id)
    return
  }
  await apiRequest<void>(`/api/personas/${id}`, {
    method: 'DELETE',
  })
}

export const personaService = {
  getPersonas,
  getPersona,
  createPersona,
  updatePersona,
  deletePersona,
}
