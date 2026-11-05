/**
 * Janardhan General Stores — LOCAL catalogue editor.
 *
 *   npm run editor        (or double-click "Open Editor.cmd")
 *
 * Opens http://localhost:4300 in your browser. Everything you change is saved into the website's own data files
 * (src/data/*.json, shop-photos/, public/img/products/) and the site is rebuilt automatically, so
 * "View in browser" (http://localhost:4173) always shows the latest version.
 *
 * This editor is NOT part of the website: it is never built into dist/ and never deployed. Nothing goes live until
 * the changes are committed and pushed to GitHub.
 *
 * Safety: listens on 127.0.0.1 only and rejects requests coming from any other website.
 */
import { createServer, request as httpRequest } from 'node:http'
import { readFile, writeFile, rename, readdir, unlink, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
sharp.cache(false) // never keep photo files open (Windows cannot rename open files)
import { root, srcDir, outDir, thumbDir, creditsFile, IMAGE_EXT, processPhoto, ownCredit, readCrops, writeCrops, validCrop, uprightBuffer } from '../scripts/lib/photos.mjs'

const PORT = Number(process.env.EDITOR_PORT || 4300)
const PREVIEW_PORT = 4173
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])
const ORIGINS = new Set([...HOSTS].map((h) => `http://${h}`))
const dataDir = join(root, 'src', 'data')
const catalogueFile = join(dataDir, 'catalogue.json')
const festivalsFile = join(dataDir, 'festivals.json')
const brandsFile = join(dataDir, 'brands.json')
const productsFile = join(dataDir, 'products.json')
const editorDir = join(root, 'editor')
const festImgDir = join(root, 'public', 'img', 'festivals')
const brandImgDir = join(root, 'public', 'img', 'brands')
const SHOP_NAME = 'Janardhan General Stores and Puja Samagri'

await mkdir(srcDir, { recursive: true })
await mkdir(thumbDir, { recursive: true })
await mkdir(festImgDir, { recursive: true })
await mkdir(brandImgDir, { recursive: true })
// Remove leftovers of uploads that did not finish (temporary names start with __new).
for (const dir of [srcDir, outDir, thumbDir]) for (const f of await readdir(dir)) if (f.startsWith('__new')) await unlink(join(dir, f)).catch(() => {})

