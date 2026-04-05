import process from 'node:process'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { resolveAvailablePort, identifyPortHolder } from './dev-port-utils.mjs'

const HELP_TEXT = `
Local experience helper

Usage:
  node scripts/local-experience.mjs up
  node scripts/local-experience.mjs down
  node scripts/local-experience.mjs check
  node scripts/local-experience.mjs web
  node scripts/local-experience.mjs desktop
  node scripts/local-experience.mjs web-only
  node scripts/local-experience.mjs desktop-only

Env:
  APP_HOST_PORT       Backend exposed port (default: 8001)
  SMOKE_RETRIES       Health check retries (default: 40)
  SMOKE_INTERVAL_MS   Health check interval ms (default: 3000)
  VITE_API_BASE_URL   Frontend API base URL (default: http://127.0.0.1:<APP_HOST_PORT>)
`.trim()

function run(command, args, options = {}) {
  let resolvedCommand = command
  let resolvedArgs = args

  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    resolvedCommand = 'cmd.exe'
    resolvedArgs = ['/d', '/s', '/c', command, ...args]
  }

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, resolvedArgs, {
      stdio: 'inherit',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${resolvedCommand} ${resolvedArgs.join(' ')} failed with exit code ${code}`))
    })
  })
}

function runInteractive(command, args, options = {}) {
  let resolvedCommand = command
  let resolvedArgs = args

  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    resolvedCommand = 'cmd.exe'
    resolvedArgs = ['/d', '/s', '/c', command, ...args]
  }

  return spawn(resolvedCommand, resolvedArgs, {
    stdio: 'inherit',
    ...options,
  })
}

function stageLog(stage, message) {
  console.log(`[local][${stage}] ${message}`)
}

function resolveHealthUrl(apiBaseUrl, fallbackPort = '8001') {
  try {
    const parsed = new URL(apiBaseUrl)
    return new URL('/api/health', parsed.origin).toString()
  }
  catch {
    return `http://127.0.0.1:${fallbackPort}/api/health`
  }
}

async function resolveAvailableDevPort(preferredPort = 1420) {
  return resolveAvailablePort(preferredPort, 20)
}

async function waitForHealth(url, retries, intervalMs) {
  const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl'
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await run(curlCommand, ['-fsS', url], { stdio: 'ignore' })
      console.log(`[health] backend ok (${url}) on attempt ${attempt}`)
      return
    }
    catch {
      // ignore and retry
    }
    await delay(intervalMs)
  }

  throw new Error(`health check failed after ${retries} attempts: ${url}`)
}

async function ensureDockerDaemonReady() {
  try {
    await run('docker', ['info'], { stdio: 'ignore' })
  }
  catch {
    throw new Error(
      'Docker daemon is not running. Please start Docker Desktop first, then retry this command.',
    )
  }
}

function buildDockerEnv() {
  return {
    ...process.env,
    APP_HOST_PORT: process.env.APP_HOST_PORT || '8001',
    DATABASE_URL: process.env.DATABASE_URL || 'sqlite+aiosqlite:///./data/app.db',
  }
}

async function dockerUp(dockerEnv) {
  await ensureDockerDaemonReady()
  console.log('[local] starting docker services (qdrant + app)')
  await run('docker', ['compose', 'up', '--build', '-d', 'qdrant', 'app'], { env: dockerEnv })
}

async function dockerDown(dockerEnv) {
  console.log('[local] stopping docker services')
  await run('docker', ['compose', 'down'], { env: dockerEnv })
}

async function checkBackend(options = {}) {
  const port = options.APP_HOST_PORT || '8001'
  const retries = Number(process.env.SMOKE_RETRIES || '40')
  const intervalMs = Number(process.env.SMOKE_INTERVAL_MS || '3000')
  const url = options.healthUrl || `http://127.0.0.1:${port}/api/health`
  await waitForHealth(url, retries, intervalMs)
}

async function runWithDocker(command, args, options = {}) {
  const mode = options.mode || 'web'
  const dockerEnv = buildDockerEnv()
  const apiBaseUrl = process.env.VITE_API_BASE_URL || `http://127.0.0.1:${dockerEnv.APP_HOST_PORT}`
  const frontendEnv = {
    ...process.env,
    VITE_USE_MOCK: 'false',
    VITE_API_BASE_URL: apiBaseUrl,
  }
  if (mode === 'web') {
    const preferredPort = Number(process.env.VITE_DEV_SERVER_PORT || '1420')
    const selectedPort = await resolveAvailableDevPort(preferredPort)
    frontendEnv.VITE_DEV_SERVER_PORT = String(selectedPort)
    if (selectedPort !== preferredPort) {
      stageLog('frontend', `port ${preferredPort} occupied, fallback to ${selectedPort}`)
      const holder = identifyPortHolder(preferredPort)
      if (holder) stageLog('frontend', `port ${preferredPort} held by ${holder}`)
    }
  }
  let child = null
  let shuttingDown = false
  let dockerStarted = false
  let currentStage = 'init'

  const shutdown = async (signal = 'unknown') => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    stageLog('shutdown', `requested by ${signal}`)

    if (child && !child.killed) {
      child.kill('SIGINT')
    }

    if (!dockerStarted) {
      return
    }

    try {
      currentStage = 'docker-down'
      await dockerDown(dockerEnv)
    }
    catch (error) {
      console.error('[local] docker down failed:', error instanceof Error ? error.message : String(error))
    }
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0))
  })

  try {
    currentStage = 'docker-up'
    await dockerUp(dockerEnv)
    dockerStarted = true
    currentStage = 'health-check'
    await checkBackend(dockerEnv)
    stageLog('frontend', `will connect to ${apiBaseUrl}`)
    currentStage = 'app-start'
    child = runInteractive(command, args, { env: frontendEnv })
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      })
    })
    currentStage = 'docker-down'
    await dockerDown(dockerEnv)
  }
  catch (error) {
    console.error(`[local] failed at stage=${currentStage}:`, error instanceof Error ? error.message : String(error))
    if (mode === 'desktop') {
      console.error('[local] desktop hint: run `npm run desktop:doctor`, ensure no stale `agent-live2d.exe`; port conflicts should auto-fallback.')
    }
    await shutdown('error')
    process.exitCode = 1
  }
}

