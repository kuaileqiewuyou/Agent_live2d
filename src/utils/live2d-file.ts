/**
 * Live2D model path helpers.
 *
 * Desktop (Tauri): allow picking local files and convert local absolute paths
 * to runtime-accessible URLs.
 * Web: manual URL/path only.
 */

import { settingsService } from '@/services/settings.service'
import {
  evaluateFileAccessPermission,
  normalizeFileAccessFolderPath,
  type FileAccessReason,
} from './file-access'

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface PickedModelFile {
  /** Display name inferred from directory / file name. */
  name: string
  /** Absolute file path returned by OS file picker. */
  path: string
}

export interface Live2DModelValidationResult {
  valid: boolean
  message?: string
  warnings: string[]
  checkedFiles: number
  forbiddenPath?: {
    code: 'forbidden_path'
    path: string
    reason: FileAccessReason | 'unknown'
    context?: string
    suggestedFolder?: string
    message: string
  }
}

export function isModel3JsonPath(path: string): boolean {
  return /\.model3\.json(?:$|[?#])/i.test(path.trim())
}

export function isLocalAbsolutePath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed) return false
  // Windows drive path, e.g. C:\foo or D:/foo
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
  // UNC path, e.g. \\server\share\foo
  if (/^\\\\/.test(trimmed)) return true
  // Unix-like absolute path
  if (trimmed.startsWith('/')) return true
  return false
}

function isAlreadyRuntimeUrl(path: string): boolean {
  return /^(https?:\/\/|asset:|tauri:\/\/|blob:|data:)/i.test(path.trim())
}

export async function resolveLive2DModelPath(path: string): Promise<string> {
  const trimmed = path.trim()
  if (!trimmed) return trimmed

  if (!isDesktopRuntime() || isAlreadyRuntimeUrl(trimmed) || !isLocalAbsolutePath(trimmed)) {
    return trimmed
  }

  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    return convertFileSrc(trimmed)
  } catch {
    // Fallback to raw path; caller will surface a concrete load error.
    return trimmed
  }
}

export type Live2DModelSource = string | Record<string, unknown>
export type Live2DTextureFallbackMode = 'runtime' | 'data'

export interface ResolveLive2DModelBlobSourceOptions {
  textureMode?: Live2DTextureFallbackMode
}

interface Live2DVirtualResource {
  bytes: Uint8Array
  mime: string
}

const LIVE2D_LOCAL_SCHEME = 'live2d-local://'
let live2dVirtualId = 0
const live2dVirtualResourceMap = new Map<string, Live2DVirtualResource>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getString(value: unknown): string[] {
  const single = toNonEmptyString(value)
  return single ? [single] : []
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => toNonEmptyString(item))
    .filter((item): item is string => Boolean(item))
}

export function extractLive2DReferencedFiles(modelJson: unknown): string[] {
  if (!isRecord(modelJson)) return []
  const fileReferences = modelJson.FileReferences
  if (!isRecord(fileReferences)) return []

  const refs: string[] = []
  refs.push(...getString(fileReferences.Moc))
  refs.push(...getString(fileReferences.Physics))
  refs.push(...getString(fileReferences.Pose))
  refs.push(...getString(fileReferences.DisplayInfo))
  refs.push(...getString(fileReferences.UserData))
  refs.push(...getStringArray(fileReferences.Textures))

  if (Array.isArray(fileReferences.Expressions)) {
    for (const expression of fileReferences.Expressions) {
      if (isRecord(expression)) {
        refs.push(...getString(expression.File))
      }
    }
  }

  if (isRecord(fileReferences.Motions)) {
    for (const value of Object.values(fileReferences.Motions)) {
      if (!Array.isArray(value)) continue
      for (const motion of value) {
        if (isRecord(motion)) {
          refs.push(...getString(motion.File))
        }
      }
    }
  }

  return Array.from(new Set(refs))
}

function resolveReferenceUrl(entryUrl: string, referencePath: string): string {
  try {
    return new URL(referencePath, entryUrl).toString()
  } catch {
    return referencePath
  }
}

