/**
 * End-to-end verification of the built site (dist/) in a real Chromium-based browser.
 *   npm run build && npm run verify
 * Env: BROWSER_PATH (defaults to installed Chrome/Edge on Windows), VERIFY_ALL=1 to test every product page
 * at every width (default: every page at 390 + 1366, key pages at all four widths).
 */
import { spawn } from 'node:child_process'
import { readFile, readdir, mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const PORT = 4174
const BASE = `http://localhost:${PORT}`
const WIDTHS = [390, 768, 1024, 1366]
const shotsDir = join(root, '.verify', 'shots')
await mkdir(shotsDir, { recursive: true })

const candidates = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
let executablePath
for (const c of candidates.filter(Boolean)) if (await access(c).then(() => true, () => false)) { executablePath = c; break }

const server = spawn(process.execPath, [join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 600))

const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

// 1. Static checks on the HTML files: every internal link/asset resolves.
async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.name.endsWith('.html')) out.push(p)
  }
  return out
}
const htmlFiles = await walk(dist)
const routes = htmlFiles.map((f) => f.slice(dist.length).replace(/\\/g, '/').replace(/index\.html$/, '')).filter((r) => r !== '/404.html').sort()
const exists = (p) => access(p).then(() => true, () => false)
const checked = new Map()
let linkCount = 0
const FORBIDDEN = /add to cart|add-to-cart|\bcart\b|checkout|log ?in\b|sign ?in\b|sign ?up|register|place order|order now|buy now|my account|track order|\bpay now/i
for (const f of htmlFiles) {
  const html = await readFile(f, 'utf8')
  const route = f.slice(dist.length).replace(/\\/g, '/')
  if (/localhost:8080|\/api\//i.test(html)) fail(route, 'references the Spring Boot API')
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
  const m = visible.match(FORBIDDEN)
  if (m) fail(route, `transaction wording found: "${m[0]}"`)
  // Only search/filter forms may exist; no quantity inputs, password fields or non-GET forms.
  for (const [form] of html.matchAll(/<form[^>]*>/g)) if (!/role="search"/.test(form)) fail(route, `unexpected form ${form}`)
  if (/type="(number|password|email|tel)"/.test(html) || /method="post"/i.test(html)) fail(route, 'transaction-style input found')
  for (const [, attr] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    linkCount++
    if (checked.has(attr)) { if (!checked.get(attr)) fail(route, `broken link ${attr}`); continue }
    const target = attr.endsWith('/') ? join(dist, attr, 'index.html') : join(dist, attr)
    const ok = (await exists(target)) || (await exists(join(dist, attr, 'index.html')))
    checked.set(attr, ok)
    if (!ok) fail(route, `broken link ${attr}`)
  }
  for (const [, s] of html.matchAll(/srcset="([^"]+)"/g)) for (const part of s.split(',')) {
    const u = part.trim().split(' ')[0].split('?')[0]
    if (!checked.has(u)) checked.set(u, await exists(join(dist, u)))
    if (!checked.get(u)) fail(route, `broken srcset ${u}`)
  }
}
console.log(`Static: ${htmlFiles.length} HTML files, ${linkCount} internal links/assets checked, ${checked.size} unique.`)

// --static: links, wording and forms only (a few seconds). Used by the editor's "Publish" button.
if (process.argv.includes('--static')) {
  server.kill()
  if (failures.length) {
    console.log(`\n✗ ${failures.length} problem(s):\n` + failures.slice(0, 40).map((f) => `  - ${f}`).join('\n'))
    process.exit(1)
  }
  console.log('✓ Static checks passed.')
  process.exit(0)
}

// 2. Browser checks.
const browser = await chromium.launch({ executablePath })
const keyRoutes = ['/', '/kirana/', '/puja-samagri/', '/kirana/spices-masalas/', '/puja-samagri/pooja-kits/', '/kirana/pulses-dals/toor-dal/', '/kirana/household-cleaning/detergent-powder/', '/kirana/household-cleaning/detergent-powder/rin-detergent-powder-1-kg/', '/list/', '/puja-samagri/kumkum-turmeric/kumkum/', '/about/', '/visit/', '/contact/', '/search/?q=agarbatti', '/credits/', '/this-page-does-not-exist']
const plan = []
// QUICK=1: key pages, every section/category page, the first product of each category, and new/changed products.
const QUICK_EXTRA = ['/kirana/paper-plates-cups/paper-plates/', '/puja-samagri/other-devotional/puja-prasadam-cups/', '/puja-samagri/wicks-deepam-oil/deepam-oil/']
const seenCat = new Set()
const quickPick = (r) => {
  const parts = r.split('/').filter(Boolean)
  if (keyRoutes.includes(r) || QUICK_EXTRA.includes(r) || parts.length <= 2) return true
  const cat = parts.slice(0, 2).join('/')
  if (seenCat.has(cat)) return false
  seenCat.add(cat); return true
}
for (const r of [...routes, '/this-page-does-not-exist'].filter((r) => !(process.env.QUICK || process.argv.includes('--quick')) || quickPick(r))) {
  const widths = process.env.VERIFY_ALL || keyRoutes.includes(r) ? WIDTHS : [390, 1366]
  for (const w of widths) plan.push([r, w])
}

