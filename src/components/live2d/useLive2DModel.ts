import { useEffect, useRef, useState } from 'react'
import type { Live2DState } from '@/types'
import { useFileAccessRequestStore } from '@/stores'
import { parseForbiddenPathViolation } from '@/utils'
import {
  getLive2DVirtualResource,
  isDesktopRuntime,
  isLocalAbsolutePath,
  resolveLive2DModelBlobSource,
  resolveLive2DModelSource,
} from '@/utils/live2d-file'

/* ---------- global type augmentation ---------- */
declare global {
  interface Window {
    PIXI?: unknown
    Live2DCubismCore?: unknown
  }
}

/* ---------- Cubism Core SDK loader (singleton) ---------- */

let cubismReady = false
let cubismPromise: Promise<void> | null = null
let live2dFetchMiddlewareInstalled = false

function describeUnknownError(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    const url = typeof record.url === 'string' ? record.url : ''
    const status = typeof record.status === 'number' ? record.status : undefined
    if (message || url || typeof status === 'number') {
      const parts = [message || '未知错误']
      if (url) parts.push(`url=${url}`)
      if (typeof status === 'number') parts.push(`status=${status}`)
      return parts.join(' | ')
    }
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isTextureLoadingError(error: unknown): boolean {
  const message = describeUnknownError(error).toLowerCase()
  return message.includes('texture loading error')
}

function installLive2DFetchMiddleware(live2dModule: unknown): void {
  if (live2dFetchMiddlewareInstalled) return
  if (!live2dModule || typeof live2dModule !== 'object') return

  const moduleRecord = live2dModule as Record<string, unknown>
  const live2dLoader = moduleRecord.Live2DLoader as { middlewares?: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> } | undefined
  if (!live2dLoader || !Array.isArray(live2dLoader.middlewares)) return

  const normalizeResourceUrl = (url: string): string => {
    if (url.startsWith('blob:http//')) return url.replace('blob:http//', 'blob:http://')
    if (url.startsWith('blob:https//')) return url.replace('blob:https//', 'blob:https://')
    return url
  }

  const applyResultFromVirtualResource = (context: any, normalizedUrl: string): boolean => {
    const resource = getLive2DVirtualResource(normalizedUrl)
    if (!resource) return false
    const bytes = resource.bytes
    const type = context?.type

    if (type === 'arraybuffer') {
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      context.result = arrayBuffer
      return true
    }
    if (type === 'json') {
      const text = new TextDecoder().decode(bytes)
      context.result = JSON.parse(text)
      return true
    }
    if (type === 'text') {
      context.result = new TextDecoder().decode(bytes)
      return true
    }
    if (type === 'blob') {
      context.result = new Blob([new Uint8Array(bytes)], { type: resource.mime })
      return true
    }
    return false
  }

  const fetchMiddleware = async (context: any, next: () => Promise<void>) => {
    const rawUrl = typeof context?.url === 'string' ? context.url : ''
    if (!rawUrl) {
      await next()
      return
    }

    const resolvedUrl = context?.settings && typeof context.settings.resolveURL === 'function'
      ? context.settings.resolveURL(rawUrl)
      : rawUrl
    const normalizedUrl = normalizeResourceUrl(String(resolvedUrl))

    if (applyResultFromVirtualResource(context, normalizedUrl)) {
      return
    }

    try {
      const response = await fetch(normalizedUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      switch (context?.type) {
        case 'json':
          context.result = await response.json()
          return
        case 'arraybuffer':
          context.result = await response.arrayBuffer()
          return
        case 'blob':
          context.result = await response.blob()
          return
        case 'text':
          context.result = await response.text()
          return
        default:
          await next()
          return
      }
    } catch {
      await next()
    }
  }

  live2dLoader.middlewares.unshift(fetchMiddleware)
  live2dFetchMiddlewareInstalled = true
}

function fitModelToContainer(model: any, width: number, height: number): boolean {
  model.visible = true
  model.alpha = 1
  model.rotation = 0
  if (typeof model.scale?.set === 'function') {
    model.scale.set(1)
  }

  const localBounds = typeof model.getLocalBounds === 'function' ? model.getLocalBounds() : null
  const preferredWidth = Number(localBounds?.width) || 0
  const preferredHeight = Number(localBounds?.height) || 0
  const fallbackWidth = Number(model.width) || 0
  const fallbackHeight = Number(model.height) || 0
  const internalWidth = Number(model?.internalModel?.width) || 0
  const internalHeight = Number(model?.internalModel?.height) || 0

  const baseWidth = preferredWidth > 0 ? preferredWidth : (fallbackWidth > 0 ? fallbackWidth : internalWidth)
  const baseHeight = preferredHeight > 0 ? preferredHeight : (fallbackHeight > 0 ? fallbackHeight : internalHeight)
  if (baseWidth <= 0 || baseHeight <= 0) return false

  let scale = Math.min((width * 0.9) / baseWidth, (height * 0.9) / baseHeight)
  const minVisualSize = 96
  const scaledWidth = baseWidth * scale
  const scaledHeight = baseHeight * scale
  if (scaledWidth < minVisualSize && baseWidth > 0) {
    scale = Math.max(scale, minVisualSize / baseWidth)
  }
  if (scaledHeight < minVisualSize && baseHeight > 0) {
    scale = Math.max(scale, minVisualSize / baseHeight)
  }
  if (!Number.isFinite(scale) || scale <= 0) return false
  if (typeof model.scale?.set === 'function') {
    model.scale.set(scale)
  }

  // Avoid pivot-based centering: some Live2D models report unstable bounds and may be moved off-screen.
  // Use scaled local-bounds translation to center directly in viewport.
  const scaledBounds = typeof model.getLocalBounds === 'function' ? model.getLocalBounds() : localBounds
  const bx = Number(scaledBounds?.x) || 0
  const by = Number(scaledBounds?.y) || 0
  const bw = Number(scaledBounds?.width) || baseWidth
  const bh = Number(scaledBounds?.height) || baseHeight
  const cx = bx + bw / 2
  const cy = by + bh / 2

  model.x = width / 2 - cx * scale
  model.y = height / 2 - cy * scale

  return true
}

function isModelBoundsVisible(model: any, viewportWidth: number, viewportHeight: number): boolean {
  const bounds = typeof model.getBounds === 'function' ? model.getBounds() : null
  const width = Number(bounds?.width) || 0
  const height = Number(bounds?.height) || 0
  const x = Number(bounds?.x) || 0
  const y = Number(bounds?.y) || 0
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 2 && height > 2)) {
    return false
  }
  const intersectsX = x < viewportWidth && x + width > 0
  const intersectsY = y < viewportHeight && y + height > 0
  return intersectsX && intersectsY
}