async function canFetchResource(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET', cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

function toLocalSeparator(path: string, separator: '\\' | '/'): string {
  return path.replace(/[\\/]/g, separator)
}

function trimStartSeparator(path: string): string {
  return path.replace(/^[\\/]+/, '')
}

export function normalizeRelativeReferencePath(referencePath: string): string {
  const normalized = referencePath.replace(/\\/g, '/').trim()
  const segments = normalized.split('/')
  const stack: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

function buildLocalReferencePath(entryPath: string, referencePath: string): string {
  if (isLocalAbsolutePath(referencePath)) {
    return referencePath
  }
  const entryDir = entryPath.replace(/[\\/][^\\/]*$/, '')
  const separator: '\\' | '/' = entryPath.includes('\\') ? '\\' : '/'
  const relativeRef = normalizeRelativeReferencePath(referencePath)
  const normalizedRef = trimStartSeparator(toLocalSeparator(relativeRef, separator))
  return `${entryDir}${separator}${normalizedRef}`
}

function getModelBaseName(modelPath: string): string {
  const normalized = modelPath.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() || normalized
  return fileName.replace(/\.model3\.json$/i, '')
}

function fixMojibakeReference(reference: string, modelBaseName: string): string {
  // Some third-party model packs contain mojibake in references, e.g. "Laffey 鈪?moc3".
  // Always normalize to current entry base name to avoid mismatches like "Ⅱ" vs "2".
  if (reference.includes('鈪?')) {
    const textureName = reference.match(/texture_\d+\.png$/i)?.[0]
    if (textureName) {
      return `${modelBaseName}.4096/${textureName}`
    }
    if (/moc3$/i.test(reference)) return `${modelBaseName}.moc3`
    if (/physics3\.json$/i.test(reference)) return `${modelBaseName}.physics3.json`
    if (/cdi3\.json$/i.test(reference)) return `${modelBaseName}.cdi3.json`
    if (/pose3\.json$/i.test(reference)) return `${modelBaseName}.pose3.json`
    if (/userdata3\.json$/i.test(reference)) return `${modelBaseName}.userdata3.json`
  }

  let fixed = reference
    .replace(/\?moc3$/i, '.moc3')
    .replace(/\?physics3\.json$/i, '.physics3.json')
    .replace(/\?cdi3\.json$/i, '.cdi3.json')
    .replace(/\?pose3\.json$/i, '.pose3.json')
    .replace(/\?userdata3\.json$/i, '.userdata3.json')

  if (/texture_\d+\.png$/i.test(fixed) && !/\.\d+\/texture_\d+\.png$/i.test(fixed)) {
    const textureName = fixed.match(/texture_\d+\.png$/i)?.[0]
    if (textureName) {
      fixed = `${modelBaseName}.4096/${textureName}`
    }
  }

  if (/moc3$/i.test(fixed) && !/\.moc3$/i.test(fixed)) {
    fixed = `${modelBaseName}.moc3`
  }
  if (/physics3\.json$/i.test(fixed) && !/\.physics3\.json$/i.test(fixed)) {
    fixed = `${modelBaseName}.physics3.json`
  }
  if (/cdi3\.json$/i.test(fixed) && !/\.cdi3\.json$/i.test(fixed)) {
    fixed = `${modelBaseName}.cdi3.json`
  }

  return fixed
}

function normalizeModelReferencesInPlace(modelJson: Record<string, unknown>, modelPath: string): void {
  const modelBaseName = getModelBaseName(modelPath)
  const fileReferences = modelJson.FileReferences
  if (!isRecord(fileReferences)) return

  const singleKeys = ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'] as const
  for (const key of singleKeys) {
    const raw = toNonEmptyString(fileReferences[key])
    if (!raw) continue
    fileReferences[key] = fixMojibakeReference(raw, modelBaseName)
  }

  if (Array.isArray(fileReferences.Textures)) {
    fileReferences.Textures = fileReferences.Textures.map((value) => {
      const raw = toNonEmptyString(value)
      if (!raw) return value
      return fixMojibakeReference(raw, modelBaseName)
    })
  }

  if (Array.isArray(fileReferences.Expressions)) {
    for (const expression of fileReferences.Expressions) {
      if (!isRecord(expression)) continue
      const raw = toNonEmptyString(expression.File)
      if (!raw) continue
      expression.File = fixMojibakeReference(raw, modelBaseName)
    }
  }

  if (isRecord(fileReferences.Motions)) {
    for (const motions of Object.values(fileReferences.Motions)) {
      if (!Array.isArray(motions)) continue
      for (const motion of motions) {
        if (!isRecord(motion)) continue
        const raw = toNonEmptyString(motion.File)
        if (!raw) continue
        motion.File = fixMojibakeReference(raw, modelBaseName)
      }
    }
  }
}

async function absolutizeModelReferencesInPlace(modelJson: Record<string, unknown>, modelPath: string): Promise<void> {
  const fileReferences = modelJson.FileReferences
  if (!isRecord(fileReferences)) return

  const toRuntimeAbsolute = async (ref: string): Promise<string> => {
    if (isAlreadyRuntimeUrl(ref)) return ref
    const localRefPath = isLocalAbsolutePath(ref) ? ref : buildLocalReferencePath(modelPath, ref)
    return await resolveLive2DModelPath(localRefPath)
  }

  const singleKeys = ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'] as const
  for (const key of singleKeys) {
    const raw = toNonEmptyString(fileReferences[key])
    if (!raw) continue
    fileReferences[key] = await toRuntimeAbsolute(raw)
  }

  if (Array.isArray(fileReferences.Textures)) {
    const nextTextures: unknown[] = []
    for (const value of fileReferences.Textures) {
      const raw = toNonEmptyString(value)
      if (!raw) {
        nextTextures.push(value)
        continue
      }
      nextTextures.push(await toRuntimeAbsolute(raw))
    }
    fileReferences.Textures = nextTextures
  }

  if (Array.isArray(fileReferences.Expressions)) {
    for (const expression of fileReferences.Expressions) {
      if (!isRecord(expression)) continue
      const raw = toNonEmptyString(expression.File)
      if (!raw) continue
      expression.File = await toRuntimeAbsolute(raw)
    }
  }

  if (isRecord(fileReferences.Motions)) {
    for (const motions of Object.values(fileReferences.Motions)) {
      if (!Array.isArray(motions)) continue
      for (const motion of motions) {
        if (!isRecord(motion)) continue
        const raw = toNonEmptyString(motion.File)
        if (!raw) continue
        motion.File = await toRuntimeAbsolute(raw)
      }
    }
  }
}

function inferMimeType(filePath: string): string {
  const lowered = filePath.toLowerCase()
  if (lowered.endsWith('.json')) return 'application/json'
  if (lowered.endsWith('.png')) return 'image/png'
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg'
  if (lowered.endsWith('.webp')) return 'image/webp'
  if (lowered.endsWith('.gif')) return 'image/gif'
  if (lowered.endsWith('.bmp')) return 'image/bmp'
  if (lowered.endsWith('.wav')) return 'audio/wav'
  return 'application/octet-stream'
}

interface FileAccessPolicySnapshot {
  allowAll?: boolean
  folders: string[]
  blacklist: string[]
}

interface ForbiddenPathDetails {
  path: string
  reason: FileAccessReason | 'unknown'
  context: string
  suggested_folder?: string
}

interface ForbiddenPathError extends Error {
  code?: string
  details?: ForbiddenPathDetails
}

function getFileAccessPolicyFromSettings(): FileAccessPolicySnapshot {
  const cachedSettings = settingsService.getCachedSettings()
  return {
    allowAll: typeof cachedSettings?.fileAccessAllowAll === 'boolean'
      ? cachedSettings.fileAccessAllowAll
      : undefined,
    folders: Array.isArray(cachedSettings?.fileAccessFolders)
      ? cachedSettings.fileAccessFolders
      : [],
    blacklist: Array.isArray(cachedSettings?.fileAccessBlacklist)
      ? cachedSettings.fileAccessBlacklist
      : [],
  }
}

function createForbiddenPathError(
  path: string,
  reason: FileAccessReason | 'unknown',
  context: string,
  suggestedFolder?: string,
): ForbiddenPathError {
  const normalizedPath = normalizeFileAccessFolderPath(path) || path.trim()
  const error = new Error(
    `forbidden_path: ${normalizedPath}. ${context} blocked this path. 请在“设置 -> 文件访问权限”中授权对应目录后重试。`,
  ) as ForbiddenPathError
  error.code = 'forbidden_path'
  error.details = {
    path: normalizedPath,
    reason,
    context,
    suggested_folder: suggestedFolder,
  }
  return error
}

function toForbiddenPathViolation(error: unknown): Live2DModelValidationResult['forbiddenPath'] | null {
  const record = (error && typeof error === 'object') ? (error as ForbiddenPathError) : null
  const code = typeof record?.code === 'string' ? record.code.trim().toLowerCase() : ''
  const details = record?.details
  if (code !== 'forbidden_path' || !details?.path) return null

  return {
    code: 'forbidden_path',
    path: details.path,
    reason: details.reason || 'unknown',
    context: details.context,
    suggestedFolder: details.suggested_folder,
    message: typeof record?.message === 'string' && record.message.trim()
      ? record.message.trim()
      : `forbidden_path: ${details.path}`,
  }
}

function assertFileAccessAllowed(path: string, context = 'Live2D local file'): void {
  if (!isDesktopRuntime()) return
  if (!isLocalAbsolutePath(path)) return
  const decision = evaluateFileAccessPermission(path, getFileAccessPolicyFromSettings())
  if (decision.allowed) return
  throw createForbiddenPathError(
    decision.path || path,
    decision.reason || 'unknown',
    context,
    decision.suggestedFolder,
  )
}

async function readLocalBinary(path: string): Promise<Uint8Array> {
  assertFileAccessAllowed(path, 'Live2D local binary read')
  const { readFile } = await import('@tauri-apps/plugin-fs')
  return await readFile(path)
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (input: Uint8Array) => { toString: (encoding: string) => string } } }).Buffer
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64')
  }
  throw new Error('Base64 encoder unavailable in current runtime')
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  const base64 = bytesToBase64(bytes)
  return `data:${mime};base64,${base64}`
}