const stats = { pages: 0, images: 0 }
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 } })
  const page = await ctx.newPage()
  let errors = []
  const external = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (req) => {
    const u = req.url()
    if (!u.startsWith(BASE) && !u.startsWith('data:')) external.push(u)
    if (/\/api\/|:8080/.test(u)) external.push(u)
  })
  for (const [r, width] of plan.filter(([, x]) => x === w)) {
    errors = []
    external.length = 0
    const where = `${r} @${w}`
    const res = await page.goto(BASE + r, { waitUntil: 'load' })
    const expected = r === '/this-page-does-not-exist' ? 404 : 200
    if (res.status() !== expected) fail(where, `HTTP ${res.status()} (expected ${expected})`)
    // Scroll through to trigger lazy images.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)) }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    const report = await page.evaluate(async () => {
      // Lazy images below the fold may never start loading; force them, and never wait more than 5 s.
      document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager' })
      await Promise.race([
        Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r) }))),
        new Promise((r) => setTimeout(r, 5000)),
      ])
      const broken = [...document.images].filter((i) => !i.naturalWidth).map((i) => i.currentSrc || i.src)
      const overflowX = document.documentElement.scrollWidth - window.innerWidth
      const clipped = [...document.querySelectorAll('.cat-tile .en, .cat-tile .te, .chip, .card .en, .card .te, .btn, .nav-bar a, .brand-name, h1, h2')]
        .filter((el) => el.offsetParent && getComputedStyle(el).webkitLineClamp === 'none' && getComputedStyle(el).textOverflow !== 'ellipsis' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) // names cut short on purpose (3 lines, or one line with …) are fine
        .map((el) => el.textContent.trim().slice(0, 40))
      const offscreen = [...document.querySelectorAll('main *, header *')].filter((el) => {
        if (!el.offsetParent) return false
        const b = el.getBoundingClientRect()
        return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1)
      }).filter((el) => !el.closest('.hero-collage, .page-hero::after, .map-card, .fest-rail, .g-track, .g-thumbs')).map((el) => el.className || el.tagName).slice(0, 5)
      const small = [...document.querySelectorAll('header a, header button, header summary, .btn, .chip, .cat-tile, .card, .seg button, .menu-panel a, footer li a')]
        .filter((el) => el.offsetParent)
        .filter((el) => { const b = el.getBoundingClientRect(); return b.height < 40 || b.width < 40 })
        .map((el) => el.textContent.trim().slice(0, 30))
      await document.fonts.ready
      const teluguFont = [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Mana Telugu' && f.status === 'loaded')
      const hasTelugu = /[\u0c00-\u0c7f]/.test(document.body.innerText)
      return { broken, overflowX, clipped, offscreen, small, teluguFont, hasTelugu, imgs: document.images.length, title: document.title, lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, desc: !!document.querySelector('meta[name=description]')?.content }
    })
    stats.pages++
    stats.images += report.imgs
    if (r === '/this-page-does-not-exist') errors = errors.filter((e) => !/status of 404/.test(e))
    if (errors.length) fail(where, `console errors: ${errors.join(' | ')}`)
    if (external.length) fail(where, `external/API requests: ${[...new Set(external)].join(', ')}`)
    if (report.broken.length) fail(where, `broken images: ${report.broken.join(', ')}`)
    if (report.overflowX > 0) fail(where, `horizontal overflow ${report.overflowX}px`)
    if (report.clipped.length) fail(where, `clipped text: ${report.clipped.join(' | ')}`)
    if (report.small.length) fail(where, `small touch targets: ${report.small.join(' | ')}`)
    if (report.hasTelugu && !report.teluguFont) fail(where, 'Telugu font not loaded')
    if (report.lang !== 'en' || report.h1 !== 1 || !report.desc || !report.title) fail(where, `SEO basics (lang=${report.lang}, h1=${report.h1}, desc=${report.desc})`)
    if (keyRoutes.includes(r)) await page.screenshot({ path: join(shotsDir, `${(r.replace(/[^a-z0-9]+/gi, '_') || 'home')}-${w}.png`) })
  }
  await ctx.close()
}

