import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const testEnvironment = {
  ...process.env,
  VITE_API_BASE_URL: 'https://api.bryanlab.ovh',
  VITE_UI_INTERACTION_TEST: 'true',
}
const outputDir = mkdtempSync(join(tmpdir(), 'syncoria-browser-'))
process.on('exit', () => rmSync(outputDir, { recursive: true, force: true }))

const build = spawnSync(npmCommand, ['run', 'build', '--', '--outDir', outputDir, '--emptyOutDir'], {
  env: testEnvironment,
  stdio: 'inherit',
})

if (build.status !== 0) {
  process.exit(build.status ?? 1)
}

const preview = spawn(
  npmCommand,
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--outDir', outputDir],
  { env: testEnvironment, stdio: 'inherit' },
)

function stopPreview(signal) {
  preview.kill(signal)
}

process.on('SIGINT', () => stopPreview('SIGINT'))
process.on('SIGTERM', () => stopPreview('SIGTERM'))

preview.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
