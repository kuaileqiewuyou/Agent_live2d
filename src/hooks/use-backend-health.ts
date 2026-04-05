import { useCallback, useEffect, useMemo, useState } from 'react'
import { BACKEND_API_BASE_URL, checkBackendHealth } from '@/services/health.service'

const BACKEND_HEALTH_POLL_MS = 10000
/** After this many consecutive failures, treat as "likely down" instead of "still trying". */
const LIKELY_DOWN_THRESHOLD = 3

export interface BackendHealthState {
  isReachable: boolean
  hasChecked: boolean
  checking: boolean
  lastCheckedAt: string | null
  apiBaseUrl: string
  /** Number of consecutive health-check failures (resets on success). */
  consecutiveFailures: number
  /** True if backend was reachable at least once this session then went offline (restart scenario). */
  wasConnected: boolean
  retry: () => Promise<void>
}

type SharedSnapshot = Omit<BackendHealthState, 'apiBaseUrl' | 'retry'>

const initialSnapshot: SharedSnapshot = {
  isReachable: true,
  hasChecked: false,
  checking: false,
  lastCheckedAt: null,
  consecutiveFailures: 0,
  wasConnected: false,
}

let sharedSnapshot: SharedSnapshot = { ...initialSnapshot }
let sharedCheckInFlight = false
let sharedIntervalId: number | null = null
let sharedLifecycleStarted = false
let sharedOnlineHandler: (() => void) | null = null
let sharedVisibilityHandler: (() => void) | null = null
let everReachable = false
const sharedSubscribers = new Set<(snapshot: SharedSnapshot) => void>()

function emitSharedSnapshot() {
  for (const subscriber of sharedSubscribers) {
    subscriber(sharedSnapshot)
  }
}

async function runSharedCheck(options: { force?: boolean } = {}) {
  if (sharedCheckInFlight) return
  if (!options.force && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return
  }

  sharedCheckInFlight = true
  sharedSnapshot = {
    ...sharedSnapshot,
    checking: true,
  }
  emitSharedSnapshot()

  try {
    const reachable = await checkBackendHealth({ timeoutMs: 3000 })
    const checkedAt = new Date().toISOString()

    if (reachable) {
      everReachable = true
    }

    sharedSnapshot = {
      ...sharedSnapshot,
      isReachable: reachable,
      hasChecked: true,
      lastCheckedAt: checkedAt,
      consecutiveFailures: reachable ? 0 : sharedSnapshot.consecutiveFailures + 1,
      wasConnected: !reachable && everReachable,
    }
  }
  finally {
    sharedCheckInFlight = false
    sharedSnapshot = {
      ...sharedSnapshot,
      checking: false,
    }
    emitSharedSnapshot()
  }
}

function ensureSharedLifecycle() {
  if (sharedLifecycleStarted || typeof window === 'undefined') return
  sharedLifecycleStarted = true

  void runSharedCheck()
  sharedIntervalId = window.setInterval(() => {
    void runSharedCheck()
  }, BACKEND_HEALTH_POLL_MS)

  sharedOnlineHandler = () => {
    void runSharedCheck({ force: true })
  }
  sharedVisibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void runSharedCheck({ force: true })
    }
  }

  window.addEventListener('online', sharedOnlineHandler)
  document.addEventListener('visibilitychange', sharedVisibilityHandler)
}

function teardownSharedLifecycleIfIdle() {
  if (!sharedLifecycleStarted) return
  if (sharedSubscribers.size > 0) return
  if (typeof window === 'undefined') return

  if (sharedIntervalId !== null) {
    window.clearInterval(sharedIntervalId)
    sharedIntervalId = null
  }

  if (sharedOnlineHandler) {
    window.removeEventListener('online', sharedOnlineHandler)
    sharedOnlineHandler = null
  }

  if (sharedVisibilityHandler) {
    document.removeEventListener('visibilitychange', sharedVisibilityHandler)
    sharedVisibilityHandler = null
  }

  sharedLifecycleStarted = false
}

export { LIKELY_DOWN_THRESHOLD }

export function useBackendHealth(): BackendHealthState {
  const [snapshot, setSnapshot] = useState<SharedSnapshot>(sharedSnapshot)

  const runCheck = useCallback(async () => {
    await runSharedCheck({ force: true })
  }, [])

  useEffect(() => {
    const subscriber = (nextSnapshot: SharedSnapshot) => {
      setSnapshot(nextSnapshot)
    }

    sharedSubscribers.add(subscriber)
    setSnapshot(sharedSnapshot)
    ensureSharedLifecycle()

    return () => {
      sharedSubscribers.delete(subscriber)
      teardownSharedLifecycleIfIdle()
    }
  }, [])

  const state = useMemo(() => ({
    isReachable: snapshot.isReachable,
    hasChecked: snapshot.hasChecked,
    checking: snapshot.checking,
    lastCheckedAt: snapshot.lastCheckedAt,
    consecutiveFailures: snapshot.consecutiveFailures,
    wasConnected: snapshot.wasConnected,
    apiBaseUrl: BACKEND_API_BASE_URL,
    retry: runCheck,
  }), [runCheck, snapshot])

  return state
}
