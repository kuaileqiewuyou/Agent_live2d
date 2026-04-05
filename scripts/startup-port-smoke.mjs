import net from 'node:net'
import process from 'node:process'
import { resolveAvailablePort } from './dev-port-utils.mjs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function startListener(host, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer()
    server.unref()
    server.once('error', rejectPromise)
    server.listen({ host, port }, () => {
      resolvePromise(server)
    })
  })
}

async function stopListener(server) {
  return new Promise((resolvePromise) => {
    server.close(() => resolvePromise())
  })
}

async function main() {
  const listeners = []
  try {
    listeners.push(await startListener('127.0.0.1', 1420))
    listeners.push(await startListener('127.0.0.1', 1421))
    const selected = await resolveAvailablePort(1420, 5)
    assert(selected === 1422, `expected fallback port=1422, got=${selected}`)

    let ipv6Validated = false
    try {
      listeners.push(await startListener('::1', 1450))
      const selectedFromIpv6 = await resolveAvailablePort(1450, 2)
      assert(selectedFromIpv6 === 1451, `expected IPv6 fallback port=1451, got=${selectedFromIpv6}`)
      ipv6Validated = true
    }
    catch (error) {
      console.log(`[smoke] IPv6 check skipped: ${error instanceof Error ? error.message : String(error)}`)
    }

    console.log(`[smoke] startup port fallback ok (ipv6=${ipv6Validated ? 'covered' : 'skipped'})`)
  }
  finally {
    for (let i = listeners.length - 1; i >= 0; i -= 1) {
      await stopListener(listeners[i])
    }
  }
}

main().catch((error) => {
  console.error('[smoke] startup port fallback failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