function fallbackCenterByDisplaySize(model: any, viewportWidth: number, viewportHeight: number): void {
  const rawWidth = Number(model.width) || 0
  const rawHeight = Number(model.height) || 0
  if (rawWidth <= 0 || rawHeight <= 0) return

  const fallbackScale = Math.min((viewportWidth * 0.75) / rawWidth, (viewportHeight * 0.75) / rawHeight)
  if (!Number.isFinite(fallbackScale) || fallbackScale <= 0) return

  if (typeof model.scale?.set === 'function') {
    model.scale.set(fallbackScale)
  }
  model.x = (viewportWidth - rawWidth * fallbackScale) / 2
  model.y = (viewportHeight - rawHeight * fallbackScale) / 2
}

function getModelTextureCount(model: any): number {
  const textures = model?.internalModel?.textures
  if (!Array.isArray(textures)) return 0
  return textures.filter(Boolean).length
}

async function ensureModelFittedAndVisible(model: any, app: any, width: number, height: number): Promise<void> {
  let fitted = fitModelToContainer(model, width, height)
  if (!fitted) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    fitted = fitModelToContainer(model, width, height)
  }
  if (!fitted) {
    throw new Error('模型尺寸异常（包围盒为 0），请检查纹理与模型文件是否匹配。')
  }

  // Some models report bounds one frame later; force a few frames to avoid "silent blank".
  for (let i = 0; i < 3; i += 1) {
    app.render()
    if (isModelBoundsVisible(model, width, height)) return
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    fitModelToContainer(model, width, height)
  }

  // Secondary fallback: direct display-size centering for models with unusual local bounds.
  fallbackCenterByDisplaySize(model, width, height)
  app.render()
  if (isModelBoundsVisible(model, width, height)) return

  const textureCount = getModelTextureCount(model)
  if (textureCount <= 0) {
    throw new Error('模型纹理未加载成功（texture count = 0），请检查模型目录与纹理文件可访问性。')
  }
  throw new Error('模型渲染可见区域异常（宽高接近 0），请检查模型纹理与路径映射。')
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`加载脚本失败: ${src}`))
    document.head.appendChild(el)
  })
}

