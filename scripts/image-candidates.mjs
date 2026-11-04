/**
 * Review helper: lists up to 10 acceptable (freely licensed, no trademark flag) Commons candidates per product
 * using several queries, and writes .verify/candidates.json + contact sheets for manual selection.
 *   node scripts/image-candidates.mjs [slug ...]
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { products } from '../src/data/catalogue.mjs'
import { IMAGE_OVERRIDES } from './image-overrides.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.verify')
const UA = 'JanardhanStoresCatalogueBuilder/1.0 (static catalogue site; contact: vamsi8202@gmail.com)'
const OK_LICENSE = /^(cc0|cc[- ]zero|public domain|pd\b|pd-|cc by(-sa)? \d(\.\d)?)/i
const strip = (h = '') => h.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = process.argv.slice(2)

async function search(q, allowTm = false) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    format: 'json', formatversion: '2', action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '15', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '200',
  })}`
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (r.ok) {
      const d = await r.json()
      return (d.query?.pages ?? [])
        .sort((a, b) => a.index - b.index)
        .map((p) => {
          const ii = p.imageinfo?.[0]
          const m = ii?.extmetadata ?? {}
          return { title: p.title, thumb: ii?.thumburl, w: ii?.width, h: ii?.height, mime: ii?.mime, license: strip(m.LicenseShortName?.value), restr: strip(m.Restrictions?.value) }
        })
        .filter((c) => c.thumb && /jpeg|png|webp/.test(c.mime) && c.w >= 480 && c.h >= 360 && OK_LICENSE.test(c.license) && !/nc|nd/i.test(c.license.replace(/^cc/i, '')) && !(allowTm ? /personality/i : /trademark|personality/i).test(c.restr))
    }
    await sleep(1500 * (i + 1))
  }
  return []
}

await mkdir(outDir, { recursive: true })
const file = join(outDir, 'candidates.json')
const all = await access(file).then(async () => JSON.parse(await readFile(file, 'utf8')), () => ({}))
for (const p of products) {
  if (only.length && !only.includes(p.slug)) continue
  if (!only.length && all[p.slug]) continue
  const o = IMAGE_OVERRIDES[p.slug] ?? {}
  // o.qs: extra queries (e.g. brand names); o.tm: allow trademark-tagged files (real brand packs the shop sells).
  const queries = [...new Set([...(o.qs ?? []), o.q, p.q, p.name.replace(/\(.*?\)/g, '').trim()].filter(Boolean))]
  const seen = new Set()
  const list = []
  for (const q of queries) {
    for (const c of await search(q, !!o.tm)) if (!seen.has(c.title)) { seen.add(c.title); list.push(c) }
    await sleep(200)
  }
  all[p.slug] = list.slice(0, 12)
  process.stdout.write(`${p.slug}:${list.length} `)
}
await writeFile(file, JSON.stringify(all, null, 1))

// Contact sheets, 16 products per page.
const slugs = (only.length ? only : products.map((p) => p.slug)).filter((s) => all[s])
for (let page = 0; page * 16 < slugs.length; page++) {
  const rows = slugs.slice(page * 16, page * 16 + 16).map((s) => {
    const p = products.find((x) => x.slug === s)
    const cells = all[s].map((c, i) => `<figure><img src="${c.thumb}"><figcaption>${i}</figcaption></figure>`).join('')
    return `<div class="row"><b>${s}<br><small>${p.name}</small></b>${cells}</div>`
  }).join('')
  await writeFile(join(outDir, `${only.length ? "re" : ""}sheet-${page}.html`), `<!doctype html><meta charset=utf-8><style>body{font:11px sans-serif;margin:4px;width:1500px}.row{display:flex;gap:3px;align-items:center;border-bottom:1px solid #ccc;padding:2px}b{width:130px;flex:none}figure{margin:0;position:relative}img{width:100px;height:100px;object-fit:cover;display:block}figcaption{position:absolute;top:0;left:0;background:#000;color:#fff;padding:0 3px;font-weight:bold}</style>${rows}`)
}
console.log('\nsheets written')
