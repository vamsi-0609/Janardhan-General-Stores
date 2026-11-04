/**
 * One-time / maintenance script: finds a freely-licensed photo for every catalogue product on Wikimedia Commons,
 * converts it to an optimised square WebP in public/img/products/, and records author + license in
 * src/data/image-credits.json (shown on the /credits/ page).
 *
 * The production build does NOT run this and needs no network access — images are committed files.
 *
 *   node scripts/fetch-images.mjs            # fetch only missing images
 *   node scripts/fetch-images.mjs --force    # re-fetch everything
 *   node scripts/fetch-images.mjs slug1 slug2  # re-fetch specific products
 *
 * Only these licenses are accepted: CC0, Public Domain, CC BY, CC BY-SA. Files flagged with trademark or
 * personality-rights restrictions are skipped (avoids brand logos and identifiable people).
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { products } from '../src/data/catalogue.mjs'
import { IMAGE_OVERRIDES } from './image-overrides.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'img', 'products')
const creditsFile = join(root, 'src', 'data', 'image-credits.json')
const UA = 'JanardhanStoresCatalogueBuilder/1.0 (static catalogue site; contact: vamsi8202@gmail.com)'
const API = 'https://commons.wikimedia.org/w/api.php'

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const exists = (p) => access(p).then(() => true, () => false)
const strip = (html = '') => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

const OK_LICENSE = /^(cc0|cc[- ]zero|public domain|pd\b|pd-|cc by(-sa)? \d(\.\d)?)/i

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    await sleep(1500 * (attempt + 1))
  }
  throw new Error(`Commons API failed: ${url}`)
}

function toCandidate(page) {
  const ii = page.imageinfo?.[0]
  if (!ii) return null
  const m = ii.extmetadata ?? {}
  const license = strip(m.LicenseShortName?.value)
  const restrictions = strip(m.Restrictions?.value)
  return {
    title: page.title,
    index: page.index ?? 0,
    mime: ii.mime,
    width: ii.width,
    height: ii.height,
    thumb: ii.thumburl,
    source: ii.descriptionurl,
    license,
    licenseUrl: m.LicenseUrl?.value ?? '',
    author: strip(m.Artist?.value) || 'Unknown author',
    restrictions,
  }
}

// allowTm: real brand-pack photos of brands the shop confirmed it sells (trademark tag is a usage warning, not a copyright limit).
function acceptable(c, allowTm = false) {
  return (
    c &&
    /jpeg|png|webp/.test(c.mime) &&
    c.width >= 480 &&
    c.height >= 360 &&
    OK_LICENSE.test(c.license) &&
    !/nc|nd/i.test(c.license.replace(/^cc/i, '')) &&
    !(allowTm ? /personality/i : /trademark|personality/i).test(c.restrictions)
  )
}

async function search(query) {
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '900',
  })
  return (data.query?.pages ?? []).map(toCandidate).filter(acceptable).sort((a, b) => a.index - b.index)
}

async function byTitle(title, allowTm = false) {
  const data = await api({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '900' })
  const c = toCandidate(data.query?.pages?.[0] ?? {})
  if (!acceptable(c, allowTm)) throw new Error(`Pinned file not usable (license/size): ${title} → ${c?.license}`)
  return c
}

async function download(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    await sleep(2000 * (attempt + 1))
  }
  throw new Error(`Download failed: ${url}`)
}

await mkdir(outDir, { recursive: true })
const credits = (await exists(creditsFile)) ? JSON.parse(await readFile(creditsFile, 'utf8')) : {}
const candidatesFile = join(root, '.verify', 'candidates.json')
const candidates = (await exists(candidatesFile)) ? JSON.parse(await readFile(candidatesFile, 'utf8')) : {}
const failures = []

for (const p of products) {
  const out = join(outDir, `${p.slug}.webp`)
  const wanted = only.length ? only.includes(p.slug) : force || !(await exists(out)) || !credits[p.slug]
  if (!wanted) continue

  if (credits[p.slug]?.own && !only.includes(p.slug)) continue // never replace the shop's own photos
  const o = IMAGE_OVERRIDES[p.slug] ?? {}
  try {
    let chosen
    if (o.file) chosen = await byTitle(o.file, !!o.tm)
    else if (o.c != null) {
      // Reviewed pick from the candidate list (scripts/image-candidates.mjs → .verify/candidates.json).
      const list = candidates[o.from ?? p.slug]
      if (!list?.[o.c]) throw new Error(`candidate ${o.from ?? p.slug}#${o.c} missing — run image-candidates first`)
      chosen = await byTitle(list[o.c].title, !!o.tm)
    } else {
      const list = await search(o.q ?? p.q)
      chosen = list[o.pick ?? 0]
      if (!chosen) throw new Error(`no acceptable result for "${o.q ?? p.q}"`)
    }
    const buf = await download(chosen.thumb)
    await sharp(buf)
      .rotate()
      .resize(640, 640, { fit: 'cover', position: o.position ?? sharp.strategy.attention })
      .webp({ quality: 74, effort: 5 })
      .toFile(out)
    credits[p.slug] = {
      file: chosen.title,
      author: chosen.author,
      license: chosen.license,
      licenseUrl: chosen.licenseUrl,
      source: chosen.source,
    }
    console.log(`✓ ${p.slug.padEnd(24)} ${chosen.license.padEnd(14)} ${chosen.title}`)
  } catch (e) {
    failures.push(p.slug)
    console.log(`✗ ${p.slug.padEnd(24)} ${e.message}`)
  }
  await writeFile(creditsFile, JSON.stringify(credits, null, 2) + '\n')
  await sleep(250)
}

console.log(`\nDone. ${failures.length ? `Failed: ${failures.join(', ')}` : 'All images present.'}`)
