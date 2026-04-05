import { useEffect, useRef, useState } from 'react'
import type { Live2DState } from '@/types'

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
      } catch { /* try next */ }
    }
    throw new Error('Live2D Cubism Core SDK 未找到。请将 live2dcubismcore.min.js 放入 public/lib/ 目录，或确保网络可访问 CDN。')
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

    ;(async () => {
      setStatus('loading')
      setErrorMessage(undefined)

      try {
        // 1) Cubism Core SDK
        await ensureCubismCore()

        // 2) pixi.js — set on window for pixi-live2d-display internals
        const PIXI = await import('pixi.js')
        window.PIXI = PIXI

        // 3) pixi-live2d-display (cubism4 entry registers the framework as side-effect)
        const { Live2DModel } = await import('pixi-live2d-display/cubism4')

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
        })
        appRef.current = app
        container.innerHTML = ''
        container.appendChild(app.view as HTMLCanvasElement)

        // 4) load model
        const model = await Live2DModel.from(modelPath, { autoInteract: false })
        if (cancelled) {
          app.destroy(true)
          return
        }

        // fit model into container
        const scale = Math.min(w / model.width, h / model.height) * 0.85
        model.scale.set(scale)
        model.x = (w - model.width * scale) / 2
        model.y = (h - model.height * scale) / 2

        app.stage.addChild(model as unknown as import('pixi.js').DisplayObject)
        modelRef.current = model
        setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : '模型加载失败')
        }
      }
    })()

    return () => {
      cancelled = true
      modelRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
      if (container) container.innerHTML = ''
    }
  }, [modelPath])

  /* ---- state → motion / expression ---- */
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
      // motion / expression not found — silently ignore
    }
  }, [state, status])

  return { containerRef, status, errorMessage }
}