async function ensureCubismCore(): Promise<void> {
  if (cubismReady || window.Live2DCubismCore) {
    cubismReady = true
    return
  }
  if (cubismPromise) return cubismPromise

  cubismPromise = (async () => {
    const sources = [
      '/lib/live2dcubismcore.min.js',
      'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    ]
    for (const src of sources) {
      try {
        await loadScript(src)
        if (window.Live2DCubismCore) {
          cubismReady = true
          return
        }
      } catch {
        // try next
      }
    }
    throw new Error('未找到 Live2D Cubism Core SDK。请将 live2dcubismcore.min.js 放入 public/lib/，或确保网络可访问 CDN。')
  })()
  return cubismPromise
}

/* ---------- hook ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PixiApp = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L2DModel = any

export interface UseLive2DModelResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMessage?: string
}

export function useLive2DModel(
  modelPath: string | undefined,
  state: Live2DState,
): UseLive2DModelResult {
  const requestFileAccess = useFileAccessRequestStore((store) => store.requestAccess)
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PixiApp>(null)
  const modelRef = useRef<L2DModel>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>()

  /* ---- load / teardown ---- */
  useEffect(() => {
    if (!modelPath) {
      setStatus('idle')
      setErrorMessage(undefined)
      return
    }
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let cleanupBlobSource: (() => void) | undefined

    ;(async () => {
      setStatus('loading')
      setErrorMessage(undefined)

      try {
        // 1) Cubism Core SDK
        await ensureCubismCore()

        // 2) pixi.js: set on window for pixi-live2d-display internals
        const PIXI = await import('pixi.js')
        window.PIXI = PIXI

        // 3) pixi-live2d-display (cubism4 entry registers framework by side effect)
        const live2dModule = await import('pixi-live2d-display/cubism4')
        installLive2DFetchMiddleware(live2dModule)
        const { Live2DModel } = live2dModule

        if (cancelled) return

        const rect = container.getBoundingClientRect()
        const w = Math.max(Math.round(rect.width), 64)
        const h = Math.max(Math.round(rect.height), 64)

        const app = new PIXI.Application({
          width: w,
          height: h,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          clearBeforeRender: true,
        })
        appRef.current = app
        container.innerHTML = ''
        const canvas = app.view as HTMLCanvasElement
        canvas.style.display = 'block'
        canvas.style.position = 'relative'
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        canvas.style.maxWidth = '100%'
        canvas.style.maxHeight = '100%'
        canvas.style.pointerEvents = 'none'
        canvas.style.background = 'transparent'
        canvas.style.zIndex = '0'
        container.appendChild(canvas)

        // 4) load model
        // Desktop local path: prefer local-file bundle source first to avoid asset.localhost intermittency.
        let model: L2DModel
        const preferLocalBundle = isDesktopRuntime() && isLocalAbsolutePath(modelPath)
        if (preferLocalBundle) {
          let localBundleError: unknown
          let textureDataFallbackError: unknown
          try {
            const localBundleResolved = await resolveLive2DModelBlobSource(modelPath, { textureMode: 'runtime' })
            cleanupBlobSource = localBundleResolved.cleanup
            model = await Live2DModel.from(localBundleResolved.source, { autoInteract: false })
          } catch (bundleError) {
            localBundleError = bundleError
            cleanupBlobSource?.()
            cleanupBlobSource = undefined

            if (isTextureLoadingError(bundleError)) {
              try {
                const dataBundleResolved = await resolveLive2DModelBlobSource(modelPath, { textureMode: 'data' })
                cleanupBlobSource = dataBundleResolved.cleanup
                model = await Live2DModel.from(dataBundleResolved.source, { autoInteract: false })
              } catch (dataError) {
                textureDataFallbackError = dataError
                cleanupBlobSource?.()
                cleanupBlobSource = undefined
              }
            }
          }

          if (!model) {
            try {
              const primarySource = await resolveLive2DModelSource(modelPath)
              model = await Live2DModel.from(primarySource, { autoInteract: false })
            } catch (primaryError) {
              const localBundleMsg = describeUnknownError(localBundleError)
              const textureDataMsg = textureDataFallbackError ? `；data 纹理 fallback 失败：${describeUnknownError(textureDataFallbackError)}` : ''
              const primaryMsg = describeUnknownError(primaryError)
              throw new Error(`${localBundleMsg}${textureDataMsg}；runtime fallback 失败：${primaryMsg}`)
            }
          }
        } else {
          const primarySource = await resolveLive2DModelSource(modelPath)
          try {
            model = await Live2DModel.from(primarySource, { autoInteract: false })
          } catch (primaryError) {
            const canTryBlobFallback = isDesktopRuntime() && isLocalAbsolutePath(modelPath)
            if (!canTryBlobFallback) {
              throw primaryError
            }

            let localBundleError: unknown
            let textureDataFallbackError: unknown
            try {
              const localBundleResolved = await resolveLive2DModelBlobSource(modelPath, { textureMode: 'runtime' })
              cleanupBlobSource = localBundleResolved.cleanup
              model = await Live2DModel.from(localBundleResolved.source, { autoInteract: false })
            } catch (bundleError) {
              localBundleError = bundleError
              cleanupBlobSource?.()
              cleanupBlobSource = undefined

              if (isTextureLoadingError(bundleError)) {
                try {
                  const dataBundleResolved = await resolveLive2DModelBlobSource(modelPath, { textureMode: 'data' })
                  cleanupBlobSource = dataBundleResolved.cleanup
                  model = await Live2DModel.from(dataBundleResolved.source, { autoInteract: false })
                } catch (dataError) {
                  textureDataFallbackError = dataError
                  cleanupBlobSource?.()
                  cleanupBlobSource = undefined
                }
              }
            }

            if (!model) {
              const primaryMsg = describeUnknownError(primaryError)
              const localBundleMsg = describeUnknownError(localBundleError)
              const textureDataMsg = textureDataFallbackError ? `；data 纹理 fallback 失败：${describeUnknownError(textureDataFallbackError)}` : ''
              throw new Error(`${primaryMsg}；本地文件 fallback 失败：${localBundleMsg}${textureDataMsg}`)
            }
          }
        }

        if (cancelled) {
          cleanupBlobSource?.()
          app.destroy(true)
          return
        }

        app.stage.addChild(model as unknown as import('pixi.js').DisplayObject)
        await ensureModelFittedAndVisible(model, app, w, h)

        modelRef.current = model
        setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          const forbiddenPath = parseForbiddenPathViolation(err)
          if (forbiddenPath) {
            requestFileAccess({
              ...forbiddenPath,
              source: 'live2d',
            })
          }
          setStatus('error')
          setErrorMessage(describeUnknownError(err))
        }
      }
    })()

    return () => {
      cancelled = true
      cleanupBlobSource?.()
      modelRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
      if (container) container.innerHTML = ''
    }
  }, [modelPath, requestFileAccess])

  /* ---- state -> motion / expression ---- */
  useEffect(() => {
    const model = modelRef.current
    if (!model || status !== 'ready') return

    try {
      switch (state) {
        case 'thinking':
          model.motion('idle', 0, 2)
          break
        case 'talking':
          model.motion('tap_body', undefined, 2)
          break
        case 'happy':
          model.expression('f03')
          break
        case 'sad':
          model.expression('f06')
          break
        case 'idle':
        case 'error':
        default:
          model.motion('idle')
          break
      }
    } catch {
      // motion / expression not found -> silently ignore
    }
  }, [state, status])

  return { containerRef, status, errorMessage }
}