function registerLive2DVirtualResource(bytes: Uint8Array, mime: string): string {
  live2dVirtualId += 1
  const key = `${LIVE2D_LOCAL_SCHEME}resource/${live2dVirtualId}`
  live2dVirtualResourceMap.set(key, { bytes: new Uint8Array(bytes), mime })
  return key
}

function revokeLive2DVirtualResource(key: string): void {
  live2dVirtualResourceMap.delete(key)
}

export function getLive2DVirtualResource(url: string): Live2DVirtualResource | null {
  return live2dVirtualResourceMap.get(url) || null
}

export async function resolveLive2DModelBlobSource(
  modelPath: string,
  options: ResolveLive2DModelBlobSourceOptions = {},
): Promise<{ source: Live2DModelSource, cleanup: () => void }> {
  const trimmed = modelPath.trim()
  const isDesktopLocalPath = isDesktopRuntime() && isLocalAbsolutePath(trimmed)
  if (!trimmed || !isDesktopLocalPath) {
    return { source: await resolveLive2DModelPath(trimmed), cleanup: () => {} }
  }

  const localJson = await readLocalJson(trimmed)
  if (!isRecord(localJson)) {
    return { source: await resolveLive2DModelPath(trimmed), cleanup: () => {} }
  }

  normalizeModelReferencesInPlace(localJson, trimmed)
  const fileReferences = localJson.FileReferences
  if (!isRecord(fileReferences)) {
    return { source: await resolveLive2DModelPath(trimmed), cleanup: () => {} }
  }

  const createdUrls: string[] = []
  const textureMode = options.textureMode ?? 'runtime'
  const toVirtualUrl = async (ref: string): Promise<string> => {
    if (isAlreadyRuntimeUrl(ref)) return ref
    const localRefPath = isLocalAbsolutePath(ref) ? ref : buildLocalReferencePath(trimmed, ref)
    const bytes = await readLocalBinary(localRefPath)
    const virtualUrl = registerLive2DVirtualResource(bytes, inferMimeType(localRefPath))
    createdUrls.push(virtualUrl)
    return virtualUrl
  }
  const toTextureRuntimeUrl = async (ref: string): Promise<string> => {
    if (isAlreadyRuntimeUrl(ref) && (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('asset:'))) {
      return ref
    }
    const localRefPath = isLocalAbsolutePath(ref) ? ref : buildLocalReferencePath(trimmed, ref)
    return await resolveLive2DModelPath(localRefPath)
  }
  const toTextureDataUrl = async (ref: string): Promise<string> => {
    if (isAlreadyRuntimeUrl(ref) && ref.startsWith('data:')) return ref
    const localRefPath = isLocalAbsolutePath(ref) ? ref : buildLocalReferencePath(trimmed, ref)
    const bytes = await readLocalBinary(localRefPath)
    return toDataUrl(new Uint8Array(bytes), inferMimeType(localRefPath))
  }

  const singleKeys = ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'] as const
  for (const key of singleKeys) {
    const raw = toNonEmptyString(fileReferences[key])
    if (!raw) continue
    fileReferences[key] = await toVirtualUrl(raw)
  }

  if (Array.isArray(fileReferences.Textures)) {
    const nextTextures: unknown[] = []
    for (const value of fileReferences.Textures) {
      const raw = toNonEmptyString(value)
      if (!raw) {
        nextTextures.push(value)
        continue
      }
      if (textureMode === 'data') {
        nextTextures.push(await toTextureDataUrl(raw))
      } else {
        nextTextures.push(await toTextureRuntimeUrl(raw))
      }
    }
    fileReferences.Textures = nextTextures
  }

  if (Array.isArray(fileReferences.Expressions)) {
    for (const expression of fileReferences.Expressions) {
      if (!isRecord(expression)) continue
      const raw = toNonEmptyString(expression.File)
      if (!raw) continue
      expression.File = await toVirtualUrl(raw)
    }
  }

  if (isRecord(fileReferences.Motions)) {
    for (const motions of Object.values(fileReferences.Motions)) {
      if (!Array.isArray(motions)) continue
      for (const motion of motions) {
        if (!isRecord(motion)) continue
        const raw = toNonEmptyString(motion.File)
        if (!raw) continue
        motion.File = await toVirtualUrl(raw)
      }
    }
  }

  const settingsBytes = new TextEncoder().encode(JSON.stringify(localJson))
  const settingsUrl = registerLive2DVirtualResource(settingsBytes, 'application/json')
  createdUrls.push(settingsUrl)
  localJson.url = settingsUrl

  return {
    source: localJson,
    cleanup: () => {
      for (const url of createdUrls) {
        revokeLive2DVirtualResource(url)
      }
    },
  }
}

