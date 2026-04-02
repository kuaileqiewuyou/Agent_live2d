import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function checkCommand(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checker, [command], { stdio: 'ignore' })
  return result.status === 0
}

function checkLocalTauriCli() {
  const binName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
  const binPath = resolve(process.cwd(), 'node_modules', '.bin', binName)
  return existsSync(binPath)
}

function printResult(name, passed, hint) {
  const status = passed ? 'OK' : 'MISSING'
  console.log(`[${status}] ${name}`)
  if (!passed && hint) {
    console.log(`        hint: ${hint}`)
  }
}

function main() {
  const checks = [
    {
      name: 'Rust toolchain (cargo)',
      passed: checkCommand('cargo'),
      hint: 'Install Rust: https://www.rust-lang.org/tools/install',
    },
    {
      name: 'Rust compiler (rustc)',
      passed: checkCommand('rustc'),
      hint: 'Install Rust: https://www.rust-lang.org/tools/install',
    },
    {
      name: 'Tauri CLI (local node_modules/.bin/tauri)',
      passed: checkLocalTauriCli(),
      hint: 'Run `npm install` to install @tauri-apps/cli',
    },
  ]

  console.log('Desktop Doctor (Tauri prerequisites)')
  console.log('-------------------------------------')
  for (const item of checks) {
    printResult(item.name, item.passed, item.hint)
  }

  const missing = checks.filter(item => !item.passed)
  if (missing.length > 0) {
    console.log('\nResult: failed. Install missing prerequisites, then run `npm run tauri:build`.')
    process.exitCode = 1
    return
  }

  console.log('\nResult: ready. You can run `npm run tauri:dev` or `npm run tauri:build`.')
}

main()