// ───────────────────────── data helpers ─────────────────────────
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'))
async function writeJson(f, data) {
  const tmp = `${f}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n')
  await rename(tmp, f)
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HEX = /^#[0-9a-f]{6}$/i
class Bad extends Error {}
const must = (cond, msg) => { if (!cond) throw new Bad(msg) }
const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 80)).filter(Boolean))] : [])
const allProducts = (cat) => cat.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.slug, section: c.section })))

function cleanProduct(input, { isNew }) {
  const p = {
    slug: str(input.slug, 80).toLowerCase(),
    name: str(input.name, 120),
    te: str(input.te, 120),
    aliases: strList(input.aliases),
    desc: str(input.desc, 600),
  }
  must(SLUG.test(p.slug), 'Web name (slug) may only use small letters, numbers and single dashes, e.g. "cinthol-soap".')
  must(!/-\d{1,2}$/.test(p.slug) || !isNew, 'Web name must not end in -2, -3 … (those names are used for extra photos).')
  must(p.name, 'English name is required.')
  must(p.te, 'Telugu name is required.')
  must(p.desc, 'Description is required.')
  if (str(input.q)) p.q = str(input.q, 120)
  const brands = strList(input.brands)
  if (brands.length) p.brands = brands
  for (const k of ['sizes', 'price', 'priceTe', 'caution', 'cautionTe']) if (str(input[k])) p[k] = str(input[k])
  if (str(input.photo)) p.photo = str(input.photo, 80)
  const alsoIn = strList(input.alsoIn)
  if (alsoIn.length) p.alsoIn = alsoIn
  return p
}


// ── Products (one product = one size on the shelf), stored in products.json ──
const UNITS = ['piece', 'packet', 'bar', 'bottle', 'box', 'bag', 'can', 'tube', 'sachet', 'set', 'kit', 'bundle', 'leaf', 'pair', 'dozen', 'roll', 'item']
const slugOf = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/₹\s*/g, 'rs-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)
function cleanSku(input, prev, types, brandIds) {
  const p = { id: prev ? prev.id : str(input.id, 70).toLowerCase(), type: str(input.type, 80) }
  must(types.has(p.type), 'Choose the type of product (e.g. Detergent Powder).')
  const brand = str(input.brand, 60)
  if (brand) { must(brandIds.has(brand), 'Choose a brand from the list (or add it in the Brands tab).'); p.brand = brand }
  p.name = str(input.name, 120)
  must(p.name, 'Product name is required, e.g. "Rin Detergent Powder".')
  if (str(input.te)) p.te = str(input.te, 120)
  p.size = str(input.size, 60)
  if (input.loose) { p.loose = true; p.size = p.size || 'Loose' }
  if (!p.size && !p.loose) p.unit = UNITS.includes(str(input.unit)) ? str(input.unit) : 'piece'
  // loose: starts from `min` grams, then fixed steps of `step` grams (defaults 250 / 250)
  if (p.loose) {
    const m = Number(input.min), st = Number(input.step)
    if ([10, 25, 50, 100, 500, 1000].includes(m)) p.min = m
    if ([10, 25, 50, 100, 250, 500, 1000].includes(st) && st !== ((p.min || 250) < 250 ? 25 : 250)) p.step = st
    else if ((p.min || 250) < 250) p.step = 25
  }
  const quick = (Array.isArray(input.quick) ? input.quick : prev?.quick || []).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x <= 100000)
  if (quick.length) p.quick = p.loose ? quick.filter((g) => g >= 250) : quick
  if (str(input.price)) p.price = str(input.price, 40)
  if (str(input.desc)) p.desc = str(input.desc, 600)
  const aliases = strList(input.aliases)
  if (aliases.length) p.aliases = aliases
  if (prev?.photos?.length) p.photos = prev.photos
  if (input.off) p.off = true
  if (input.hide) p.hide = true
  if (input.star) p.star = true
  if (str(input.tag)) p.tag = str(input.tag, 20)
  // puja kit: [{ id, a }] — products of the shop with an amount (count, or grams for loose ones)
  if (Array.isArray(input.kit)) {
    const seen = new Set()
    const kit = input.kit.map((k) => ({ id: str(k?.id, 70), a: Math.round(Number(k?.a)) }))
      .filter((k) => k.id && k.id !== p.id && Number.isFinite(k.a) && k.a > 0 && k.a <= 100000 && !seen.has(k.id) && seen.add(k.id)).slice(0, 60)
    if (kit.length) p.kit = kit
  }
  if (!prev && !p.id) delete p.id
  return p
}

function cleanCategory(input, sections) {
  const c = {
    section: str(input.section, 40),
    slug: str(input.slug, 80).toLowerCase(),
    name: str(input.name, 80),
    te: str(input.te, 80),
    blurb: str(input.blurb, 300),
  }
  must(sections.some((s) => s.slug === c.section), 'Choose Kirana or Puja Samagri.')
  must(SLUG.test(c.slug), 'Web name (slug) may only use small letters, numbers and single dashes.')
  must(c.name && c.te, 'English and Telugu names are required.')
  must(c.blurb, 'A short description is required.')
  return c
}

function cleanFestival(input, productSlugs) {
  const f = {
    id: str(input.id, 60).toLowerCase(),
    name: str(input.name, 80),
    te: str(input.te, 80),
    colors: [str(input.colors?.[0], 7), str(input.colors?.[1], 7)],
    lead: Math.round(Number(input.lead)),
  }
  must(SLUG.test(f.id), 'Festival web name may only use small letters, numbers and dashes.')
  must(f.name && f.te, 'English and Telugu festival names are required.')
  must(HEX.test(f.colors[0]) && HEX.test(f.colors[1]), 'Pick both colours.')
  must(Number.isFinite(f.lead) && f.lead >= 0 && f.lead <= 60, '"Show items … days before" must be between 0 and 60.')
  if (input.season) f.season = true
  // Banner design
  const PATTERNS = ['dots', 'sparkle', 'waves', 'rangoli', 'none']
  const bi = input.banner || {}
  const banner = {
    pattern: PATTERNS.includes(bi.pattern) ? bi.pattern : 'dots',
    decor: str(bi.decor, 8),
    dim: Math.min(80, Math.max(0, Math.round(Number(bi.dim ?? 45)) || 0)),
    itemsTitle: str(bi.itemsTitle, 80),
    waText: str(bi.waText, 60),
    hideCall: !!bi.hideCall,
  }
  for (const k of Object.keys(banner)) if (banner[k] === '' || banner[k] === false) delete banner[k]
  f.banner = banner
  if (str(input.note)) f.note = str(input.note, 300)
  for (const k of ['before', 'day']) {
    f[k] = { title: str(input[k]?.title, 120), titleTe: str(input[k]?.titleTe, 160), text: str(input[k]?.text, 600) }
    must(f[k].title && f[k].titleTe && f[k].text, `Fill in the ${k === 'before' ? '"Before the festival"' : '"On the festival day"'} title, Telugu title and text.`)
  }
  f.items = strList(input.items).filter((s) => productSlugs.has(s))
  must(f.items.length, 'Add at least one suggested item.')
  f.dates = (Array.isArray(input.dates) ? input.dates : []).map((occ) => (Array.isArray(occ) ? occ : [])
    .map((r) => [str(r?.[0], 10), str(r?.[1], 80), str(r?.[2], 80), str(r?.[3], 120)])
    .map((r) => (r[3] ? r : r.slice(0, 3)))
    .filter((r) => r[0] || r[1]))
    .filter((occ) => occ.length)
  must(f.dates.length, 'Add at least one date.')
  for (const occ of f.dates) {
    for (const r of occ) must(ISO.test(r[0]) && !Number.isNaN(Date.parse(r[0])), `"${r[0] || '(empty)'}" is not a valid date.`)
    for (const r of occ) must(r[1] && r[2], `Give each date a name in English and Telugu (${r[0]}).`)
    occ.sort((a, b) => a[0].localeCompare(b[0]))
    if (f.season) must(occ.length >= 2, 'A month-long season needs a first day and a last day.')
  }
  f.dates.sort((a, b) => a[0][0].localeCompare(b[0][0]))
  return f
}

// ───────────────────────── photos ─────────────────────────
// A product's photos, in order: <slug>.webp (main), then <slug>-2.webp, <slug>-3.webp …
async function listPhotoNames(slug) {
  const files = await readdir(outDir)
  const extras = files.map((f) => f.match(/^(.+)-(\d{1,2})\.webp$/)).filter((m) => m && m[1] === slug)
    .sort((a, b) => Number(a[2]) - Number(b[2])).map((m) => `${slug}-${m[2]}`)
  return [...(files.includes(`${slug}.webp`) ? [slug] : []), ...extras]
}
async function sourceOf(name) {
  for (const f of await readdir(srcDir)) if (IMAGE_EXT.test(f) && f.slice(0, -extname(f).length).toLowerCase() === name) return f
  return null
}
async function photoInfo(slug, credits, crops) {
  const names = await listPhotoNames(slug)
  const out = []
  for (const name of names) {
    const st = await stat(join(outDir, `${name}.webp`)).catch(() => null)
    const v = st ? Math.round(st.mtimeMs) : 0
    out.push({ name, url: `/photo/${name}.webp?v=${v}`, thumb: `/photo/thumb/${name}.webp?v=${v}`, stock: name === slug && !credits[slug]?.own,
      hasSource: !!(await sourceOf(name)), crop: crops[name] || null })
  }
  return out
}
// moveSet/deleteSet keep the photo files AND its crop settings together.
async function moveSet(from, to, crops) {
  for (const dir of [outDir, thumbDir]) if (existsSync(join(dir, `${from}.webp`))) await rename(join(dir, `${from}.webp`), join(dir, `${to}.webp`))
  const src = await sourceOf(from)
  if (src) await rename(join(srcDir, src), join(srcDir, to + extname(src).toLowerCase()))
  if (crops) { if (crops[from]) crops[to] = crops[from]; else delete crops[to]; delete crops[from] }
}
async function deleteSet(name, crops) {
  for (const dir of [outDir, thumbDir]) await unlink(join(dir, `${name}.webp`)).catch(() => {})
  const src = await sourceOf(name)
  if (src) await unlink(join(srcDir, src))
  if (crops) delete crops[name]
}
/** Rename the given photo names into the order slug, slug-2, slug-3 … and fix the photo credit. */
async function applyOrder(slug, ordered, credits, crops) {
  const tag = `__tmp${randomBytes(3).toString('hex')}`
  const temps = []
  for (let i = 0; i < ordered.length; i++) { const t = `${tag}-${i}`; await moveSet(ordered[i], t, crops); temps.push(t) }
  for (let i = 0; i < temps.length; i++) await moveSet(temps[i], i === 0 ? slug : `${slug}-${i + 1}`, crops)
  if (ordered.length && ordered[0] !== slug) {
    const src = await sourceOf(slug)
    credits[slug] = ownCredit(src || `${slug}.webp`, SHOP_NAME)
  }
  if (!ordered.length) delete credits[slug]
}
async function photoOp(slug, op, body) {
  const cat = await readJson(catalogueFile)
  const p = cat.categories.flatMap((c) => c.products).find((x) => x.slug === slug)
  must(p, 'Product not found. Save the product first, then add photos.')
  must(!p.photo, `This product uses the photos of "${p.photo}". Edit photos there.`)
  const credits = await readJson(creditsFile)
  const crops = await readCrops()
  let names = await listPhotoNames(slug)
  // Which brand each photo shows (photoBrands[i] belongs to photo i); kept with its photo when photos move.
  const brandOf = Object.fromEntries(names.map((n, i) => [n, p.photoBrands?.[i] || null]))
  const saveBrands = async () => {
    const tags = names.map((n) => (p.brands || []).includes(brandOf[n]) ? brandOf[n] : null)
    while (tags.length && !tags[tags.length - 1]) tags.pop()
    const before = JSON.stringify(p.photoBrands || [])
    if (tags.length) p.photoBrands = tags
    else delete p.photoBrands
    if (JSON.stringify(p.photoBrands || []) !== before) await writeJson(catalogueFile, cat)
  }
  if (op === 'brand') {
    must(names.includes(body.name), 'Photo not found.')
    const b = str(body.brand, 80)
    must(!b || (p.brands || []).includes(b), 'Add the brand to "Brands at the shop" and save first.')
    brandOf[body.name] = b || null
    await saveBrands()
    return
  }
  if (op === 'crop') {
    must(names.includes(body.name), 'Photo not found.')
    const src = await sourceOf(body.name)
    must(src, 'This is a stock photo. Add your own photo to be able to adjust it.')
    const crop = body.crop ? validCrop(body.crop) : null
    must(!body.crop || crop, 'Invalid crop.')
    if (crop) crops[body.name] = crop
    else delete crops[body.name]
    await processPhoto(await readFile(join(srcDir, src)), body.name, crop)
    await writeCrops(crops)
    return
  }
  if (op === 'add') {
    const temp = `__new${randomBytes(4).toString('hex')}`
    const ext = (extname(body.filename || '').toLowerCase().match(/^\.(jpe?g|png|webp)$/) || ['.jpg'])[0]
    const meta = await sharp(body.data).metadata().catch(() => null)
    must(meta && meta.width >= 100 && meta.height >= 100, 'That file is not a usable photo (JPG, PNG or WebP, at least 100×100).')
    await writeFile(join(srcDir, temp + ext), body.data)
    await processPhoto(body.data, temp)
    // A stock (Wikimedia) main photo is replaced by the first photo you add.
    if (names[0] === slug && !credits[slug]?.own) { await deleteSet(slug, crops); names = names.slice(1) }
    names.push(temp)
  } else if (op === 'main' || op === 'move') {
    const i = names.indexOf(body.name)
    must(i >= 0, 'Photo not found.')
    const j = op === 'main' ? 0 : i + (body.dir < 0 ? -1 : 1)
    if (j < 0 || j >= names.length || i === j) return
    const [x] = names.splice(i, 1)
    names.splice(j, 0, x)
    if (names[0] !== slug && names.includes(slug) && !credits[slug]?.own) { await deleteSet(slug, crops); names = names.filter((n) => n !== slug) }
  } else if (op === 'delete') {
    must(names.includes(body.name), 'Photo not found.')
    must(names.length > 1, 'Every product needs at least one photo. Add another photo before deleting this one.')
    await deleteSet(body.name, crops)
    names = names.filter((n) => n !== body.name)
  }
  await applyOrder(slug, names, credits, crops)
  await writeJson(creditsFile, credits)
  await writeCrops(crops)
  await saveBrands()
}

// ───────────────────────── build + preview ─────────────────────────
const build = { status: 'idle', at: 0, log: '', queued: false }
let buildTimer = null
function scheduleBuild() {
  build.status = build.status === 'building' ? 'building' : 'pending'
  clearTimeout(buildTimer)
  buildTimer = setTimeout(runBuild, 400)
}
function runBuild() {
  if (build.status === 'building') { build.queued = true; return }
  build.status = 'building'
  execFile(process.execPath, [join(root, 'scripts', 'build.mjs')], { cwd: root }, (err, stdout, stderr) => {
    build.log = (stdout + stderr).trim().split('\n').slice(-12).join('\n')
    build.status = err ? 'error' : 'ok'
    build.at = Date.now()
    if (build.queued) { build.queued = false; runBuild() }
  })
}
function previewUp() {
  return new Promise((res) => {
    const r = httpRequest({ host: '127.0.0.1', port: PREVIEW_PORT, path: '/', method: 'HEAD', timeout: 800 }, () => res(true))
    r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false) }); r.end()
  })
}
async function ensurePreview() {
  if (await previewUp()) return
  const child = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PREVIEW_PORT) }, stdio: 'ignore' })
  process.on('exit', () => child.kill())
  for (let i = 0; i < 20 && !(await previewUp()); i++) await new Promise((r) => setTimeout(r, 150))
}
function gitChanges() {
  return new Promise((res) => execFile('git', ['status', '--porcelain'], { cwd: root }, (err, out) => res(err ? null : out.split('\n').filter(Boolean).length)))
}

// ───────────────────────── publish to the live website ─────────────────────────
// Build → quick checks → git commit → git push (GitHub) → Cloudflare Pages deploys automatically → watch until live.
const LIVE_URL = 'https://shop.myconnect.sbs/'
const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { cwd: root, timeout: opts.timeout || 120000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...(opts.env || {}) } },
    (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim(), code: err?.code }))
})
const publish = { running: false, steps: [], error: '', live: 'idle', commit: '', at: 0 }

async function changeSummary() {
  const st = await run('git', ['status', '--porcelain'])
  const files = st.out.split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2).trim(), path: l.slice(3).replace(/^"|"$/g, '') }))
  const count = (re) => files.filter((f) => re.test(f.path)).length
  const lines = []
  // Product/category/festival differences against the last published version.
  const prev = await run('git', ['show', 'HEAD:src/data/catalogue.json'])
  if (files.some((f) => f.path === 'src/data/catalogue.json')) {
    if (prev.ok) {
      try {
        const a = JSON.parse(prev.out), b = await readJson(catalogueFile)
        const flat = (c) => new Map(c.categories.flatMap((x) => x.products.map((p) => [p.slug, JSON.stringify({ ...p, cat: x.slug })])))
        const name = (c, s) => c.categories.flatMap((x) => x.products).find((p) => p.slug === s)?.name || s
        const A = flat(a), Bm = flat(b)
        const added = [...Bm.keys()].filter((k) => !A.has(k)), removed = [...A.keys()].filter((k) => !Bm.has(k))
        const changed = [...Bm.keys()].filter((k) => A.has(k) && A.get(k) !== Bm.get(k))
        if (added.length) lines.push(`Added ${added.length} product(s): ${added.map((s) => name(b, s)).join(', ')}`)
        if (removed.length) lines.push(`Removed ${removed.length} product(s): ${removed.map((s) => name(a, s)).join(', ')}`)
        if (changed.length) lines.push(`Edited ${changed.length} product(s): ${changed.slice(0, 12).map((s) => name(b, s)).join(', ')}${changed.length > 12 ? ' …' : ''}`)
        const ca = a.categories.map((x) => JSON.stringify({ ...x, products: undefined })).join(), cb = b.categories.map((x) => JSON.stringify({ ...x, products: undefined })).join()
        if (ca !== cb) lines.push('Categories changed')
      } catch { lines.push('Products and categories updated') }
    } else lines.push('Products and categories updated')
  }
  if (files.some((f) => f.path === 'src/data/festivals.json')) {
    const pf = await run('git', ['show', 'HEAD:src/data/festivals.json'])
    try {
      const a = JSON.parse(pf.out).festivals, b = (await readJson(festivalsFile)).festivals
      const changedF = b.filter((f) => JSON.stringify(f) !== JSON.stringify(a.find((x) => x.id === f.id))).map((f) => f.name)
      const removedF = a.filter((f) => !b.some((x) => x.id === f.id)).map((f) => f.name)
      if (changedF.length) lines.push(`Festivals updated: ${changedF.join(', ')}`)
      if (removedF.length) lines.push(`Festivals removed: ${removedF.join(', ')}`)
    } catch { lines.push('Festivals updated') }
  }
  if (files.some((f) => f.path === 'src/data/products.json')) lines.push('Products (sizes, prices, photos) changed')
  if (files.some((f) => f.path === 'src/data/brands.json')) lines.push('Brands changed')
  const photos = count(/^public\/img\/products\/(?!thumb\/)/)
  if (photos) lines.push(`${photos} product photo(s) added, changed or removed`)
  if (count(/^public\/img\/festivals\//)) lines.push('Festival banner photo(s) changed')
  const code = files.filter((f) => !/^(src\/data\/(catalogue|festivals|image-credits|products|brands)\.json|public\/img\/|shop-photos\/)/.test(f.path)).length
  if (code) lines.push(`${code} website design/code file(s) changed`)
  // Versions saved here but not uploaded yet (e.g. GitHub was down last time).
  const ahead = await run('git', ['rev-list', '--count', 'origin/main..HEAD'])
  const unpushed = ahead.ok ? Number(ahead.out) || 0 : 0
  if (unpushed) lines.push(`${unpushed} saved version(s) waiting to be uploaded (the last upload did not finish)`)
  return { files: files.length + unpushed, lines }
}

async function liveMatches() {
  try {
    const local = await readFile(join(root, 'dist', 'index.html'), 'utf8')
    const res = await fetch(`${LIVE_URL}?v=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })
    const live = await res.text()
    const key = (h) => [h.match(/data-search-index="([^"]+)"/)?.[1], h.match(/\/assets\/styles\.[a-f0-9]+\.css/)?.[0]].join('|')
    return key(local) === key(live)
  } catch { return false }
}
async function watchLive() {
  publish.live = 'deploying'
  const started = Date.now()
  while (Date.now() - started < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15000))
    if (await liveMatches()) { publish.live = 'live'; publish.at = Date.now(); return }
  }
  publish.live = 'slow'
}

