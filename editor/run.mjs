/**
 * Starts the editor and starts it again when it asks to (after a sync brought newer editor code from GitHub).
 *   exit code 75 → start again          76 → install the new tools (npm install), then start again
 * Only the first start opens the browser; restarts reuse the page that is already open (it reloads itself).
 */
import { spawn, spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let first = true
for (;;) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'editor', 'server.mjs')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, ...(first ? {} : { NO_OPEN: '1' }) },
    })
    child.on('exit', (c) => resolve(c ?? 0))
    process.on('SIGINT', () => child.kill('SIGINT'))
  })
  first = false
  if (code === 76) {
    console.log('\n  Installing the updated editor tools…\n')
    spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  }
  if (code !== 75 && code !== 76) process.exit(code)
}
