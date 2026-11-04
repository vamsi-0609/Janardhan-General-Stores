/**
 * Opens the website preview on this computer (http://localhost:4173).
 * Builds the site first, starts the preview server if it is not already running (e.g. by the editor), then opens the browser.
 * Used by "Open Local Site.cmd" / the desktop shortcut.
 */
import { execFileSync, spawn } from 'node:child_process'
import { request } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4173
const url = `http://localhost:${PORT}/`

const up = () => new Promise((res) => {
  const r = request({ host: '127.0.0.1', port: PORT, path: '/', method: 'HEAD', timeout: 800 }, () => res(true))
  r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false) }); r.end()
})
const openBrowser = () => {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
}

console.log('Building the website…')
execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { cwd: root, stdio: 'inherit' })

if (await up()) {
  console.log(`\nThe preview is already running. Opening ${url}`)
  openBrowser()
  setTimeout(() => process.exit(0), 1500)
} else {
  console.log(`\nStarting the preview at ${url}\nKeep this window open while you look at the site. Close it when you are done.\n`)
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: String(PORT) } })
  for (let i = 0; i < 30 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150))
  openBrowser()
  server.on('exit', (code) => process.exit(code ?? 0))
}