async function doPublish(note) {
  const step = (label, status = 'running', detail = '') => {
    const s = publish.steps.find((x) => x.label === label)
    if (s) Object.assign(s, { status, detail }); else publish.steps.push({ label, status, detail })
  }
  publish.running = true; publish.steps = []; publish.error = ''; publish.live = 'idle'; publish.commit = ''
  try {
    step('Building the website')
    while (build.status === 'building' || build.status === 'pending') await new Promise((r) => setTimeout(r, 300))
    const b = await run(process.execPath, [join(root, 'scripts', 'build.mjs')])
    if (!b.ok) throw Object.assign(new Error('The website could not be built, so nothing was published.'), { detail: b.out.split('\n').slice(-8).join('\n') })
    step('Building the website', 'done', b.out.split('\n').filter((l) => /Built|⚠/.test(l)).join('\n'))

    step('Checking links and pages')
    const v = await run(process.execPath, [join(root, 'scripts', 'verify.mjs'), '--static'])
    if (!v.ok) throw Object.assign(new Error('The check found problems, so nothing was published.'), { detail: v.out.split('\n').slice(-12).join('\n') })
    step('Checking links and pages', 'done', v.out.split('\n').filter((l) => /Static|✓/.test(l)).join('\n'))

    step('Saving this version')
    await run('git', ['add', '-A'])
    const staged = await run('git', ['diff', '--cached', '--quiet'])
    if (staged.ok) step('Saving this version', 'done', 'Nothing new to save')
    else {
      const msg = `Catalogue update from the editor${note ? `: ${note}` : ''}`
      const c = await run('git', ['commit', '-m', msg])
      if (!c.ok) throw Object.assign(new Error('Could not save this version.'), { detail: c.out.slice(-600) })
      publish.commit = (await run('git', ['rev-parse', '--short', 'HEAD'])).out
      step('Saving this version', 'done', msg)
    }

    step('Uploading to GitHub')
    // GitHub sometimes has short outages ("Internal Server Error"): try up to 3 times before giving up.
    let p
    for (let attempt = 1; attempt <= 3; attempt++) {
      p = await run('git', ['push', 'origin', 'HEAD:main'], { timeout: 180000 })
      if (p.ok || /fetch first|non-fast-forward|Authentication|credential|could not read Username|403|401/i.test(p.out)) break
      if (attempt < 3) { step('Uploading to GitHub', 'running', `GitHub did not accept the upload, trying again (${attempt + 1} of 3)…`); await new Promise((r) => setTimeout(r, attempt * 15000)) }
    }
    if (!p.ok) {
      const hint = /fetch first|non-fast-forward/i.test(p.out) ? 'GitHub has newer changes than this computer. Ask Claude to sync before publishing.'
        : /Internal Server Error|remote rejected.*failure|50[0-4]|Service Unavailable|Bad Gateway/i.test(p.out) ? 'GitHub is having a problem right now (not your fault). Your changes are saved on this computer. Wait 15–30 minutes and press Publish again; check githubstatus.com if it keeps failing.'
        : /Authentication|credential|could not read Username|403|401/i.test(p.out) ? 'GitHub needs you to sign in again. Run "git push" once in the static-site folder (a sign-in window opens), then publish again.'
        : /Could not resolve host|unable to access|timed out/i.test(p.out) ? 'No internet connection to GitHub. Check the internet and publish again (your changes are saved).' : ''
      throw Object.assign(new Error(`Upload failed. ${hint}`), { detail: p.out.slice(-600) })
    }
    step('Uploading to GitHub', 'done', 'Cloudflare is now building the live site')
    step('Going live on shop.myconnect.sbs', 'running', 'Usually 1–2 minutes')
    watchLive().then(() => step('Going live on shop.myconnect.sbs', publish.live === 'live' ? 'done' : 'warn',
      publish.live === 'live' ? 'Live ✓' : 'Taking longer than usual. Check the Deployments page in Cloudflare.'))
  } catch (e) {
    publish.error = e.message
    const s = publish.steps.find((x) => x.status === 'running')
    if (s) Object.assign(s, { status: 'error', detail: e.detail || '' })
  } finally {
    publish.running = false
    scheduleBuild()
  }
}

