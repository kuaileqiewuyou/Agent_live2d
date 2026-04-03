import process from 'node:process'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const HELP_TEXT = `
Local experience helper

Usage:
  node scripts/local-experience.mjs up
  node scripts/local-experience.mjs down
  node scripts/local-experience.mjs check
  node scripts/local-experience.mjs web
  node scripts/local-experience.mjs desktop

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

function buildDockerEnv() {
  return {
    ...process.env,
    APP_HOST_PORT: process.env.APP_HOST_PORT || '8001',
    DATABASE_URL: process.env.DATABASE_URL || 'sqlite+aiosqlite:///./data/app.db',
  }
}

async function dockerUp(dockerEnv) {
  console.log('[local] starting docker services (qdrant + app)')
  await run('docker', ['compose', 'up', '--build', '-d', 'qdrant', 'app'], { env: dockerEnv })
}

async function dockerDown(dockerEnv) {
  console.log('[local] stopping docker services')
  await run('docker', ['compose', 'down'], { env: dockerEnv })
}

async function checkBackend(dockerEnv) {
  const port = dockerEnv.APP_HOST_PORT || '8001'
  const retries = Number(process.env.SMOKE_RETRIES || '40')
  const intervalMs = Number(process.env.SMOKE_INTERVAL_MS || '3000')
  const url = `http://127.0.0.1:${port}/api/health`
  await waitForHealth(url, retries, intervalMs)
}

async function runWithDocker(command, args) {
  const dockerEnv = buildDockerEnv()
  const apiBaseUrl = process.env.VITE_API_BASE_URL || `http://127.0.0.1:${dockerEnv.APP_HOST_PORT}`
  const frontendEnv = {
    ...process.env,
    VITE_USE_MOCK: 'false',
    VITE_API_BASE_URL: apiBaseUrl,
  }
  let child = null
  let shuttingDown = false

  const shutdown = async (signal = 'unknown') => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.log(`\n[local] shutdown requested by ${signal}`)

    if (child && !child.killed) {
      child.kill('SIGINT')
    }

    try {
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
    await dockerUp(dockerEnv)
    await checkBackend(dockerEnv)
    console.log(`[local] frontend will connect to ${apiBaseUrl}`)
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
    await dockerDown(dockerEnv)
  }
  catch (error) {
    console.error('[local] failed:', error instanceof Error ? error.message : String(error))
    await shutdown('error')
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
      await runWithDocker(npmCommand(), ['run', 'dev'])
      return
    case 'desktop':
      await cleanupWindowsDesktopProcess()
      await runWithDocker(npmCommand(), ['run', 'tauri:dev'])
      return
    default:
      console.error(`[local] unknown command: ${subcommand}`)
      console.log(HELP_TEXT)
      process.exitCode = 1
  }
}

await main()