export async function resolveLive2DModelSource(modelPath: string): Promise<Live2DModelSource> {
  const trimmed = modelPath.trim()
  if (!trimmed) return trimmed

  const isDesktopLocalPath = isDesktopRuntime() && isLocalAbsolutePath(trimmed)
  if (!isDesktopLocalPath) {
    return await resolveLive2DModelPath(trimmed)
  }

  try {
    const localJson = await readLocalJson(trimmed)
    if (!isRecord(localJson)) {
      return await resolveLive2DModelPath(trimmed)
    }
    const runtimeEntryUrl = await resolveLive2DModelPath(trimmed)
    normalizeModelReferencesInPlace(localJson, trimmed)
    await absolutizeModelReferencesInPlace(localJson, trimmed)
    // pixi-live2d-display requires a "url" field when source is JSON object.
    localJson.url = typeof localJson.url === 'string' && localJson.url.trim() ? localJson.url : runtimeEntryUrl
    return localJson
  } catch {
    // Fall back to path mode; caller surfaces concrete loading error.
    return await resolveLive2DModelPath(trimmed)
  }
}

async function readLocalJson(path: string): Promise<unknown> {
  assertFileAccessAllowed(path, 'Live2D model entry read')
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  const text = await readTextFile(path)
  return JSON.parse(text)
}