// ───────────────────────── HTTP ─────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}
const readBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Bad('File is too large (max 20 MB).')); req.destroy() } else chunks.push(c) })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})
const json = async (req) => { try { return JSON.parse((await readBody(req, 2e6)).toString('utf8') || '{}') } catch (e) { throw e instanceof Bad ? e : new Bad('Invalid data.') } }

// ───────────────────────── English letters → Telugu ─────────────────────────
// Asks Google Input Tools (the same engine as Google's Telugu keyboard) for the best Telugu spellings of a word.
// Without internet, falls back to the built-in phonetic rules in the editor page.
const teluguCache = new Map()
async function teluguOptions(text) {
  const word = text.toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return { options: [] }
  if (teluguCache.has(word)) return { options: teluguCache.get(word) }
  try {
    const u = `https://inputtools.google.com/request?itc=te-t-i0-und&num=6&cp=0&cs=1&ie=utf-8&oe=utf-8&text=${encodeURIComponent(word)}`
    const r = await fetch(u, { signal: AbortSignal.timeout(3500) })
    const d = await r.json()
    const options = d[0] === 'SUCCESS' && Array.isArray(d[1]?.[0]?.[1]) ? d[1][0][1].filter((x) => typeof x === 'string' && /^[ఀ-౿]+$/.test(x)).slice(0, 6) : []
    if (options.length) { teluguCache.set(word, options); if (teluguCache.size > 2000) teluguCache.delete(teluguCache.keys().next().value) }
    return { options, online: true }
  } catch { return { options: [], online: false } }
}