// 3. Behaviour checks.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
async function searchCount(q, section) {
  await page.goto(`${BASE}/search/?q=${encodeURIComponent(q)}${section ? `&section=${section}` : ''}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelector('[data-status]').textContent.length > 0)
  return page.$$eval('[data-results] li', (l) => l.length)
}
const searches = [['kandi pappu', 1], ['Toor', 1], ['పసుపు', 2], ['కర్పూరం', 1], ['agarbathi', 4], ['tumeric', 1], ['jeelakarra', 1], ['sambrani', 2], ['biyyam', 3], ['tide', 1], ['bokula sabbu', 1], ['navaratnalu', 1], ['paper plates', 1], ['ollu sabbu', 1], ['maggi', 1], ['appalalu', 1], ['macroni', 1], ['nuvvulu', 2], ['yendu draksha', 1], ['biryani spices', 5], ['xyzqqq', 0]]
for (const [q, min] of searches) {
  const n = await searchCount(q)
  if (min === 0 ? n !== 0 : n < min) fail('search', `"${q}" → ${n} results (expected ${min === 0 ? 0 : `≥${min}`})`)
  else console.log(`  search "${q}" → ${n}`)
}
const all = await searchCount('oil')
const kir = await searchCount('oil', 'kirana')
const puj = await searchCount('oil', 'puja-samagri')
if (!(kir > 0 && puj > 0 && kir + puj === all)) fail('search', `section filter inconsistent: all=${all} kirana=${kir} puja=${puj}`)
else console.log(`  search "oil" all=${all} kirana=${kir} puja=${puj}`)
// Brand searches open THAT brand's product (with its own photo, never another brand's)
const skuList = JSON.parse(readFileSync(join(root, 'src', 'data', 'products.json'), 'utf8')).products
const ownPhoto = (type, id) => { const p = skuList.find((x) => x.id === id); return p?.photos?.[0] ? p.photos[0] + '.webp' : 'TILE' }
for (const [q, href, want] of [['cinthol', '/bath-soap/cinthol-bath-soap/', ownPhoto('bath-soap', 'cinthol-bath-soap')], ['సింథాల్ సబ్బు', '/bath-soap/cinthol-bath-soap/', ownPhoto('bath-soap', 'cinthol-bath-soap')], ['santoor', '/bath-soap/santoor-bath-soap/', ownPhoto('bath-soap', 'santoor-bath-soap')], ['candy pappu', '/toor-dal/', 'toor-dal.webp']]) {
  await page.goto(`${BASE}/search/?q=${encodeURIComponent(q)}`)
  await page.waitForFunction(() => document.querySelector('[data-results] li.pc'), null, { timeout: 4000 }).catch(() => {})
  const got = await page.$eval('[data-results] li.pc', (l) => [l.querySelector('a.card').getAttribute('href'), l.querySelector('.brand-tile') ? 'TILE' : (l.querySelector('.ph img')?.getAttribute('src') || '').split('/').pop().split('?')[0].replace(/.[0-9a-f]{8}.webp$/, '.webp')]).catch(() => ['none', 'none'])
  if (!got[0].includes(href) || got[1] !== want) fail('brand search', `"${q}" first result ${got.join(' ')} (expected ${href} ${want})`)
  else console.log(`  brand/sound-alike search "${q}" → ${got.join(' ')}`)
}
// Sizes in the search pick that size ("rin 1 kg", "tide 10 rs", "rice 25 kg", "అర కిలో కంది పప్పు")
for (const [q, href, want] of [['rin 1 kg', '/detergent-powder/rin-detergent-powder-1-kg/', 'rin-detergent-powder-1-kg'], ['tide 10 rs', '/detergent-powder/tide-detergent-powder-rs-10-packet/', 'tide-detergent-powder-rs-10-packet'], ['masoori rice 25 kg', '-masoori-rice', 'want:25000'], ['అర కిలో కంది పప్పు', '/toor-dal/', 'want:500']]) {
  await page.goto(`${BASE}/search/?q=${encodeURIComponent(q)}`)
  await page.waitForFunction(() => document.querySelector('[data-results] li.pc'), null, { timeout: 4000 }).catch(() => {})
  const got = await page.$eval('[data-results] li.pc', (l) => [l.querySelector('a.card').getAttribute('href'), l.querySelector('[data-want-g]') ? 'want:' + l.querySelector('[data-want-g]').dataset.wantG : l.querySelector('select')?.value || '']).catch(() => ['none', ''])
  if (!got[0].includes(href) || got[1] !== want) fail('size search', `"${q}" → ${got.join(' ')} (expected ${href} ${want})`)
  else console.log(`  size search "${q}" → ${got.join(' ')}`)
}
// My list: Add on a product page → counter shows 1, + makes 2
await page.goto(`${BASE}/kirana/household-cleaning/detergent-powder/tide-detergent-powder-1-kg/`)
await page.evaluate(() => localStorage.removeItem('jgs-list-v2'))
await page.reload()
await page.click('.buy-box [data-add]')
await page.click('.buy-box [data-inc]')
const listState = await page.evaluate(() => [document.querySelector('[data-list-count]')?.textContent, document.querySelector('.buy-box [data-qty] span')?.textContent])
if (listState[0] !== '1' || listState[1] !== '2') fail('my list', `counter/qty after Add + "+": ${listState.join(' / ')}`)
else console.log('  my list: Add → 1 line, + → 2 OK')
await page.evaluate(() => localStorage.removeItem('jgs-list-v2'))
// Puja kit: untick one item, add the kit → one list line holding the other items; the list page groups it under "Puja kits"
{
  const kitLink = await page.goto(`${BASE}/puja-samagri/pooja-kits/`).then(() => page.$$eval('.product-grid a.card', (as) => as.map((a) => a.getAttribute('href'))))
  let checked = false
  for (const href of kitLink) {
    await page.goto(BASE + href)
    if (!(await page.$('[data-kit-panel]'))) continue
    const total = await page.$$eval('.kit-row [data-kit-on]:not(:disabled)', (x) => x.length)
    await page.uncheck('.kit-row [data-kit-on]:not(:disabled) >> nth=0')
    await page.click('.buy-box [data-add]')
    const kit = await page.evaluate(() => JSON.parse(localStorage.getItem('jgs-list-v2')).items[0]?.kit?.length)
    if (kit !== total - 1) fail('puja kit', `${href}: ${kit} items added, expected ${total - 1}`)
    await page.goto(`${BASE}/list/`)
    const grp = await page.$eval('[data-preview]', (x) => x.textContent).catch(() => '')
    if (!/Kit/.test(grp) || !(await page.$('.li-kit .li-kit-items li'))) fail('puja kit', 'kit not shown on the list page')
    else console.log(`  puja kit: ${href} → ${kit} items in the list OK`)
    checked = true
    break
  }
  if (!checked) console.log('  puja kit: no kit with contents (skipped)')
  await page.evaluate(() => localStorage.removeItem('jgs-list-v2'))
}
// Header search submits to /search/
await page.goto(`${BASE}/`)
await page.fill('#q-mobile', 'ghee')
await page.press('#q-mobile', 'Enter')
await page.waitForURL(/\/search\/\?q=ghee/)
await page.waitForFunction(() => document.querySelectorAll('[data-results] li').length > 0)
console.log('  header search → /search/?q=ghee OK')
// Live suggestions while typing (header, any page)
await page.goto(`${BASE}/kirana/`)
await page.click('#q-mobile')
await page.keyboard.type('kand', { delay: 30 })
await page.waitForFunction(() => { const b = document.querySelector('#q-mobile').closest('form').querySelector('.suggest-box'); return b && !b.hidden && b.querySelector('.sg-n') }, null, { timeout: 4000 }).catch(() => fail('live search', 'no suggestions while typing "kand"'))
const firstSugg = await page.$eval('#q-mobile', (i) => i.closest('form').querySelector('.sg-n')?.textContent || '')
if (!/kandi pappu/i.test(firstSugg)) fail('live search', `"kand" first suggestion is "${firstSugg}"`)
else console.log(`  live suggestions: "kand" → ${firstSugg}`)
// Category filter
await page.goto(`${BASE}/kirana/spices-masalas/`)
await page.fill('[data-filter]', 'jeera')
const visible = await page.$$eval('[data-filter-item]', (l) => l.filter((x) => !x.hidden).length)
if (visible !== 1) fail('category filter', `"jeera" shows ${visible}`)
else console.log('  category filter "jeera" → 1 OK')
// Mobile menu opens and is keyboard accessible
await page.goto(`${BASE}/`)
await page.focus('details.menu > summary')
await page.keyboard.press('Enter')
if (!(await page.$eval('details.menu', (d) => d.open))) fail('menu', 'does not open with keyboard')
await page.keyboard.press('Escape')
if (await page.$eval('details.menu', (d) => d.open)) fail('menu', 'does not close with Escape')
console.log('  mobile menu keyboard open/close OK')
// Contact links
await page.goto(`${BASE}/visit/`)
const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')))
for (const need of ['tel:+919705006062', 'mailto:vamsi8202@gmail.com', 'https://maps.app.goo.gl/sxt2WXo9wP9ZxnJ57?g_st=ac']) if (!hrefs.includes(need)) fail('visit', `missing ${need}`)
if (!hrefs.some((h) => h?.startsWith('https://wa.me/919705006062'))) fail('visit', 'missing WhatsApp link')
console.log('  visit page: tel / mailto / wa.me / Google Maps links present')
// Redirects
for (const [from, to] of [['/pooja', '/puja-samagri/'], ['/directions', '/visit/'], ['/kirana', '/kirana/']]) {
  const r = await page.goto(BASE + from)
  if (new URL(r.url()).pathname !== to) fail('redirect', `${from} → ${r.url()}`)
}
console.log('  redirects OK')
// Festival recommendations: for every pre-rendered festival, check the lead-in, the festival day and the day before the lead-in.
await page.goto(`${BASE}/`)
const fests = await page.$$eval('[data-fest]', (els) => els.map((e) => ({ id: e.id, from: e.dataset.from, start: e.dataset.start, end: e.dataset.end })))
if (!fests.length) fail('festival', 'no festival sections rendered on the home page')
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const festAt = (d) => page.goto(`${BASE}/?fest-date=${d}`).then(() => page.evaluate(() => {
  const s = [...document.querySelectorAll('[data-fest]')].find((x) => !x.hidden)
  return s ? { id: s.id, today: s.classList.contains('is-today'), when: s.querySelector('[data-fest-when]').textContent } : null
}))
for (const f of fests) {
  const lead = await festAt(f.from)
  const day = await festAt(f.start)
  const last = await festAt(f.end)
  if (f.from < f.start && (!lead || lead.id !== f.id || lead.today)) fail('festival', `${f.id}: lead-in on ${f.from} shows ${JSON.stringify(lead)}`)
  if (!day || day.id !== f.id || !day.today) fail('festival', `${f.id}: festival day ${f.start} shows ${JSON.stringify(day)}`)
  if (!last || last.id !== f.id) fail('festival', `${f.id}: last day ${f.end} shows ${JSON.stringify(last)}`)
}
const gapDay = shift(fests.reduce((a, f) => (f.from < a ? f.from : a), '9999-12-31'), -1)
if (await festAt(gapDay) && !fests.some((f) => f.from <= gapDay && gapDay <= f.end)) fail('festival', `something shown on ${gapDay} (no festival)`)
console.log(`  festival recommendations OK for ${fests.length} upcoming festival dates`)
// Product photo galleries (only products that have extra photos).
const galleryRoutes = routes.filter((r) => existsSync(join(dist, r, 'index.html')) && /data-gallery/.test(readFileSync(join(dist, r, 'index.html'), 'utf8')))
for (const r of galleryRoutes.slice(0, 3)) {
  await page.goto(BASE + r)
  const n = await page.$$eval('.g-slide', (s) => s.length)
  await page.click('[data-g-next]')
  await page.waitForFunction(() => document.querySelector('[data-g-count]').textContent.startsWith('2 /'), null, { timeout: 3000 }).catch(() => fail('gallery', `${r}: next arrow did not move to photo 2`))
  await page.click(`[data-g-thumb="${n - 1}"]`)
  await page.waitForFunction((k) => document.querySelector('[data-g-count]').textContent.startsWith(`${k} /`), n, { timeout: 3000 }).catch(() => fail('gallery', `${r}: thumbnail did not jump to the last photo`))
}
console.log(`  photo galleries: ${galleryRoutes.length} product(s) with several photos${galleryRoutes.length ? ', swipe/arrows/thumbnails OK' : ''}`)

await browser.close()
server.kill()
console.log(`\nBrowser: ${stats.pages} page loads across ${WIDTHS.join('/')}px, ${stats.images} images checked.`)
if (failures.length) {
  console.log(`\n✗ ${failures.length} problem(s):\n` + failures.slice(0, 80).map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('✓ All checks passed. Screenshots: .verify/shots/')
