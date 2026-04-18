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
  LOCAL_DOCKER_BUILD  Build app image on startup (default: false)
  LOCAL_FORCE_DOCKER_UP  Always run docker compose up even when backend is healthy (default: false)
  LOCAL_ENSURE_OPS_INSTALL_ROUTE  Verify /api/ops/mcp/install route and auto-rebuild app image when missing (default: true)
  LOCAL_ENSURE_OPS_COMMAND_RUNTIME  Verify /api/ops/commands preview+execute runtime and auto-rebuild app image when missing (default: true)
  LOCAL_ENSURE_MCP_STDIO_RUNTIME  Verify enabled stdio MCP servers initialize successfully (default: true)
  LOCAL_RUN_REAL_MCP_INSTALL_E2E  Run tests/test_ops_mcp_install_real_e2e.py after backend/runtime checks (default: false)
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

function runCapture(command, args, options = {}) {
  let resolvedCommand = command
  let resolvedArgs = args

  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    resolvedCommand = 'cmd.exe'
    resolvedArgs = ['/d', '/s', '/c', command, ...args]
  }

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, resolvedArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      const message = `${resolvedCommand} ${resolvedArgs.join(' ')} failed with exit code ${code}${stderr ? `\n${stderr}` : ''}`
      reject(new Error(message))
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

