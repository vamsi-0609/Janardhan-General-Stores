/** Local preview of dist/ that mimics Cloudflare Pages: clean URLs, trailing-slash redirects, 404.html, _redirects. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' }
const redirects = (await readFile(join(dist, '_redirects'), 'utf8')).split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/))
const isFile = (p) => stat(p).then((s) => s.isFile(), () => false)

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let path = decodeURIComponent(url.pathname)
  const r = redirects.find(([from]) => from === path)
  if (r) { res.writeHead(Number(r[2] || 302), { Location: r[1] }); return res.end() }
  const safe = normalize(join(dist, path))
  if (!safe.startsWith(dist)) { res.writeHead(400); return res.end() }
  let file = null
  if (path.endsWith('/') && (await isFile(join(safe, 'index.html')))) file = join(safe, 'index.html')
  else if (await isFile(safe)) file = safe
  else if (!path.endsWith('/') && (await isFile(join(safe, 'index.html')))) { res.writeHead(308, { Location: path + '/' + url.search }); return res.end() }
  const status = file ? 200 : 404
  file ??= join(dist, '404.html')
  res.writeHead(status, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
}).listen(port, () => console.log(`Preview: http://localhost:${port}`))