async function state() {
  const cat = await readJson(catalogueFile)
  const fest = await readJson(festivalsFile)
  const credits = await readJson(creditsFile)
  const crops = await readCrops()
  const photos = {}
  for (const p of allProducts(cat)) photos[p.slug] = await photoInfo(p.photo || p.slug, credits, crops)
  const festImages = {}
  for (const f of fest.festivals) {
    const st = await stat(join(festImgDir, `${f.id}.webp`)).catch(() => null)
    if (st) festImages[f.id] = `/festimg/${f.id}.webp?v=${Math.round(st.mtimeMs)}`
  }
  const brands = (await readJson(brandsFile)).brands
  for (const b of brands) if (b.logo) { const st = await stat(join(brandImgDir, `${b.id}.webp`)).catch(() => null); b.logoV = st ? Math.round(st.mtimeMs) : 0 }
  const skus = (await readJson(productsFile)).products
  // photo details of product photos (for the crop tool)
  const srcFiles = new Map((await readdir(srcDir)).filter((x) => IMAGE_EXT.test(x)).map((x) => [x.slice(0, -extname(x).length).toLowerCase(), x]))
  const photoMeta = {}
  for (const p of skus) for (const name of p.photos || []) {
    if (photoMeta[name]) continue
    const st = await stat(join(outDir, name + '.webp')).catch(() => null)
    photoMeta[name] = { hasSource: srcFiles.has(name), crop: crops[name] || null, v: st ? Math.round(st.mtimeMs) : 0 }
  }
  return { ...cat, festivals: fest.festivals, brands, skus, photoMeta, festImages, photos, build, changes: await gitChanges(), previewPort: PREVIEW_PORT }
}

