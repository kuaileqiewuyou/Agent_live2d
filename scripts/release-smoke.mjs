import process from 'node:process'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const HELP_TEXT = `
Release smoke steps:
1. python -m pytest -q
2. npm run test:unit
3. npm run test:e2e
4. docker compose up --build -d app qdrant
5. GET http://127.0.0.1:18001/api/health
6. docker compose down

Usage:
  npm run smoke:release
  npm run smoke:release -- --skip-e2e
  npm run smoke:release -- --help
`.trim()

function run(command, args, options = {}) {
  const quiet = options.quiet === true
  const spawnOptions = { ...options }
  delete spawnOptions.quiet

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: true,
      ...spawnOptions,
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    if (quiet) {
      child.stdout?.on('data', (chunk) => {
        stdoutBuffer += String(chunk)
        if (stdoutBuffer.length > 20000) {
          stdoutBuffer = stdoutBuffer.slice(-20000)
        }
      })
      child.stderr?.on('data', (chunk) => {
        stderrBuffer += String(chunk)
        if (stderrBuffer.length > 20000) {
          stderrBuffer = stderrBuffer.slice(-20000)
        }
      })
    }

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      if (quiet) {
        if (stdoutBuffer.trim()) {
          console.error(`[quiet-stdout] ${stdoutBuffer.trim()}`)
        }
        if (stderrBuffer.trim()) {
          console.error(`[quiet-stderr] ${stderrBuffer.trim()}`)
        }
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}

async function readPackageScripts(cwd = process.cwd()) {
  try {
    const packageJsonPath = resolve(cwd, 'package.json')
    const packageRaw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(packageRaw)
    return parsed?.scripts ?? {}
  }
  catch (error) {
    console.warn('[warn] unable to read package.json scripts:', error instanceof Error ? error.message : String(error))
    return {}
  }
}

async function waitForHealth(url, retries = 40, intervalMs = 3000) {
  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await run('curl', ['-fsS', url], { quiet: true })
      console.log(`[health] ok on attempt ${attempt}`)
      return
    }
    catch (error) {
      lastError = error
    }

    await delay(intervalMs)
  }

  throw new Error(`health check failed after ${retries} attempts: ${String(lastError)}`)
}

async function dumpDockerStatus(env) {
  try {
    console.log('\n[debug] docker compose ps')
    await run('docker', ['compose', 'ps', '-a'], { env })
  }
  catch (error) {
    console.error('[debug] docker compose ps failed:', error instanceof Error ? error.message : String(error))
  }

  try {
    console.log('\n[debug] docker compose logs --tail 120 app qdrant')
    await run('docker', ['compose', 'logs', '--tail', '120', 'app', 'qdrant'], { env })
  }
  catch (error) {
    console.error('[debug] docker compose logs failed:', error instanceof Error ? error.message : String(error))
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help') || args.has('-h')) {
    console.log(HELP_TEXT)
    return
  }

  const skipE2E = args.has('--skip-e2e')
  const npmScripts = await readPackageScripts()
  const hasUnitScript = typeof npmScripts['test:unit'] === 'string'
  const hasE2EScript = typeof npmScripts['test:e2e'] === 'string'
  const smokeAppPort = process.env.SMOKE_APP_PORT ?? '18001'
  const smokeDatabaseUrl = process.env.SMOKE_DATABASE_URL ?? 'sqlite+aiosqlite:///./data/release_smoke.db'
  const dockerEnv = {
    ...process.env,
    APP_HOST_PORT: smokeAppPort,
    DATABASE_URL: smokeDatabaseUrl,
  }
  const healthUrl = `http://127.0.0.1:${smokeAppPort}/api/health`
  let dockerStarted = false

  try {
    console.log('\n[1/6] Running backend tests')
    await run('python', ['-m', 'pytest', '-q'])

    if (hasUnitScript) {
      console.log('\n[2/6] Running frontend unit tests')
      await run('npm', ['run', 'test:unit'])
    }
    else {
      console.log('\n[2/6] Skipped frontend unit tests (missing npm script: test:unit)')
    }

    if (skipE2E) {
      console.log('\n[3/6] Skipped E2E tests (--skip-e2e)')
    }
    else if (!hasE2EScript) {
      console.log('\n[3/6] Skipped E2E tests (missing npm script: test:e2e)')
    }
    else {
      console.log('\n[3/6] Running frontend E2E tests')
      await run('npm', ['run', 'test:e2e'])
    }

    console.log('\n[4/6] Starting Docker services (app + qdrant)')
    await run('docker', ['compose', 'up', '--build', '-d', 'app', 'qdrant'], { env: dockerEnv, quiet: true })
    dockerStarted = true

    console.log('\n[5/6] Checking backend health')
    try {
      await waitForHealth(healthUrl)
    }
    catch (error) {
      await dumpDockerStatus(dockerEnv)
      throw error
    }

    console.log('\n[6/6] Stopping Docker services')
    await run('docker', ['compose', 'down'], { env: dockerEnv, quiet: true })

    console.log('\nRelease smoke completed successfully.')
  }
  catch (error) {
    console.error('\nRelease smoke failed:', error instanceof Error ? error.message : String(error))
    if (dockerStarted) {
      try {
        console.log('\n[cleanup] docker compose down')
        await run('docker', ['compose', 'down'], { env: dockerEnv, quiet: true })
      }
      catch (cleanupError) {
        console.error('[cleanup] failed:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
      }
    }
    process.exitCode = 1
  }
}

await main()
