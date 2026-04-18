const RUNTIME_MODEL_DRAFT_STORAGE_KEY = 'agent-live2d-runtime-model-drafts'

type RuntimeModelDraftMap = Record<string, string>
type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
type StorageLike = StorageReader & StorageWriter

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function readRuntimeModelDraftMap(storage?: StorageLike | null): RuntimeModelDraftMap {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return {}

  try {
    const raw = targetStorage.getItem(RUNTIME_MODEL_DRAFT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const normalized: RuntimeModelDraftMap = {}
    for (const [conversationId, modelConfigId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof conversationId !== 'string' || typeof modelConfigId !== 'string') continue
      const conversationKey = conversationId.trim()
      const modelValue = modelConfigId.trim()
      if (!conversationKey || !modelValue) continue
      normalized[conversationKey] = modelValue
    }
    return normalized
  }
  catch {
    return {}
  }
}

function writeRuntimeModelDraftMap(nextMap: RuntimeModelDraftMap, storage?: StorageLike | null) {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return
  targetStorage.setItem(RUNTIME_MODEL_DRAFT_STORAGE_KEY, JSON.stringify(nextMap))
}

export function getRuntimeModelDraftForConversation(
  conversationId: string,
  storage?: StorageLike | null,
): string | null {
  const normalizedConversationId = conversationId.trim()
  if (!normalizedConversationId) return null
  return readRuntimeModelDraftMap(storage)[normalizedConversationId] || null
}

export function persistRuntimeModelDraftForConversation(
  conversationId: string,
  modelConfigId: string,
  storage?: StorageLike | null,
) {
  const normalizedConversationId = conversationId.trim()
  const normalizedModelConfigId = modelConfigId.trim()
  if (!normalizedConversationId || !normalizedModelConfigId) return

  const nextMap = readRuntimeModelDraftMap(storage)
  nextMap[normalizedConversationId] = normalizedModelConfigId
  writeRuntimeModelDraftMap(nextMap, storage)
}

export function clearRuntimeModelDraftForConversation(
  conversationId: string,
  storage?: StorageLike | null,
) {
  const normalizedConversationId = conversationId.trim()
  if (!normalizedConversationId) return

  const nextMap = readRuntimeModelDraftMap(storage)
  if (!(normalizedConversationId in nextMap)) return
  delete nextMap[normalizedConversationId]
  writeRuntimeModelDraftMap(nextMap, storage)
}