async function handle(req, res) {
  // Only this computer, only this page.
  if (!HOSTS.has(req.headers.host)) return send(res, 403, { error: 'Forbidden' })
  if (req.method !== 'GET' && !ORIGINS.has(req.headers.origin)) return send(res, 403, { error: 'Forbidden' })
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = decodeURIComponent(url.pathname)

  if (req.method === 'GET') {
    if (path === '/' || path === '/index.html') return send(res, 200, await readFile(join(editorDir, 'index.html')), TYPES['.html'])
    if (path === '/app.js' || path === '/app.css') return send(res, 200, await readFile(join(editorDir, path.slice(1))), TYPES[extname(path)])
    const fi = path.match(/^\/festimg\/([a-z0-9-]+)\.webp$/)
    if (fi) { const file = join(festImgDir, `${fi[1]}.webp`); return existsSync(file) ? send(res, 200, await readFile(file), TYPES['.webp']) : send(res, 404, 'Not found', 'text/plain') }
    const bl = path.match(/^\/brandlogo\/([a-z0-9-]+)\.webp$/)
    if (bl) { const file = join(brandImgDir, `${bl[1]}.webp`); return existsSync(file) ? send(res, 200, await readFile(file), TYPES['.webp']) : send(res, 404, 'Not found', 'text/plain') }
    if (path === '/logo.webp') return send(res, 200, await readFile(join(root, 'public', 'brand', 'emblem.webp')), TYPES['.webp'])
    // Original photo for the crop window (upright, optionally rotated, max 1400 px).
    const ms = path.match(/^\/photo\/source\/([a-z0-9_-]+)$/)
    if (ms) {
      const src = await sourceOf(ms[1])
      if (!src) return send(res, 404, 'Not found', 'text/plain')
      const rot = [0, 90, 180, 270].includes(Number(url.searchParams.get('rotate'))) ? Number(url.searchParams.get('rotate')) : 0
      const buf = await sharp(await uprightBuffer(await readFile(join(srcDir, src)), rot)).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
      return send(res, 200, buf, 'image/jpeg')
    }
    const m = path.match(/^\/photo\/(thumb\/)?([a-z0-9_-]+)\.webp$/)
    if (m) {
      const f = join(m[1] ? thumbDir : outDir, `${m[2]}.webp`)
      return existsSync(f) ? send(res, 200, await readFile(f), TYPES['.webp']) : send(res, 404, 'Not found', 'text/plain')
    }
    if (path === '/api/state') return send(res, 200, await state())
    if (path === '/api/telugu') return send(res, 200, await teluguOptions(str(url.searchParams.get('text'), 60)))
    if (path === '/api/publish') return send(res, 200, { ...publish, summary: publish.running ? null : await changeSummary(), liveUrl: LIVE_URL })
    if (path === '/api/build') return send(res, 200, { build, changes: await gitChanges() })
    return send(res, 404, 'Not found', 'text/plain')
  }

  if (req.method === 'POST' && path === '/api/preview') { await ensurePreview(); if (build.status !== 'ok') runBuild(); return send(res, 200, { ok: true, port: PREVIEW_PORT }) }
  if (req.method === 'POST' && path === '/api/rebuild') { runBuild(); return send(res, 200, { ok: true }) }

  // Publish
  if (req.method === 'POST' && path === '/api/publish') {
    must(!publish.running, 'Publishing is already in progress.')
    const { note } = await json(req)
    doPublish(str(note, 120).replace(/[\r\n]+/g, ' '))
    return send(res, 200, { ok: true })
  }

  // Products
  if (req.method === 'POST' && path === '/api/product') {
    const { product, category, originalSlug, festivals: festIds } = await json(req)
    const cat = await readJson(catalogueFile)
    const isNew = !originalSlug
    const p = cleanProduct(product || {}, { isNew })
    if (!isNew) must(p.slug === originalSlug, 'The web name of an existing product cannot be changed.')
    const target = cat.categories.find((c) => c.slug === category)
    must(target, 'Choose a category.')
    if (p.alsoIn) { p.alsoIn = p.alsoIn.filter((s) => s !== category && cat.categories.some((c) => c.slug === s)); if (!p.alsoIn.length) delete p.alsoIn }
    const existing = allProducts(cat).find((x) => x.slug === p.slug)
    if (isNew) must(!existing, `A product with the web name "${p.slug}" already exists.`)
    else must(existing, 'Product not found.')
    if (p.photo) must(allProducts(cat).some((x) => x.slug === p.photo && !x.photo), `"Use photos of" must be an existing product.`)
    if (existing?.photoBrands) {
      const tags = existing.photoBrands.map((b) => ((p.brands || []).includes(b) ? b : null))
      while (tags.length && !tags[tags.length - 1]) tags.pop()
      if (tags.length) p.photoBrands = tags
    }
    if (isNew) target.products.push(p)
    else {
      const from = cat.categories.find((c) => c.products.some((x) => x.slug === p.slug))
      const idx = from.products.findIndex((x) => x.slug === p.slug)
      if (from === target) from.products[idx] = p
      else { from.products.splice(idx, 1); target.products.push(p) }
    }
    await writeJson(catalogueFile, cat)
    if (Array.isArray(festIds)) {
      const fest = await readJson(festivalsFile)
      for (const f of fest.festivals) {
        const want = festIds.includes(f.id)
        const has = f.items.includes(p.slug)
        if (want && !has) f.items.push(p.slug)
        if (!want && has) f.items = f.items.filter((s) => s !== p.slug)
      }
      must(fest.festivals.every((f) => f.items.length), 'A festival must keep at least one suggested item.')
      await writeJson(festivalsFile, fest)
    }
    scheduleBuild()
    return send(res, 200, { ok: true, slug: p.slug })
  }
  let m = path.match(/^\/api\/product\/([a-z0-9-]+)$/)
  if (req.method === 'DELETE' && m) {
    const slug = m[1]
    const cat = await readJson(catalogueFile)
    const skuUsers = (await readJson(productsFile)).products.filter((x) => x.type === slug)
    must(!skuUsers.length, skuUsers.length + ' product(s) are of this type (' + skuUsers.slice(0, 3).map((x) => x.name).join(', ') + (skuUsers.length > 3 ? ' …' : '') + '). Delete or move them first (Products tab).')
    const users = allProducts(cat).filter((x) => x.photo === slug)
    must(!users.length, `"${users.map((u) => u.name).join(', ')}" uses this product's photos. Change that first.`)
    const from = cat.categories.find((c) => c.products.some((x) => x.slug === slug))
    must(from, 'Product not found.')
    const fest = await readJson(festivalsFile)
    for (const f of fest.festivals) f.items = f.items.filter((s) => s !== slug)
    must(fest.festivals.every((f) => f.items.length), 'This is the only suggested item of a festival. Add another item to that festival first.')
    from.products = from.products.filter((x) => x.slug !== slug)
    await writeJson(catalogueFile, cat)
    await writeJson(festivalsFile, fest)
    const crops = await readCrops()
    for (const n of await listPhotoNames(slug)) await deleteSet(n, crops)
    await writeCrops(crops)
    const credits = await readJson(creditsFile); delete credits[slug]; await writeJson(creditsFile, credits)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // Photos
  m = path.match(/^\/api\/photo\/([a-z0-9-]+)\/(add|main|move|delete|crop|brand)$/)
  if (req.method === 'POST' && m) {
    const body = m[2] === 'add' ? { data: await readBody(req, 20 * 1024 * 1024), filename: url.searchParams.get('filename') || '' } : await json(req)
    await photoOp(m[1], m[2], body)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // ── Brands ──
  if (req.method === 'POST' && path === '/api/brand') {
    const { brand, originalId } = await json(req)
    const data = await readJson(brandsFile)
    const b = { id: str(brand?.id, 60).toLowerCase(), name: str(brand?.name, 60) }
    if (str(brand?.te)) b.te = str(brand.te, 60)
    must(b.name, 'Brand name is required.')
    if (!originalId) {
      if (!b.id) b.id = slugOf(b.name)
      must(SLUG.test(b.id), 'Brand web name may only use small letters, numbers and dashes.')
      must(!data.brands.some((x) => x.id === b.id || x.name.toLowerCase() === b.name.toLowerCase()), `The brand "${b.name}" already exists.`)
      data.brands.push(b)
    } else {
      const i = data.brands.findIndex((x) => x.id === originalId)
      must(i >= 0, 'Brand not found.')
      b.id = originalId
      if (data.brands[i].logo) b.logo = true
      must(!data.brands.some((x, j) => j !== i && x.name.toLowerCase() === b.name.toLowerCase()), `The brand "${b.name}" already exists.`)
      data.brands[i] = b
    }
    data.brands.sort((x, y) => x.name.localeCompare(y.name))
    await writeJson(brandsFile, data)
    scheduleBuild()
    return send(res, 200, { ok: true, id: b.id })
  }
  // Brand logo (optional): POST raw image → public/img/brands/<id>.webp ; DELETE removes it
  const ml = path.match(/^\/api\/brand\/([a-z0-9-]+)\/logo$/)
  if (ml && (req.method === 'POST' || req.method === 'DELETE')) {
    const data = await readJson(brandsFile)
    const b = data.brands.find((x) => x.id === ml[1])
    must(b, 'Brand not found.')
    const file = join(brandImgDir, `${b.id}.webp`)
    if (req.method === 'POST') {
      const body = await readBody(req, 20 * 1024 * 1024)
      const meta = await sharp(body).metadata().catch(() => null)
      must(meta && meta.width >= 40 && meta.height >= 20, 'That file is not a usable logo (PNG, JPG, WebP or SVG).')
      let img = sharp(body, { density: 300 }).rotate()
      // cut away empty borders (transparent or plain white) so every logo fills its box the same way
      const trimmed = await img.clone().trim({ threshold: 12 }).toBuffer().catch(() => null)
      if (trimmed) img = sharp(trimmed)
      const tmp = `${file}.${randomBytes(3).toString('hex')}.tmp`
      await img.resize(480, 240, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toFile(tmp)
      await rename(tmp, file)
      b.logo = true
    } else {
      await unlink(file).catch(() => {})
      delete b.logo
    }
    await writeJson(brandsFile, data)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }
  let mb = path.match(/^\/api\/brand\/([a-z0-9-]+)$/)
  if (req.method === 'DELETE' && mb) {
    const used = (await readJson(productsFile)).products.filter((p) => p.brand === mb[1])
    must(!used.length, `${used.length} product(s) use this brand (${used.slice(0, 3).map((p) => p.name).join(', ')}${used.length > 3 ? ' …' : ''}). Change or delete them first.`)
    const data = await readJson(brandsFile)
    data.brands = data.brands.filter((x) => x.id !== mb[1])
    await unlink(join(brandImgDir, `${mb[1]}.webp`)).catch(() => {})
    await writeJson(brandsFile, data)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // ── Products (one product = one size on the shelf) ──
  if (req.method === 'POST' && path === '/api/sku') {
    const { product, originalId } = await json(req)
    const data = await readJson(productsFile)
    const prev = originalId ? data.products.find((x) => x.id === originalId) : null
    if (originalId) must(prev, 'Product not found.')
    const types = new Set((await readJson(catalogueFile)).categories.flatMap((c) => c.products.map((p) => p.slug)))
    const brandIds = new Set((await readJson(brandsFile)).brands.map((b) => b.id))
    const p = cleanSku(product || {}, prev, types, brandIds)
    if (!prev) {
      let id = p.id || slugOf(`${p.name.replace(/\s*\(.*\)\s*$/, '')} ${p.size || ''}`) || 'product', n = 2
      const base = id
      while (data.products.some((x) => x.id === id)) id = `${base}-${n++}`
      p.id = id
      // a new size of an existing product goes right after its other sizes
      const lastSame = data.products.map((x, i) => [x, i]).filter(([x]) => x.type === p.type && x.brand === p.brand && x.name === p.name).pop()
      const lastType = data.products.map((x, i) => [x, i]).filter(([x]) => x.type === p.type).pop()
      const at = lastSame ? lastSame[1] + 1 : lastType ? lastType[1] + 1 : data.products.length
      data.products.splice(at, 0, p)
    } else {
      p.id = prev.id
      data.products[data.products.indexOf(prev)] = p
    }
    await writeJson(productsFile, data)
    scheduleBuild()
    return send(res, 200, { ok: true, id: p.id })
  }
  let ms = path.match(/^\/api\/sku\/([a-z0-9-]+)(?:\/(photo|crop|move))?$/)
  if (ms) {
    const data = await readJson(productsFile)
    const p = data.products.find((x) => x.id === ms[1])
    must(p, 'Product not found.')
    const inUse = (name) => data.products.some((x) => x !== p && (x.photos || []).includes(name)) || (p.photos || []).includes(name)
    const own = (name) => name.startsWith('p--')
    if (req.method === 'DELETE' && !ms[2]) {
      data.products = data.products.filter((x) => x !== p)
      // kits that held this size lose that item
      for (const x of data.products) if (x.kit) { x.kit = x.kit.filter((k) => k.id !== p.id); if (!x.kit.length) delete x.kit }
      await writeJson(productsFile, data)
      for (const name of p.photos || []) if (own(name) && !data.products.some((x) => (x.photos || []).includes(name))) await deleteSet(name)
      scheduleBuild()
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && ms[2] === 'move') {
      // reorder: { dir: -1 | 1 } within the products of the same type
      const { dir } = await json(req)
      const same = data.products.filter((x) => x.type === p.type)
      const k = same.indexOf(p), other = same[k + (dir > 0 ? 1 : -1)]
      must(other, 'Already at the end.')
      const i = data.products.indexOf(p), j = data.products.indexOf(other)
      ;[data.products[i], data.products[j]] = [data.products[j], data.products[i]]
      await writeJson(productsFile, data)
      scheduleBuild()
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && ms[2] === 'photo') {
      const op = url.searchParams.get('op')
      p.photos = p.photos || []
      if (op === 'add') {
        const body = await readBody(req, 20 * 1024 * 1024)
        const meta = await sharp(body).metadata().catch(() => null)
        must(meta && meta.width >= 100 && meta.height >= 100, 'That file is not a usable photo (JPG, PNG or WebP, at least 100×100).')
        const name = `p--${p.id.slice(0, 50)}--${randomBytes(3).toString('hex')}`
        const ext = (extname(url.searchParams.get('filename') || '').toLowerCase().match(/^\.(jpe?g|png|webp)$/) || ['.jpg'])[0]
        await writeFile(join(srcDir, name + ext), body)
        await processPhoto(body, name)
        p.photos.push(name)
      } else if (op === 'copy-from') {
        // reuse the photos of another product (e.g. the same pack in another size)
        const { from } = await json(req)
        const src = data.products.find((x) => x.id === from)
        must(src && src.photos?.length, 'That product has no photos.')
        for (const n of src.photos) if (!p.photos.includes(n)) p.photos.push(n)
      } else {
        const { name, dir } = await json(req)
        const i = p.photos.indexOf(name)
        must(i >= 0, 'Photo not found.')
        if (op === 'delete') {
          p.photos.splice(i, 1)
          if (own(name) && !inUse(name)) await deleteSet(name)
        } else if (op === 'main') { p.photos.splice(i, 1); p.photos.unshift(name) }
        else if (op === 'move') { const j = Math.max(0, Math.min(p.photos.length - 1, i + (dir > 0 ? 1 : -1))); p.photos.splice(i, 1); p.photos.splice(j, 0, name) }
        else throw new Bad('Unknown photo action.')
      }
      if (!p.photos.length) delete p.photos
      await writeJson(productsFile, data)
      scheduleBuild()
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && ms[2] === 'crop') {
      const { name, crop: c } = await json(req)
      must((p.photos || []).includes(name), 'Photo not found.')
      const src = await sourceOf(name)
      must(src, 'This is a stock photo. Add your own photo to be able to adjust it.')
      const crops = await readCrops()
      const crop = c ? validCrop(c) : null
      must(!c || crop, 'Invalid crop.')
      if (crop) crops[name] = crop
      else delete crops[name]
      await processPhoto(await readFile(join(srcDir, src)), name, crop)
      await writeCrops(crops)
      scheduleBuild()
      return send(res, 200, { ok: true })
    }
    throw new Bad('Unknown request.')
  }

  // ── One product with ALL its sizes (the product screen of the editor) ──
  //   { orig: { type, brand, name } | null, sizes: [{ id?, …product fields }] } — sizes not in the list are deleted.
  if (req.method === 'POST' && path === '/api/line') {
    const { orig, sizes } = await json(req)
    must(Array.isArray(sizes) && sizes.length, 'Add at least one size.')
    must(sizes.length <= 40, 'Too many sizes.')
    const data = await readJson(productsFile)
    const types = new Set((await readJson(catalogueFile)).categories.flatMap((c) => c.products.map((p) => p.slug)))
    const brandIds = new Set((await readJson(brandsFile)).brands.map((b) => b.id))
    const sameLine = (x, o) => x.type === o.type && (x.brand || '') === (o.brand || '') && x.name === o.name
    const old = orig ? data.products.filter((x) => sameLine(x, orig)) : []
    const allIds = new Set(data.products.map((x) => x.id))
    const out = []
    for (const input of sizes) {
      const prev = input.id ? old.find((x) => x.id === input.id) : null
      if (input.id) must(prev, 'One of the sizes was not found. Reload the editor and try again.')
      const p = cleanSku(input || {}, prev, types, brandIds)
      if (!prev) {
        let id = slugOf(`${p.name.replace(/\s*\(.*\)\s*$/, '')} ${p.size || ''}`) || 'product', n = 2
        const base = id
        while (allIds.has(id) || out.some((x) => x.id === id)) id = `${base}-${n++}`
        p.id = id
      }
      out.push(p)
    }
    const names = new Set(out.map((x) => `${x.type}|${x.brand || ''}|${x.name}`))
    must(names.size === 1, 'All sizes must have the same type, brand and name.')
    const labels = out.map((x) => (x.loose ? 'loose' : (x.size || x.unit || '').toLowerCase()))
    must(new Set(labels).size === labels.length, 'Two sizes are the same. Give each size a different size, e.g. “½ kg” and “1 kg”.')
    // kits may only hold existing products (not kits, not itself)
    const known = new Map(data.products.map((x) => [x.id, x]))
    for (const p of out) if (p.kit) {
      p.kit = p.kit.filter((k) => known.has(k.id) && !(known.get(k.id).kit || []).length && !out.some((x) => x.id === k.id))
      if (!p.kit.length) delete p.kit
    }
    // the product stays where it was (or goes after its type); its sizes stay together, in the order given
    const removed = old.filter((x) => !out.some((y) => y.id === x.id))
    const rest = data.products.filter((x) => !old.includes(x))
    let at = -1
    if (old.length && old[0].type === out[0].type) at = data.products.slice(0, data.products.indexOf(old[0])).filter((x) => !old.includes(x)).length
    if (at < 0) { const lastType = rest.map((x, i) => [x, i]).filter(([x]) => x.type === out[0].type).pop(); at = lastType ? lastType[1] + 1 : rest.length }
    rest.splice(at, 0, ...out)
    // kits that held a removed size lose that item
    const gone = new Set(removed.map((x) => x.id))
    for (const x of rest) if (x.kit) { x.kit = x.kit.filter((k) => !gone.has(k.id)); if (!x.kit.length) delete x.kit }
    data.products = rest
    await writeJson(productsFile, data)
    for (const p of removed) for (const name of p.photos || []) if (name.startsWith('p--') && !rest.some((x) => (x.photos || []).includes(name))) await deleteSet(name)
    scheduleBuild()
    return send(res, 200, { ok: true, ids: out.map((x) => x.id) })
  }
  // quick edit from the "Prices & stock" list: { price?, off?, size? }
  const mq = path.match(/^\/api\/sku\/([a-z0-9-]+)\/quick$/)
  if (req.method === 'POST' && mq) {
    const body = await json(req)
    const data = await readJson(productsFile)
    const p = data.products.find((x) => x.id === mq[1])
    must(p, 'Product not found.')
    if ('price' in body) { const v = str(body.price, 40); if (v) p.price = v; else delete p.price }
    if ('off' in body) { if (body.off) p.off = true; else delete p.off }
    if ('size' in body && !p.loose) { const v = str(body.size, 60); if (v) { p.size = v; delete p.unit } }
    await writeJson(productsFile, data)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // Categories
  if (req.method === 'POST' && path === '/api/category') {
    const { category, originalSlug } = await json(req)
    const cat = await readJson(catalogueFile)
    const c = cleanCategory(category || {}, cat.sections)
    if (!originalSlug) {
      must(!cat.categories.some((x) => x.slug === c.slug), `A category with the web name "${c.slug}" already exists.`)
      // New categories go at the end of their section.
      const lastIdx = cat.categories.map((x) => x.section).lastIndexOf(c.section)
      cat.categories.splice(lastIdx + 1, 0, { ...c, products: [] })
    } else {
      const old = cat.categories.find((x) => x.slug === originalSlug)
      must(old, 'Category not found.')
      must(c.slug === originalSlug, 'The web name of an existing category cannot be changed.')
      Object.assign(old, c)
    }
    await writeJson(catalogueFile, cat)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }
  m = path.match(/^\/api\/category\/([a-z0-9-]+)(\/move)?$/)
  if (m && req.method === 'POST' && m[2]) {
    const { dir } = await json(req)
    const cat = await readJson(catalogueFile)
    const i = cat.categories.findIndex((x) => x.slug === m[1])
    must(i >= 0, 'Category not found.')
    let j = i + (dir < 0 ? -1 : 1)
    if (j >= 0 && j < cat.categories.length && cat.categories[j].section === cat.categories[i].section) {
      ;[cat.categories[i], cat.categories[j]] = [cat.categories[j], cat.categories[i]]
      await writeJson(catalogueFile, cat)
      scheduleBuild()
    }
    return send(res, 200, { ok: true })
  }
  if (m && req.method === 'DELETE' && !m[2]) {
    const cat = await readJson(catalogueFile)
    const c = cat.categories.find((x) => x.slug === m[1])
    must(c, 'Category not found.')
    must(!c.products.length, `Move or delete its ${c.products.length} product(s) first.`)
    cat.categories = cat.categories.filter((x) => x !== c)
    await writeJson(catalogueFile, cat)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // Festival banner photo
  let mi = path.match(/^\/api\/festival-image\/([a-z0-9-]+)$/)
  if (mi) {
    const fest = await readJson(festivalsFile)
    must(fest.festivals.some((x) => x.id === mi[1]), 'Save the festival first, then add a banner photo.')
    const file = join(festImgDir, `${mi[1]}.webp`)
    if (req.method === 'POST') {
      const data = await readBody(req, 20 * 1024 * 1024)
      const meta = await sharp(data).metadata().catch(() => null)
      must(meta && meta.width >= 300, 'That file is not a usable photo (JPG, PNG or WebP, at least 300 px wide).')
      await sharp(data).rotate().resize(1600, 700, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 78 }).toFile(file)
    } else if (req.method === 'DELETE') {
      await unlink(file).catch(() => {})
    } else return send(res, 405, { error: 'Not allowed' })
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  // Festivals
  if (req.method === 'POST' && path === '/api/festival') {
    const { festival, originalId } = await json(req)
    const cat = await readJson(catalogueFile)
    const fest = await readJson(festivalsFile)
    const f = cleanFestival(festival || {}, new Set(allProducts(cat).map((p) => p.slug)))
    if (!originalId) {
      must(!fest.festivals.some((x) => x.id === f.id), `A festival with the web name "${f.id}" already exists.`)
      fest.festivals.push(f)
    } else {
      const i = fest.festivals.findIndex((x) => x.id === originalId)
      must(i >= 0, 'Festival not found.')
      must(f.id === originalId, 'The web name of an existing festival cannot be changed.')
      fest.festivals[i] = f
    }
    await writeJson(festivalsFile, fest)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }
  m = path.match(/^\/api\/festival\/([a-z0-9-]+)$/)
  if (req.method === 'DELETE' && m) {
    const fest = await readJson(festivalsFile)
    must(fest.festivals.some((x) => x.id === m[1]), 'Festival not found.')
    fest.festivals = fest.festivals.filter((x) => x.id !== m[1])
    await unlink(join(festImgDir, `${m[1]}.webp`)).catch(() => {})
    await writeJson(festivalsFile, fest)
    scheduleBuild()
    return send(res, 200, { ok: true })
  }

  return send(res, 404, { error: 'Not found' })
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!(e instanceof Bad)) console.error(e)
    if (!res.headersSent) send(res, e instanceof Bad ? 400 : 500, { error: e instanceof Bad ? e.message : 'Something went wrong. Check the editor window for details.' })
  })
}).listen(PORT, '127.0.0.1', async () => {
  const url = `http://localhost:${PORT}/`
  console.log(`\n  Janardhan catalogue editor: ${url}\n  Website preview:            http://localhost:${PREVIEW_PORT}/\n\n  Keep this window open while editing. Close it (or press Ctrl+C) when you are done.\n`)
  runBuild()
  await ensurePreview()
  if (!process.env.NO_OPEN) {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  }
})