async function isBackendHealthy(url) {
  const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl'
  try {
    await run(curlCommand, ['-fsS', url], { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

function resolveApiUrl(apiBaseUrl, path, fallbackPort = '8001') {
  try {
    const parsed = new URL(apiBaseUrl)
    return new URL(path, parsed.origin).toString()
  }
  catch {
    return `http://127.0.0.1:${fallbackPort}${path}`
  }
}

async function getHttpStatus(url, method = 'GET', options = {}) {
  const curlCommand = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const args = ['-sS', '-o', nullSink, '-w', '%{http_code}', '-X', method]
  if (options.contentType) {
    args.push('-H', `Content-Type: ${options.contentType}`)
  }
  if (typeof options.body === 'string') {
    args.push('-d', options.body)
  }
  args.push(url)
  try {
    const { stdout } = await runCapture(curlCommand, args)
    const status = Number(String(stdout).trim())
    return Number.isFinite(status) ? status : 0
  }
  catch {
    return 0
  }
}

async function requestJson(url, options = {}) {
  const method = options.method || 'GET'
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {}),
  }
  const init = {
    method,
    headers,
  }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  try {
    const response = await fetch(url, init)
    const text = await response.text()
    let json = null
    if (text.trim()) {
      try {
        json = JSON.parse(text)
      }
      catch {
        json = null
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
    }
  }
  catch (error) {
    return {
      ok: false,
      status: 0,
      text: error instanceof Error ? error.message : String(error),
      json: null,
    }
  }
}

function describeResponseError(response, fallbackMessage) {
  const message = response?.json?.message
  if (typeof message === 'string' && message.trim()) {
    return message.trim()
  }
  if (typeof response?.text === 'string' && response.text.trim()) {
    return response.text.trim()
  }
  return fallbackMessage
}

async function verifyOpsCommandRuntime(apiBaseUrl, fallbackPort) {
  const previewUrl = resolveApiUrl(apiBaseUrl, '/api/ops/commands/preview', fallbackPort)
  const executeUrl = resolveApiUrl(apiBaseUrl, '/api/ops/commands/execute', fallbackPort)

  const preview = await requestJson(previewUrl, {
    method: 'POST',
    body: {
      command: 'node --version',
    },
  })
  if (!preview.ok) {
    throw new Error(describeResponseError(preview, `ops command preview failed (status ${preview.status || 'unknown'})`))
  }

  const sessionId = preview?.json?.data?.session?.id
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('ops command preview returned invalid session id')
  }

  const execute = await requestJson(executeUrl, {
    method: 'POST',
    body: {
      sessionId,
    },
  })
  if (!execute.ok) {
    throw new Error(describeResponseError(execute, `ops command execute failed (status ${execute.status || 'unknown'})`))
  }

  const session = execute?.json?.data?.session
  if (!session || session.status !== 'completed') {
    const errorCategory = session?.errorCategory || session?.error_category
    const errorMessage = session?.errorMessage || session?.error_message || session?.summary
    throw new Error(
      `ops command runtime not ready (${String(errorCategory || 'unknown')}): ${String(errorMessage || 'execution failed')}`,
    )
  }

  return {
    sessionId,
    summary: String(session.summary || 'command completed'),
  }
}

function normalizeMcpServer(server) {
  return {
    id: typeof server?.id === 'string' ? server.id : '',
    name: typeof server?.name === 'string' && server.name.trim() ? server.name.trim() : 'unnamed-server',
    enabled: server?.enabled === true,
    transportType: String(server?.transportType ?? server?.transport_type ?? '').trim().toLowerCase(),
  }
}

async function listMcpServers(apiBaseUrl, fallbackPort) {
  const listUrl = resolveApiUrl(apiBaseUrl, '/api/mcp/servers', fallbackPort)
  const response = await requestJson(listUrl)
  if (!response.ok) {
    throw new Error(describeResponseError(response, `mcp list failed (status ${response.status || 'unknown'})`))
  }
  const items = response?.json?.data?.items
  if (!Array.isArray(items)) {
    throw new Error('mcp list response has invalid items payload')
  }
  return items.map(normalizeMcpServer).filter((item) => item.id)
}

function resolveSmokeInitializeFailure(smokePayload) {
  const steps = Array.isArray(smokePayload?.steps) ? smokePayload.steps : []
  const initialize = steps.find((step) => String(step?.name || '').toLowerCase() === 'initialize')
  if (!initialize) {
    if (smokePayload?.ok === false) {
      return String(smokePayload?.summary || 'smoke failed before initialize step')
    }
    return ''
  }
  if (initialize?.ok === true) {
    return ''
  }
  return String(initialize?.detail || smokePayload?.summary || 'initialize failed')
}

async function verifyMcpStdioRuntime(apiBaseUrl, fallbackPort) {
  const servers = await listMcpServers(apiBaseUrl, fallbackPort)
  const stdioServers = servers.filter((server) => server.enabled && server.transportType === 'stdio')

  if (stdioServers.length === 0) {
    return {
      checked: 0,
      summary: 'no enabled stdio MCP servers',
    }
  }

  const failures = []
  for (const server of stdioServers) {
    const smokeUrl = resolveApiUrl(apiBaseUrl, `/api/mcp/servers/${encodeURIComponent(server.id)}/smoke`, fallbackPort)
    const smoke = await requestJson(smokeUrl, {
      method: 'POST',
      body: {},
    })
    if (!smoke.ok) {
      failures.push(`${server.name}: ${describeResponseError(smoke, `smoke failed (status ${smoke.status || 'unknown'})`)}`)
      continue
    }
    const failureDetail = resolveSmokeInitializeFailure(smoke?.json?.data)
    if (failureDetail) {
      failures.push(`${server.name}: ${failureDetail}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`stdio MCP initialize check failed -> ${failures.join(' | ')}`)
  }

  return {
    checked: stdioServers.length,
    summary: `${stdioServers.length} enabled stdio MCP server(s) initialize ok`,
  }
}

async function runRealMcpInstallE2E() {
  const env = {
    ...process.env,
    RUN_REAL_MCP_E2E: '1',
  }

  stageLog('real-mcp-install-e2e', 'running tests/test_ops_mcp_install_real_e2e.py with RUN_REAL_MCP_E2E=1')
  try {
    await run('python', ['-m', 'pytest', '-q', 'tests/test_ops_mcp_install_real_e2e.py'], { env })
    stageLog('real-mcp-install-e2e', 'real MCP install e2e passed')
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    stageLog('real-mcp-install-e2e', `failed: ${detail}`)
    throw new Error(`real MCP install e2e failed: ${detail}`)
  }
}

function isTruthy(value) {
  if (!value) return false
  const normalized = String(value).trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
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
  const withBuild = isTruthy(process.env.LOCAL_DOCKER_BUILD)
  const composeArgs = withBuild
    ? ['compose', 'up', '--build', '-d', 'qdrant', 'app']
    : ['compose', 'up', '-d', 'qdrant', 'app']
  stageLog('docker-up', withBuild
    ? 'starting docker services with build (qdrant + app)'
    : 'starting docker services without build (qdrant + app)')
  await run('docker', composeArgs, { env: dockerEnv })
}

async function dockerRebuildApp(dockerEnv) {
  await ensureDockerDaemonReady()
  stageLog('docker-rebuild', 'detected stale backend route, rebuilding app image (docker compose up --build -d app)')
  await run('docker', ['compose', 'up', '--build', '-d', 'app'], { env: dockerEnv })
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
  const healthUrl = resolveHealthUrl(apiBaseUrl, dockerEnv.APP_HOST_PORT)
  const forceDockerUp = isTruthy(process.env.LOCAL_FORCE_DOCKER_UP)
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
  let appRouteRebuilt = false
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
    const backendReady = await isBackendHealthy(healthUrl)
    if (backendReady && !forceDockerUp) {
      stageLog('docker-up', `skip compose up because backend is already healthy (${healthUrl})`)
    }
    else {
      currentStage = 'docker-up'
      await dockerUp(dockerEnv)
      dockerStarted = true
    }
    currentStage = 'health-check'
    await checkBackend({ ...dockerEnv, healthUrl })
    const ensureOpsInstallRoute = isTruthy(process.env.LOCAL_ENSURE_OPS_INSTALL_ROUTE ?? 'true')
    const ensureOpsCommandRuntime = isTruthy(process.env.LOCAL_ENSURE_OPS_COMMAND_RUNTIME ?? 'true')
    const ensureMcpStdioRuntime = isTruthy(process.env.LOCAL_ENSURE_MCP_STDIO_RUNTIME ?? 'true')
    if (ensureOpsInstallRoute) {
      currentStage = 'route-check'
      const opsPreviewUrl = resolveApiUrl(apiBaseUrl, '/api/ops/mcp/install/preview', dockerEnv.APP_HOST_PORT)
      // Use POST probe instead of GET because GET /{session_id} can shadow "/preview" and always return not_found.
      let routeStatus = await getHttpStatus(opsPreviewUrl, 'POST', {
        contentType: 'application/json',
        body: '{"link":"https://example.com/mcp"}',
      })
      if (routeStatus === 404) {
        stageLog('route-check', 'ops install route missing (404), auto rebuilding app image once')
        await dockerRebuildApp(dockerEnv)
        appRouteRebuilt = true
        currentStage = 'health-check'
        await checkBackend({ ...dockerEnv, healthUrl })
        currentStage = 'route-check'
        routeStatus = await getHttpStatus(opsPreviewUrl, 'POST', {
          contentType: 'application/json',
          body: '{"link":"https://example.com/mcp"}',
        })
      }
      if (routeStatus === 404) {
        throw new Error('ops install route still missing after rebuild; please run docker compose up --build -d app and retry')
      }
      stageLog('route-check', `ops install route status ${routeStatus || 'unknown'}${appRouteRebuilt ? ' (rebuilt)' : ''}`)
    }

    if (ensureOpsCommandRuntime) {
      currentStage = 'runtime-check'
      let runtimeVerified = false
      let lastError = null

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const runtimeResult = await verifyOpsCommandRuntime(apiBaseUrl, dockerEnv.APP_HOST_PORT)
          stageLog(
            'runtime-check',
            `ops command runtime ok (session ${runtimeResult.sessionId.slice(0, 8)}..., ${runtimeResult.summary})`,
          )
          runtimeVerified = true
          break
        }
        catch (error) {
          lastError = error
          const message = error instanceof Error ? error.message : String(error)
          const shouldRebuild = attempt === 1 && !appRouteRebuilt
          if (shouldRebuild) {
            stageLog('runtime-check', `ops command runtime check failed (${message}), auto rebuilding app image once`)
            await dockerRebuildApp(dockerEnv)
            appRouteRebuilt = true
            currentStage = 'health-check'
            await checkBackend({ ...dockerEnv, healthUrl })
            currentStage = 'runtime-check'
            continue
          }
          break
        }
      }

      if (!runtimeVerified) {
        const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown error')
        throw new Error(
          `ops command runtime check failed after rebuild fallback: ${detail}. ` +
          'please run docker compose up --build -d app and retry',
        )
      }
    }

    if (ensureMcpStdioRuntime) {
      currentStage = 'mcp-stdio-check'
      let stdioVerified = false
      let lastError = null

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const runtimeResult = await verifyMcpStdioRuntime(apiBaseUrl, dockerEnv.APP_HOST_PORT)
          stageLog('mcp-stdio-check', runtimeResult.summary)
          stdioVerified = true
          break
        }
        catch (error) {
          lastError = error
          const message = error instanceof Error ? error.message : String(error)
          const shouldRebuild = attempt === 1 && !appRouteRebuilt
          if (shouldRebuild) {
            stageLog('mcp-stdio-check', `stdio runtime check failed (${message}), auto rebuilding app image once`)
            await dockerRebuildApp(dockerEnv)
            appRouteRebuilt = true
            currentStage = 'health-check'
            await checkBackend({ ...dockerEnv, healthUrl })
            currentStage = 'mcp-stdio-check'
            continue
          }
          break
        }
      }

      if (!stdioVerified) {
        const detail = lastError instanceof Error ? lastError.message : String(lastError || 'unknown error')
        throw new Error(
          `stdio MCP runtime check failed after rebuild fallback: ${detail}. ` +
          'please run docker compose up --build -d app and retry',
        )
      }
    }

    if (isTruthy(process.env.LOCAL_RUN_REAL_MCP_INSTALL_E2E)) {
      currentStage = 'real-mcp-install-e2e'
      await runRealMcpInstallE2E()
    }
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
    if (currentStage === 'docker-up') {
      console.error(
        '[local] pip index hint: if your network cannot access pypi.org, set PIP_INDEX_URL / PIP_EXTRA_INDEX_URL before retrying.',
      )
      console.error(
        '[local] powershell example: $env:PIP_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"; npm run local:desktop',
      )
    }
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
  let currentStage = 'init'

  currentStage = 'backend-check'
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
      currentStage = 'desktop-preflight'
      stageLog('desktop-preflight', 'running desktop prerequisites check')
      await run(npmCommand(), ['run', 'desktop:doctor'])
      await cleanupWindowsDesktopProcess()
      await cleanupWindowsPortConflict(1420)
    }

    if (isTruthy(process.env.LOCAL_RUN_REAL_MCP_INSTALL_E2E)) {
      currentStage = 'real-mcp-install-e2e'
      await runRealMcpInstallE2E()
    }
    currentStage = 'frontend'
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
    console.error(`[local] failed (no-docker mode) at stage=${currentStage}:`, error instanceof Error ? error.message : String(error))
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
