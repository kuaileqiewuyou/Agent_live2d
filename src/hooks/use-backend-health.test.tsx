/* @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type UseBackendHealth = typeof import('@/hooks/use-backend-health')['useBackendHealth']

let useBackendHealth: UseBackendHealth
let checkBackendHealthMock: ReturnType<typeof vi.fn>

function Probe({ id }: { id: string }) {
  const state = useBackendHealth()

  return (
    <div data-testid={`probe-${id}`}>
      {state.hasChecked ? 'checked' : 'pending'}-{state.checking ? 'checking' : 'idle'}
    </div>
  )
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useBackendHealth shared lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()

    checkBackendHealthMock = vi.fn().mockResolvedValue(true)
    vi.doMock('@/services/health.service', () => ({
      BACKEND_API_BASE_URL: 'http://127.0.0.1:8001',
      checkBackendHealth: checkBackendHealthMock,
    }))

    const hookModule = await import('@/hooks/use-backend-health')
    useBackendHealth = hookModule.useBackendHealth
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('shares one polling loop across multiple subscribers and tears down when idle', async () => {
    const { rerender, unmount } = render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    )

    await act(async () => {
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2)

    rerender(<Probe id="a" />)

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(3)

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(20000)
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(3)
  })

  it('deduplicates repeated online-triggered checks while one request is in flight', async () => {
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    )

    await act(async () => {
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1)

    let resolveInFlight!: (value: boolean) => void
    checkBackendHealthMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInFlight = resolve as (value: boolean) => void
        }),
    )

    act(() => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
    })

    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2)

    resolveInFlight(true)
    await act(async () => {
      await flushMicrotasks()
    })
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2)
  })
})
