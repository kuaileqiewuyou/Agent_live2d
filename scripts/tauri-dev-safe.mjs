import process from 'node:process'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAvailablePort, identifyPortHolder } from './dev-port-utils.mjs'

function getTauriCliPath() {
  const binName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
  return resolve(process.cwd(), 'node_modules', '.bin', binName)
}

function resolveDevPort() {
  const configPath = resolve(process.cwd(), 'src-tauri', 'tauri.conf.json')
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    const devUrl = config?.build?.devUrl
    if (typeof devUrl === 'string' && devUrl.trim()) {
      const port = Number(new URL(devUrl).port || '0')
      if (Number.isInteger(port) && port > 0) {
        return port
      }
    }
  }
  catch {
    // Ignore parse errors and use fallback port.
  }
  return 1420
}

function killStaleDesktopProcess() {
  if (process.platform !== 'win32') {
    return
  }

  spawnSync('taskkill', ['/IM', 'agent-live2d.exe', '/F'], { stdio: 'ignore' })
}

function clearPortListener(port) {
  if (process.platform !== 'win32') {
    return
  }

  const script = [
    `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    'if ($null -eq $connections) { exit 0 }',
    '$procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique',
    'foreach ($procId in $procIds) {',
    '  try { Stop-Process -Id $procId -Force -ErrorAction Stop }',
    '  catch { }',
    '}',
  ].join('; ')

  spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' })
}

function runTauriDev(cliPath, args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : cliPath
    const commandArgs = process.platform === 'win32'
      ? [
          '/d',
          '/s',
          '/c',
          `npm.cmd exec tauri dev ${args.map(arg => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ')}`.trim(),
        ]
      : ['dev', ...args]

    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      env,
    })

    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`tauri dev exited with code ${code}`))
    })
  })
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const checkOnly = rawArgs.includes('--check-only')
  const tauriArgs = rawArgs.filter(arg => arg !== '--check-only')

  const cliPath = getTauriCliPath()
  if (!existsSync(cliPath)) {
    console.error('[tauri:dev] missing local tauri cli. run `npm install` first.')
    process.exitCode = 1
    return
  }

  const port = resolveDevPort()
  if (!checkOnly) {
    killStaleDesktopProcess()
    clearPortListener(port)
  }
  const selectedPort = await resolveAvailablePort(port, 20)
  const selectedDevUrl = `http://localhost:${selectedPort}`

  if (selectedPort !== port) {
    const holder = identifyPortHolder(port)
    const holderInfo = holder ? ` (占用进程: ${holder})` : ''
    console.log(`[tauri:dev] port ${port} is occupied${holderInfo}, fallback to ${selectedPort}`)
  }

  if (checkOnly) {
    console.log(`[tauri:dev] preflight ok (cli=ready, devUrl=${selectedDevUrl})`)
    return
  }

  const childEnv = { ...process.env }
  // Avoid inheriting stale runtime JSON overrides from parent shell.
  delete childEnv.TAURI_CONFIG
  childEnv.VITE_DEV_SERVER_PORT = String(selectedPort)
  childEnv.TAURI_CONFIG = JSON.stringify({
    build: {
      devUrl: selectedDevUrl,
    },
  })

  try {
    await runTauriDev(cliPath, tauriArgs, childEnv)
  }
  catch (error) {
    console.error('[tauri:dev] failed:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

await main()