async function runWithoutDocker(command, args, options = {}) {
  const mode = options.mode || 'web'
  const apiBaseUrl = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001'
  const healthUrl = resolveHealthUrl(apiBaseUrl)
  const frontendEnv = {
    ...process.env,
    VITE_USE_MOCK: 'false',
    VITE_API_BASE_URL: apiBaseUrl,
  }
  if (mode === 'web') {
    const preferredPort = Number(process.env.VITE_DEV_SERVER_PORT || '1420')
    const selectedPort = await resolveAvailableDevPort(preferredPort)
    frontendEnv.VITE_DEV_SERVER_PORT = String(selectedPort)
    if (selectedPort !== preferredPort) {
      stageLog('frontend', `port ${preferredPort} occupied, fallback to ${selectedPort}`)
      const holder = identifyPortHolder(preferredPort)
      if (holder) stageLog('frontend', `port ${preferredPort} held by ${holder}`)
    }
  }
  let child = null
  let shuttingDown = false

  stageLog('backend-check', `expecting backend at ${healthUrl}`)
  await checkBackend({ healthUrl })

  const shutdown = async (signal = 'unknown') => {
    if (shuttingDown) return
    shuttingDown = true
    stageLog('shutdown', `requested by ${signal}`)
    if (child && !child.killed) {
      child.kill('SIGINT')
    }
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0))
  })

  try {
    if (mode === 'desktop') {
      stageLog('desktop-preflight', 'running desktop prerequisites check')
      await run(npmCommand(), ['run', 'desktop:doctor'])
      await cleanupWindowsDesktopProcess()
      await cleanupWindowsPortConflict(1420)
    }

    stageLog('frontend', `will connect to ${apiBaseUrl}`)
    child = runInteractive(command, args, { env: frontendEnv })
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      })
    })
  }
  catch (error) {
    console.error(`[local] failed (no-docker mode):`, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

async function cleanupWindowsDesktopProcess() {
  if (process.platform !== 'win32') {
    return
  }

  try {
    await run('taskkill', ['/IM', 'agent-live2d.exe', '/F'], { stdio: 'ignore' })
    console.log('[local] cleaned stale process: agent-live2d.exe')
  }
  catch {
    // Ignore when process does not exist.
  }
}

async function cleanupWindowsPortConflict(port) {
  if (process.platform !== 'win32') {
    return
  }

  const script = [
    '$connections = Get-NetTCPConnection -LocalPort ' + String(port) + " -State Listen -ErrorAction SilentlyContinue",
    'if ($null -eq $connections) { exit 0 }',
    '$procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique',
    'foreach ($procId in $procIds) {',
    '  try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Output "killed-listener:' + String(port) + ':$procId" }',
    '  catch { }',
    '}',
  ].join('; ')

  try {
    await run('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' })
    console.log(`[local] cleaned stale listeners on port ${port}`)
  }
  catch {
    // Ignore if cleanup command fails or nothing to clean.
  }
}

async function main() {
  const subcommand = process.argv[2]
  const dockerEnv = buildDockerEnv()

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(HELP_TEXT)
    return
  }

  switch (subcommand) {
    case 'up':
      await dockerUp(dockerEnv)
      await checkBackend(dockerEnv)
      return
    case 'down':
      await dockerDown(dockerEnv)
      return
    case 'check':
      await checkBackend(dockerEnv)
      return
    case 'web':
      await cleanupWindowsPortConflict(1420)
      await runWithDocker(npmCommand(), ['run', 'dev'], { mode: 'web' })
      return
    case 'desktop':
      stageLog('desktop-preflight', 'running desktop prerequisites check')
      await run(npmCommand(), ['run', 'desktop:doctor'])
      await cleanupWindowsDesktopProcess()
      await cleanupWindowsPortConflict(1420)
      await runWithDocker(npmCommand(), ['run', 'tauri:dev'], { mode: 'desktop' })
      return
    case 'web-only':
      await cleanupWindowsPortConflict(1420)
      await runWithoutDocker(npmCommand(), ['run', 'dev'], { mode: 'web' })
      return
    case 'desktop-only':
      await runWithoutDocker(npmCommand(), ['run', 'tauri:dev'], { mode: 'desktop' })
      return
    default:
      console.error(`[local] unknown command: ${subcommand}`)
      console.log(HELP_TEXT)
      process.exitCode = 1
  }
}

await main()
