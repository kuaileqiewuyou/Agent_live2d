import type { ModelConfig } from '@/types'
import { apiRequest, isMockMode } from '@/api'
import { mockModelConfigs } from '@/mock'
import { generateId } from '@/utils'

interface ListResponse<T> {
  items: T[]
  total: number
}

let modelConfigs: ModelConfig[] = [...mockModelConfigs]

async function getModelConfigs(): Promise<ModelConfig[]> {
  if (isMockMode()) {
    return [...modelConfigs]
  }
  const res = await apiRequest<ListResponse<ModelConfig>>('/api/models/configs')
  return res.data.items
}

async function getModelConfig(id: string): Promise<ModelConfig | undefined> {
  if (isMockMode()) {
    return modelConfigs.find((m) => m.id === id)
  }
  const res = await apiRequest<ModelConfig>(`/api/models/configs/${id}`)
  return res.data
}

async function createModelConfig(
  data: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ModelConfig> {
  if (isMockMode()) {
    const now = new Date().toISOString()
    const config: ModelConfig = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    modelConfigs.push(config)
    return config
  }
  const res = await apiRequest<ModelConfig>('/api/models/configs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.data
}

async function updateModelConfig(
  id: string,
  data: Partial<ModelConfig>
): Promise<ModelConfig> {
  if (isMockMode()) {
    const index = modelConfigs.findIndex((m) => m.id === id)
    if (index === -1) {
      throw new Error(`ModelConfig not found: ${id}`)
    }
    const updated: ModelConfig = {
      ...modelConfigs[index],
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    }
    modelConfigs[index] = updated
    return updated
  }
  const res = await apiRequest<ModelConfig>(`/api/models/configs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return res.data
}

async function deleteModelConfig(id: string): Promise<void> {
  if (isMockMode()) {
    modelConfigs = modelConfigs.filter((m) => m.id !== id)
    return
  }
  await apiRequest<void>(`/api/models/configs/${id}`, {
    method: 'DELETE',
  })
}

async function testConnection(
  id: string
): Promise<{ success: boolean; message: string }> {
  if (isMockMode()) {
    const config = modelConfigs.find((m) => m.id === id)
    if (!config) {
      throw new Error(`ModelConfig not found: ${id}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return { success: true, message: `成功连接到 ${config.name}` }
  }
  const res = await apiRequest<{ ok: boolean; detail: string }>(
    `/api/models/configs/${id}/test`,
    { method: 'POST' },
  )
  return { success: res.data.ok, message: res.data.detail }
}

export const modelService = {
  getModelConfigs,
  getModelConfig,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  testConnection,
}
