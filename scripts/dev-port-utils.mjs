import net from 'node:net'
import { execSync } from 'node:child_process'
import process from 'node:process'

function isPortListening(port, host) {
  return new Promise((resolvePromise) => {
    const socket = new net.Socket()
    const onDone = (isListening) => {
      socket.removeAllListeners()
      socket.destroy()
      resolvePromise(isListening)
    }

    socket.setTimeout(300)
    socket.once('connect', () => onDone(true))
    socket.once('timeout', () => onDone(false))
    socket.once('error', () => onDone(false))
    socket.connect(port, host)
  })
}

async function isPortAvailable(port, host = '0.0.0.0') {
  const loopbackListeners = await Promise.all([
    isPortListening(port, '127.0.0.1'),
    isPortListening(port, '::1'),
  ])

  if (loopbackListeners.some(Boolean)) {
    return false
  }

  return new Promise((resolvePromise) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => {
      resolvePromise(false)
    })
    server.listen({ port, host }, () => {
      server.close(() => resolvePromise(true))
    })
  })
}

export async function resolveAvailablePort(preferredPort, maxAttempts = 20) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset
    const isAvailable = await isPortAvailable(candidate)
    if (isAvailable) {
      return candidate
    }
  }

  throw new Error(`no free port found from ${preferredPort} within ${maxAttempts} attempts`)
}

/**
 * Identify which process is holding a port (Windows only, best-effort).
 * Returns a human-readable string like "node.exe (PID 12345)" or null.
 */
export function identifyPortHolder(port) {
  if (process.platform !== 'win32') return null
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`,
      { encoding: 'utf-8', timeout: 3000 },
    ).trim()
    const pid = Number(raw)
    if (!Number.isFinite(pid) || pid <= 0) return null
    const nameRaw = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName"`,
      { encoding: 'utf-8', timeout: 3000 },
    ).trim()
    const processName = nameRaw || 'unknown'
    return `${processName} (PID ${pid})`
  } catch {
    return null
  }
}