async function localFileExists(path: string): Promise<boolean | null> {
  try {
    assertFileAccessAllowed(path, 'Live2D dependency check')
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch (error) {
    if (toForbiddenPathViolation(error)) {
      throw error
    }
    return null
  }
}

async function checkLocalReferenceWithFallback(localRefPath: string): Promise<'exists' | 'missing' | 'unknown'> {
  const existsState = await localFileExists(localRefPath)
  if (existsState === true) return 'exists'
  if (existsState === false) return 'missing'

  // Fallback for environments where fs.exists is unavailable/restricted:
  // try runtime URL fetch to reduce false "unknown" warnings.
  const runtimeRefPath = await resolveLive2DModelPath(localRefPath)
  const ok = await canFetchResource(runtimeRefPath)
  if (ok) return 'exists'
  return 'unknown'
}

const MAX_REFERENCE_CHECKS = 24

export async function validateLive2DModelPath(modelPath: string): Promise<Live2DModelValidationResult> {
  const trimmed = modelPath.trim()
  if (!trimmed) {
    return {
      valid: false,
      message: '模型路径不能为空。',
      warnings: [],
      checkedFiles: 0,
    }
  }

  if (!isModel3JsonPath(trimmed)) {
    return {
      valid: false,
      message: '请提供以 .model3.json 结尾的模型入口文件。',
      warnings: [],
      checkedFiles: 0,
    }
  }

  let modelJson: unknown
  const isDesktopLocalPath = isDesktopRuntime() && isLocalAbsolutePath(trimmed)

  if (isDesktopLocalPath) {
    const entryDecision = evaluateFileAccessPermission(trimmed, getFileAccessPolicyFromSettings())
    if (!entryDecision.allowed) {
      const forbiddenPath = {
        code: 'forbidden_path' as const,
        path: entryDecision.path || normalizeFileAccessFolderPath(trimmed),
        reason: (entryDecision.reason || 'unknown') as FileAccessReason | 'unknown',
        context: 'Live2D model entry read',
        suggestedFolder: entryDecision.suggestedFolder,
        message: `forbidden_path: ${entryDecision.path || trimmed}. Live2D model entry read blocked this path. 请在“设置 -> 文件访问权限”中授权对应目录后重试。`,
      }
      return {
        valid: false,
        message: '模型入口文件未授权访问，请允许该目录后重试。',
        warnings: [],
        checkedFiles: 0,
        forbiddenPath,
      }
    }

    try {
      modelJson = await readLocalJson(trimmed)
      if (isRecord(modelJson)) {
        normalizeModelReferencesInPlace(modelJson, trimmed)
      }
    } catch (error) {
      const forbiddenPath = toForbiddenPathViolation(error)
      if (forbiddenPath) {
        return {
          valid: false,
          message: forbiddenPath.message,
          warnings: [],
          checkedFiles: 0,
          forbiddenPath,
        }
      }
      return {
        valid: false,
        message: `模型入口文件读取失败（本地路径）：${error instanceof Error ? error.message : '请检查文件权限与路径。'}`,
        warnings: [],
        checkedFiles: 0,
      }
    }
  } else {
    const runtimePath = await resolveLive2DModelPath(trimmed)
    try {
      const response = await fetch(runtimePath, { method: 'GET', cache: 'no-store' })
      if (!response.ok) {
        return {
          valid: false,
          message: `模型入口文件无法访问（HTTP ${response.status}）。`,
          warnings: [],
          checkedFiles: 0,
        }
      }
      modelJson = await response.json()
    } catch (error) {
      return {
        valid: false,
        message: `模型入口文件读取失败，请检查路径是否可访问。${error instanceof Error ? `（${error.message}）` : ''}`,
        warnings: [],
        checkedFiles: 0,
      }
    }
  }

  const references = extractLive2DReferencedFiles(modelJson)
  if (references.length === 0) {
    return {
      valid: false,
      message: 'model3.json 缺少 FileReferences，无法加载模型资源。',
      warnings: [],
      checkedFiles: 0,
    }
  }

  const toCheck = references.slice(0, MAX_REFERENCE_CHECKS)
  const missing: string[] = []
  let unknownChecks = 0

  if (isDesktopLocalPath) {
    for (const ref of toCheck) {
      const localRefPath = buildLocalReferencePath(trimmed, ref)
      const decision = evaluateFileAccessPermission(localRefPath, getFileAccessPolicyFromSettings())
      if (!decision.allowed) {
        const forbiddenPath = {
          code: 'forbidden_path' as const,
          path: decision.path || normalizeFileAccessFolderPath(localRefPath),
          reason: (decision.reason || 'unknown') as FileAccessReason | 'unknown',
          context: 'Live2D dependency check',
          suggestedFolder: decision.suggestedFolder,
          message: `forbidden_path: ${decision.path || localRefPath}. Live2D dependency check blocked this path. 请在“设置 -> 文件访问权限”中授权对应目录后重试。`,
        }
        return {
          valid: false,
          message: '模型依赖文件未授权访问，请允许该目录后重试。',
          warnings: [],
          checkedFiles: 0,
          forbiddenPath,
        }
      }
      let state: 'exists' | 'missing' | 'unknown'
      try {
        state = await checkLocalReferenceWithFallback(localRefPath)
      } catch (error) {
        const forbiddenPath = toForbiddenPathViolation(error)
        if (forbiddenPath) {
          return {
            valid: false,
            message: forbiddenPath.message,
            warnings: [],
            checkedFiles: 0,
            forbiddenPath,
          }
        }
        state = 'unknown'
      }
      if (state === 'unknown') {
        unknownChecks += 1
      } else if (state === 'missing') {
        missing.push(ref)
      }
    }
  } else {
    const runtimePath = await resolveLive2DModelPath(trimmed)
    for (const ref of toCheck) {
      const resourceUrl = resolveReferenceUrl(runtimePath, ref)
      const ok = await canFetchResource(resourceUrl)
      if (!ok) {
        missing.push(ref)
      }
    }
  }

  const warnings: string[] = []
  if (references.length > MAX_REFERENCE_CHECKS) {
    warnings.push(`资源较多，仅预检前 ${MAX_REFERENCE_CHECKS} 个文件。`)
  }
  if (unknownChecks > 0) {
    warnings.push(`有 ${unknownChecks} 个本地依赖无法确认可访问性（权限或环境限制），已按“可疑但不阻断”处理。`)
  }

  if (missing.length > 0) {
    const preview = missing.slice(0, 3).join('、')
    return {
      valid: false,
      message: `模型依赖文件不可访问（示例：${preview}${missing.length > 3 ? ' 等' : ''}）。`,
      warnings,
      checkedFiles: toCheck.length,
    }
  }

  return {
    valid: true,
    warnings,
    checkedFiles: toCheck.length,
  }
}

/**
 * Open native file dialog and pick a Live2D model entry file (.model3.json).
 * Desktop: uses Tauri dialog plugin.
 * Web: returns null.
 */
export async function pickLive2DModelFile(): Promise<PickedModelFile | null> {
  if (!isDesktopRuntime()) {
    return null
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      title: '选择 Live2D 模型文件',
      multiple: false,
      filters: [
        // Tauri filter can only filter extension-level; actual suffix is validated below.
        { name: 'Live2D Model (.model3.json)', extensions: ['json'] },
      ],
    })

    if (!selected) return null

    const filePath = typeof selected === 'string' ? selected : selected
    if (!filePath || typeof filePath !== 'string') return null
    if (!isModel3JsonPath(filePath)) return null

    // Prefer parent folder name as model display name.
    const segments = filePath.replace(/\\/g, '/').split('/')
    const fileName = segments[segments.length - 1] || ''
    const dirName = segments[segments.length - 2] || ''

    const displayName = dirName || fileName.replace(/\.model3\.json$/i, '')

    return {
      name: displayName || '未命名模型',
      path: filePath,
    }
  }
  catch (error) {
    console.warn('Live2D file pick failed:', error)
    return null
  }
}

