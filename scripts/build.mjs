/**
 * Janardhan General Stores static catalogue — build script. Plain Node, no framework, no network, no backend.
 * Pre-renders every route to HTML in dist/ for Cloudflare Pages.
 *
 *   SITE_URL=https://shop.myconnect.sbs node scripts/build.mjs
 */
import { rm, mkdir, cp, readFile, writeFile, access, readdir } from 'node:fs/promises'
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shop, telHref, mailHref, whatsappHref } from '../src/data/shop.mjs'
import { sections, categories, products, categoriesOf, sectionOf, categoryOf, extrasOf, sectionsOfType, skus, skusOf, skuById, brandById, allTypeSlugs } from '../src/data/catalogue.mjs'
import { festivals } from '../src/data/festivals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const SITE = (process.env.SITE_URL || 'https://shop.myconnect.sbs').replace(/\/+$/, '')
const YEAR = new Date().getFullYear()
const credits = JSON.parse(await readFile(join(root, 'src/data/image-credits.json'), 'utf8'))
const exists = (p) => access(p).then(() => true, () => false)

// ───────────────────────── helpers ─────────────────────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const te = (s, tag = 'span', cls = '') => `<${tag} lang="te"${cls ? ` class="${cls}"` : ''}>${esc(s)}</${tag}>`
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10)
const theme = (sectionSlug) => (sectionSlug === 'puja-samagri' ? 'puja' : 'kirana')

const sectionUrl = (s) => `/${s}/`
const categoryUrl = (c) => `/${c.section}/${c.slug}/`
const productUrl = (p) => `/${p.section}/${p.category}/${p.slug}/`
// Every photo is published under a name that contains a code made from its contents (turmeric-powder.05e23433.webp).
// A changed photo therefore gets a brand-new address. (A ?v= code is not enough: while Cloudflare switches to a new
// version it can answer the new ?v= address with the OLD photo and then keep that wrong copy for a year.)
// A request for a name that does not exist yet just fails and is never cached.
const versions = new Map()
function versioned(path) {
  if (!versions.has(path)) {
    let file = join(root, 'public', path)
    if (!existsSync(file) && path.startsWith('/img/products/')) file = join(root, 'public', 'img', 'placeholder.webp')
    if (!existsSync(file)) versions.set(path, path)
    else {
      const code = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8)
      const named = path.replace(/\.webp$/, `.${code}.webp`)
      mkdirSync(dirname(join(dist, named)), { recursive: true })
      copyFileSync(file, join(dist, named))
      versions.set(path, named)
    }
  }
  return versions.get(path)
}
const imgPath = (slug) => `/img/products/${slug}.webp`
const thumbPath = (slug) => `/img/products/thumb/${slug}.webp`
const img = (slug) => versioned(imgPath(slug))
const thumb = (slug) => versioned(thumbPath(slug))

// Products without a photo yet (e.g. just added in the editor) get a placeholder in dist/ — never a broken image.
const missingPhoto = []
for (const p of products) {
  if (!(await exists(join(root, 'public', imgPath(p.photo || p.slug))))) missingPhoto.push(p.photo || p.slug)
}
if (missingPhoto.length) console.warn(`⚠ No photo yet for: ${[...new Set(missingPhoto)].join(', ')} (showing a placeholder).`)
const slugs = new Set()
for (const p of products) {
  if (slugs.has(p.slug)) throw new Error(`Duplicate product slug ${p.slug}`)
  slugs.add(p.slug)
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  directions: '<path d="m3 11 19-9-9 19-2-8-8-2Z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  store: '<path d="M3 9h18l-1.5-5h-15L3 9Zm0 0v11h18V9M9 20v-6h6v6"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/>',
}
const WA_PATH = '<path class="icon-fill" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3ZM12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/>'
const icon = (name, size = '') => name === 'whatsapp'
  ? `<svg class="icon"${size ? ` style="width:${size};height:${size}"` : ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false">${WA_PATH}</svg>`
  : `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`

// ───────────────────────── assets ─────────────────────────
await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, 'assets'), { recursive: true })
await cp(join(root, 'public'), dist, { recursive: true })
for (const slug of new Set(missingPhoto)) {
  await cp(join(root, 'public', 'img', 'placeholder.webp'), join(dist, imgPath(slug)))
  await cp(join(root, 'public', 'img', 'placeholder.webp'), join(dist, thumbPath(slug)))
}

async function asset(src, ext) {
  const body = await readFile(join(root, src), 'utf8')
  const name = `/assets/${src.split('/').pop().replace(/\.\w+$/, '')}.${hash(body)}.${ext}`
  await writeFile(join(dist, name), body)
  return name
}
const CSS = await asset('src/styles.css', 'css')
const SITE_JS = await asset('src/client/site.js', 'js')
const SEARCH_JS = await asset('src/client/search.js', 'js')
const LIST_JS = await asset('src/client/list.js', 'js')
const REPLY_JS = await asset('src/client/reply.js', 'js')

// ───────────────────────── product photo galleries ─────────────────────────
// Main photo: img/products/<slug>.webp. Extra photos: <slug>-2.webp, <slug>-3.webp … (from shop-photos/).
const productFiles = new Set(await readdir(join(root, 'public', 'img', 'products')))
function photosOf(p) {
  const base = p.photo || p.slug
  const extras = [...productFiles]
    .map((f) => f.match(/^(.+)-(\d{1,2})\.webp$/))
    .filter((m) => m && m[1] === base)
    .map((m) => [Number(m[2]), `${base}-${m[2]}`])
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name)
  return [base, ...extras]
}

// ───────────────────────── products: a PRODUCT LINE (type + brand + name) has one or more SIZES ─────────────────────────
const MONO = ['#355b45', '#a34b32', '#70413b', '#4f6d4a', '#8d3f2b', '#2f5d62', '#6a4c93', '#b58a38']
const monoColor = (str) => MONO[[...String(str)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % MONO.length]
const hasPhoto = (name) => !!name && productFiles.has(name + '.webp')
const typeOf = (p) => products.find((t) => t.slug === p.type)
const typeShort = (t) => t.name.replace(/\s*\(.*\)\s*$/, '')
const multi = (t) => skusOf(t.slug).length > 1
/** Page of one size: the type's address when the type has only this one. */
const skuUrl = (p) => { const t = typeOf(p); const ls = linesOf(t.slug); return ls.length === 1 && firstIn(ls[0]) === p ? productUrl(t) : productUrl(t) + p.id + '/' }
const skuPhotos = (p) => (p.photos || []).filter(hasPhoto)
const skuMain = (p) => skuPhotos(p)[0] || null
/** Contents of a puja kit: [{ id, a: amount, p: product }] (only products that are on the website, never another kit). */
const kitItems = (p) => (p.kit || []).map((k) => ({ ...k, p: skuById.get(k.id) })).filter((k) => k.p && !(k.p.kit || []).length && k.a > 0)
const sizeText = (p) => (p.loose ? `Loose · from ${p.min || 250} g` : p.size || (kitItems(p).length ? `Kit · ${kitItems(p).length} items` : p.unit ? `Per ${p.unit}` : ''))
const slugish = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const lineKey = (p) => `${p.type}:${p.brand || '-'}:${slugish(p.name)}`
/** Product lines of a type, in order: [[size, size …], …] */
const linesOf = (typeSlug) => { const m = new Map(); for (const p of skusOf(typeSlug)) { const k = lineKey(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p) } return [...m.values()] }
const lineOf = (p) => linesOf(p.type).find((l) => l.includes(p))
const firstIn = (line) => line.find((x) => !x.off) || line[0]
const lineMain = (line) => { for (const x of [firstIn(line), ...line]) { const m = skuMain(x); if (m) return m } return null }
/** Brand logo (optional, added in the editor's Brands tab): public/img/brands/<brand id>.webp */
const brandLogo = (id) => { const b = id && brandById.get(id); return b && b.logo && existsSync(join(root, 'public', 'img', 'brands', id + '.webp')) ? versioned('/img/brands/' + id + '.webp') : '' }
const brandK = (p, cls = 'brand-k') => (p.brandName ? '<span class="' + cls + (brandLogo(p.brand) ? ' has-logo' : '') + '">' + (brandLogo(p.brand) ? '<img class="bk-logo" src="' + brandLogo(p.brand) + '" alt="" loading="lazy" decoding="async">' : '') + '<span>' + esc(p.brandName) + '</span></span>' : '')
const tileHtml = (p, big = false) => brandLogo(p.brand)
  ? '<span class="brand-tile logo-tile' + (big ? ' big' : '') + '"><img src="' + brandLogo(p.brand) + '" alt="' + esc(p.brandName) + '" loading="lazy" decoding="async"><small>Photo coming soon</small></span>'
  : '<span class="brand-tile' + (big ? ' big' : '') + '" style="--mc:' + monoColor(p.brandName || p.name) + '"><strong>' + esc(p.brandName || p.name.replace(/\s*\(.*\)\s*$/, '')) + '</strong><small>Photo coming soon</small></span>'
/** What "My list" needs: the product line with all its sizes. */
function lineCfg(line, inner = false) {
  const p0 = firstIn(line), t = typeOf(p0), main = lineMain(line)
  return { k: lineKey(p0), n: p0.name, t: p0.te || t.te, u: skuUrl(p0), i: main ? thumb(main) : '', s: t.section === 'puja-samagri' ? 'p' : 'k', ...(p0.brandName ? { b: p0.brandName } : {}),
    v: line.map((p) => {
      const v = { id: p.id, l: p.loose ? '' : p.size || '', u: skuUrl(p) }
      if (p.price) v.p = p.price
      if (p.loose) { v.w = 1; if (p.min) v.m = p.min; if (p.step) v.s = p.step }
      if (!p.size && !p.loose && p.unit) v.un = p.unit
      if (!p.loose && p.quick && p.quick.length) v.q = p.quick
      const m = skuMain(p); if (m) v.i = thumb(m)
      if (p.off) v.off = 1
      if (!inner && kitItems(p).length) v.kit = kitItems(p).map((k) => ({ c: lineCfg(lineOf(k.p), true), v: k.id, a: k.a }))
      return v
    }) }
}
/** Owner's label for a product line ("New", "Popular" …), shown on the card photo. */
const lineTag = (line) => (line.find((x) => x.tag) || {}).tag || ''
const tagPill = (line) => (lineTag(line) ? '<span class="tag-pill">' + esc(lineTag(line)) + '</span>' : '')
/** Amount as shown in a kit row: "250 g", "2", "3 pieces". */
const kitAmt = (p, a) => (p.loose ? (a < 1000 ? a + ' g' : +(a / 1000).toFixed(2) + ' kg') : p.size ? String(a) : a + ' ' + (a === 1 ? p.unit || 'item' : (p.unit || 'item') === 'leaf' ? 'leaves' : /(x|ch|sh|s)$/.test(p.unit || 'item') ? (p.unit || 'item') + 'es' : (p.unit || 'item') + 's'))
/** Product page of a puja kit: "What's inside" list. Customers untick items, change sizes and amounts (list.js). */
function kitPanel(p) {
  const items = kitItems(p)
  if (!items.length) return ''
  return '<section class="kit-box" data-kit-panel="' + esc(p.id) + '" aria-labelledby="kit-h">' +
    '<div class="kit-head"><h2 id="kit-h">What’s inside <span lang="te">కిట్‌లో ఉన్నవి</span></h2>' +
    '<p class="kit-sub"><span data-kit-count>' + items.length + ' items</span><span class="kit-tip"> · Untick what you already have. Change sizes and amounts.</span></p></div>' +
    '<ul class="kit-list">' + items.map((k, i) => {
      const x = k.p, line = lineOf(x), m = skuMain(x) || lineMain(line), tp = typeOf(x)
      const sizes = line.length > 1
        ? '<select class="kit-size" data-kit-size aria-label="Size of ' + esc(x.name) + '">' + line.map((y) => '<option value="' + esc(y.id) + '"' + (y === x ? ' selected' : '') + (y.off ? ' disabled' : '') + '>' + esc(sizeText(y)) + (y.price ? ' · ' + esc(y.price) : '') + (y.off ? ' (out of stock)' : '') + '</option>').join('') + '</select>'
        : '<span class="kit-sz">' + esc([sizeText(x), x.price].filter(Boolean).join(' · ')) + '</span>'
      return '<li class="kit-row' + (x.off ? ' is-off' : '') + '" data-i="' + i + '">' +
        '<label class="kit-chk"><input type="checkbox" data-kit-on' + (x.off ? ' disabled' : ' checked') + ' aria-label="Include ' + esc(x.name) + '"></label>' +
        '<a class="kit-ph" href="' + skuUrl(x) + '" tabindex="-1" aria-hidden="true">' + (m ? '<img src="' + thumb(m) + '" alt="" width="48" height="48" loading="lazy" decoding="async">' : '<span class="li-noph">' + esc(x.name.slice(0, 2).toUpperCase()) + '</span>') + '</a>' +
        '<div class="kit-t"><a href="' + skuUrl(x) + '">' + esc(x.name) + '</a>' + te(x.te || tp.te, 'span', 'te') + (x.off ? '<span class="li-oos">Out of stock</span>' : '') + sizes + '</div>' +
        '<div class="stepper small" role="group" aria-label="Amount of ' + esc(x.name) + '"><button type="button" data-kit-step="-1" aria-label="Less">−</button><output>' + esc(kitAmt(x, k.a)) + '</output><button type="button" data-kit-step="1" aria-label="More">+</button></div></li>'
    }).join('') + '</ul>' +
    '<div class="kit-foot"><button type="button" class="link-btn" data-kit-reset>Reset to the full kit</button><span class="kit-state" data-kit-state aria-live="polite"></span></div></section>'
}
const buyAttr = (line, fixed) => 'data-buy="' + esc(JSON.stringify(lineCfg(line))) + '"' + (fixed ? ' data-fixed="' + esc(fixed) + '"' : '')
const addBtn = (label, off) => '<button class="add-btn" type="button" data-add aria-label="' + esc(label) + '"' + (off ? ' disabled' : '') + '>' + (off ? '<span>Out of stock</span>' : icon('plus') + '<span>Add</span>') + '</button>'
let selSeq = 0
/** Product card (one per product line): photo · brand · name · size menu · price · Add / − n +. */
function lineCard(line, { eager = false, showCat = false } = {}) {
  const p = firstIn(line), t = typeOf(p), c = categoryOf(t.category)
  const main = skuMain(p) || lineMain(line)
  const allOff = line.every((x) => x.off)
  const ph = main
    ? '<img src="' + thumb(main) + '" srcset="' + thumb(main) + ' 320w, ' + img(main) + ' 640w" sizes="(min-width:1280px) 230px, (min-width:768px) 30vw, 46vw" alt="' + esc(p.name) + '" width="320" height="320" ' + (eager ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" data-card-img>'
    : tileHtml(p)
  const words = [p.name, p.te || '', ...line.map((x) => x.size || ''), t.name, t.te, ...(t.aliases || []), ...line.flatMap((x) => x.aliases || []), p.brandName].join(' ')
  const id = 'vs' + (++selSeq)
  const sizes = line.length > 1
    ? '<label class="visually-hidden" for="' + id + '">Size of ' + esc(p.name) + '</label><select class="v-sel" id="' + id + '" data-vsel>' +
      line.map((x) => '<option value="' + esc(x.id) + '"' + (x === p ? ' selected' : '') + '>' + esc(sizeText(x)) + (x.price ? ' · ' + esc(x.price) : '') + (x.off ? ' (out of stock)' : '') + '</option>').join('') + '</select>'
    : ''
  return '<li class="pc' + (allOff ? ' is-off' : '') + '" data-filter-item="' + esc(words) + '" data-type="' + t.slug + '" data-brand="' + esc(p.brand || '') + '">' +
    '<a class="card" data-theme="' + theme(t.section) + '" href="' + skuUrl(p) + '">' +
    '<div class="ph">' + ph + tagPill(line) + (allOff ? '<span class="oos-pill">Out of stock</span>' : '') + '</div>' +
    '<div class="body">' + (showCat ? '<span class="cat">' + esc(c.name) + '</span>' : '') + brandK(p) +
    '<span class="en">' + esc(p.name) + '</span>' + te(p.te || t.te, 'span', 'te') + (line.length === 1 && sizeText(p) ? '<span class="size">' + esc(sizeText(p)) + '</span>' : '') + '</div></a>' +
    '<div class="buy" ' + buyAttr(line) + '>' + sizes + '<p class="b-price" data-price>' + esc(p.price || '') + '</p>' + addBtn('Add ' + p.name + ' to my list', p.off) + '</div></li>'
}
/** One size in the "Other sizes" row. */
function sizeCard(line, p) {
  const main = skuMain(p) || lineMain(line)
  return '<li class="pc vc' + (p.off ? ' is-off' : '') + '"><a class="card" href="' + skuUrl(p) + '"><div class="ph">' + (main ? '<img src="' + thumb(main) + '" alt="' + esc(p.name + ' ' + sizeText(p)) + '" width="320" height="320" loading="lazy" decoding="async">' : tileHtml(p)) + (p.off ? '<span class="oos-pill">Out of stock</span>' : '') + '</div>' +
    '<div class="body">' + brandK(p) + '<span class="vc-l">' + esc(sizeText(p)) + '</span><span class="te">' + esc(p.name) + '</span></div></a>' +
    '<div class="buy" ' + buyAttr(line, p.id) + '><p class="b-price">' + esc(p.price || '') + '</p>' + addBtn('Add ' + p.name + ' ' + sizeText(p) + ' to my list', p.off) + '</div></li>'
}
/** A type on a card: its single product line, or a "choose" card when it has several. */
function typeCard(t, opts = {}) {
  const ls = linesOf(t.slug)
  if (ls.length === 1) return lineCard(ls[0], opts)
  const c = categoryOf(t.category)
  const base = t.photo || t.slug
  const brandsOf = [...new Set(skusOf(t.slug).map((x) => x.brandName).filter(Boolean))]
  return '<li class="pc" data-filter-item="' + esc([t.name, t.te, ...(t.aliases || []), ...brandsOf].join(' ')) + '" data-type="' + t.slug + '">' +
    '<a class="card" data-theme="' + theme(t.section) + '" href="' + productUrl(t) + '">' +
    '<div class="ph"><img src="' + thumb(base) + '" alt="' + esc(t.name) + '" width="320" height="320" loading="lazy" decoding="async"></div>' +
    '<div class="body">' + (opts.showCat ? '<span class="cat">' + esc(c.name) + '</span>' : '') + '<span class="en">' + esc(t.name) + '</span>' + te(t.te, 'span', 'te') +
    '<span class="brands">' + ls.length + ' products' + (brandsOf.length ? ' · ' + esc(brandsOf.slice(0, 3).join(', ')) + (brandsOf.length > 3 ? ' …' : '') : '') + '</span></div></a>' +
    '<div class="buy"><a class="add-btn as-link" href="' + productUrl(t) + '">Choose ' + icon('arrow') + '</a></div></li>'
}
const brandChips = (ps) => {
  const bs = [...new Map(ps.filter((p) => p.brand).map((p) => [p.brand, p.brandName])).entries()]
  return bs.length > 1 ? '<div class="type-chips" data-brand-chips hidden role="group" aria-label="Brand">' +
    '<button type="button" class="tchip" data-brand-chip="" aria-pressed="true">All brands</button>' +
    bs.map(([id, name]) => '<button type="button" class="tchip' + (brandLogo(id) ? ' has-logo' : '') + '" data-brand-chip="' + esc(id) + '" aria-pressed="false">' + (brandLogo(id) ? '<img src="' + brandLogo(id) + '" alt="">' : '') + esc(name) + '</button>').join('') + '</div>' : ''
}

const sectionLabelShort = (slug) => (slug === 'puja-samagri' ? 'Puja Samagri' : 'Kirana')
const searchIndex = []
for (const t of products) {
  const c = categoryOf(t.category)
  const ls = linesOf(t.slug)
  const common = { c: c.name, ct: c.te, s: sectionLabelShort(t.section), sec: t.section, ...(sectionsOfType(t).length > 1 ? { secs: sectionsOfType(t) } : {}) }
  if (ls.length > 1) searchIndex.push({ k: 't', n: t.name, t: t.te, a: [...(t.aliases || [])], b: [...new Set(skusOf(t.slug).map((x) => x.brandName).filter(Boolean))], ...common, u: productUrl(t), i: thumb(t.photo || t.slug), cnt: ls.length })
  for (const line of ls) {
    const p = firstIn(line), main = lineMain(line)
    searchIndex.push({ n: p.name, z: line.length === 1 ? sizeText(p) : `${line.length} sizes`, t: p.te || t.te, a: [...new Set([...line.flatMap((x) => x.aliases || []), ...(t.aliases || []), ...(ls.length > 1 ? [typeShort(t)] : [])])], b: p.brandName ? [p.brandName] : [], ...(brandLogo(p.brand) ? { bl: brandLogo(p.brand) } : {}), de: String(p.desc || t.desc || '').slice(0, 220), ...common, u: skuUrl(p), i: main ? thumb(main) : '', o: lineCfg(line) })
  }
}

// Categories are searchable ("dal" → Pulses & Dals).
for (const c of categories) {
  const cover = c.products[0]
  searchIndex.push({ k: 'c', n: c.name, t: c.te, a: [], b: [], c: 'Category', ct: '', s: sectionLabelShort(c.section), sec: c.section, u: categoryUrl(c), i: thumb(cover.photo || cover.slug), cnt: c.products.length })
}
// Festivals are searchable too ("diwali", "sankranthi", "దసరా" …) and open the festival page.
for (const f of festivals) {
  const first = products.find((p) => p.slug === f.items[0])
  searchIndex.push({ f: 1, n: f.name, t: f.te, a: [...(f.aliases || []), 'festival', 'pandaga', 'పండుగ'], b: [], c: 'Festival', ct: 'పండుగ', s: 'Festivals', sec: 'festivals',
    u: `/festivals/${f.id}/`, i: first ? thumb(first.photo || first.slug) : '', col: f.colors, cnt: f.items.length })
}
const indexJson = JSON.stringify(searchIndex)
const SEARCH_INDEX = `/assets/search-index.${hash(indexJson)}.json`
await writeFile(join(dist, SEARCH_INDEX), indexJson)

// ───────────────────────── layout ─────────────────────────
const sitemap = []
const storeLd = {
  '@context': 'https://schema.org',
  '@type': 'GroceryStore',
  name: shop.fullName,
  alternateName: [shop.name, shop.fullNameTe],
  description: 'Local Kirana and Puja Samagri store on Main Road, near Sathya Show Room, Rajampet, Andhra Pradesh.',
  url: `${SITE}/`,
  logo: `${SITE}/brand/logo.jpg`,
  image: `${SITE}/brand/logo.jpg`,
  telephone: shop.phoneE164,
  email: shop.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: shop.address.street,
    addressLocality: shop.address.locality,
    addressRegion: shop.address.region,
    postalCode: shop.address.postalCode,
    addressCountry: shop.address.country,
  },
  hasMap: shop.mapsUrl,
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '06:00',
    closes: '22:00',
  }],
}
const crumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${url}` })),
})
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

const NAV = [
  ['home', '/', 'Home', 'హోమ్'],
  ['kirana', '/kirana/', 'Kirana', 'కిరాణా'],
  ['puja-samagri', '/puja-samagri/', 'Puja Samagri', 'పూజా సామగ్రి'],
  ['festivals', '/festivals/', 'Festivals', 'పండుగలు'],
  ['visit', '/visit/', 'Visit', 'సందర్శించండి'],
  ['about', '/about/', 'About', 'మా గురించి'],
  ['contact', '/contact/', 'Contact', 'సంప్రదించండి'],
]

function searchForm(id, value = '') {
  return `<form class="search-form" role="search" action="/search/" method="get">
    <label class="visually-hidden" for="${id}">Search products in English or Telugu</label>
    ${icon('search').replace('class="icon"', 'class="icon search-icon"')}
    <input id="${id}" name="q" type="search" value="${esc(value)}" placeholder="Search rice, kandi pappu, agarbatti, పసుపు…" autocomplete="off" enterkeyhint="search">
    <button class="mic-btn" type="button" data-voice hidden aria-label="Search by voice (Telugu or English)" title="Search by voice">${icon('mic')}</button>
    <button class="go-btn" type="submit" aria-label="Search">${icon('arrow')}</button>
  </form>`
}

function header(current) {
  const cur = (k) => (k === current ? ' aria-current="page"' : '')
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-row">
    <a class="brand" href="/" aria-label="${esc(shop.fullName)} — home">
      <img src="/brand/logo-mark.webp" alt="" width="48" height="48">
      <span class="brand-text"><span class="brand-name">Janardhan</span><span class="brand-sub">General Stores &amp; Puja Samagri</span></span>
    </a>
    <div class="header-search">${searchForm('q-desktop')}</div>
    <div class="header-actions">
      <a class="btn btn-light" href="${telHref}">${icon('phone')}<span>Call</span></a>
      <a class="btn btn-wa" href="${whatsappHref('Hello Janardhan General Stores, I have a question.')}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
    </div>
    <a class="list-btn" href="/list/"${current === 'list' ? ' aria-current="page"' : ''} aria-label="My list">${icon('clipboard')}<span class="lb-lbl">My list</span><span class="lb-n" data-list-count hidden>0</span></a>
    <details class="menu">
      <summary aria-label="Menu">${icon('menu')}</summary>
      <nav class="menu-panel" aria-label="Main menu">
        ${NAV.map(([k, href, en, t]) => `<a href="${href}"${cur(k)}><span>${en}</span>${te(t)}</a>`).join('')}
        <a href="/search/"${cur('search')}><span>Search</span>${te('వెతకండి')}</a>
        <a href="/list/"${cur('list')}><span>My list</span>${te('నా జాబితా')}</a>
        <hr>
        <a href="${telHref}"><span>Call ${esc(shop.phoneDisplay)}</span>${icon('phone')}</a>
        <a href="${whatsappHref('Hello Janardhan General Stores, I have a question.')}" target="_blank" rel="noopener"><span>WhatsApp</span>${icon('whatsapp')}</a>
      </nav>
    </details>
  </div>
  <div class="container search-mobile">${searchForm('q-mobile')}</div>
  <nav class="nav-bar" aria-label="Main">
    <div class="container" style="display:flex;align-items:center">
      <ul>
        ${NAV.map(([k, href, en]) => {
          const dot = k === 'kirana' ? '<span class="dot" style="background:var(--forest)"></span>' : k === 'puja-samagri' ? '<span class="dot" style="background:var(--terracotta)"></span>' : ''
          return `<li><a href="${href}"${cur(k)}>${dot}${en}</a></li>`
        }).join('')}
      </ul>
      <span class="hours">${icon('clock')}<span>${esc(shop.hours.label)}</span><span class="open-badge" data-open-badge hidden></span></span>
    </div>
  </nav>
</header>`
}

function footer() {
  return `<footer class="site-footer on-dark">
  <div class="container footer-grid">
    <div>
      <div class="foot-brand">
        <img src="/brand/logo-mark.webp" alt="${esc(shop.fullName)} logo" width="64" height="64" loading="lazy">
        <div class="brand-text"><span class="brand-name">Janardhan</span><span class="brand-sub">General Stores &amp; Puja Samagri</span>${te(shop.fullNameTe, 'span', 'brand-te')}</div>
      </div>
      <address>${shop.address.lines.map(esc).join('<br>')}</address>
      <p lang="te" style="margin-top:6px;color:#b7c3b9">${shop.address.linesTe.map(esc).join(', ')}</p>
    </div>
    <div>
      <h2>Browse</h2>
      <ul>
        <li><a href="/kirana/">Kirana · ${te('కిరాణా')}</a></li>
        <li><a href="/puja-samagri/">Puja Samagri · ${te('పూజా సామగ్రి')}</a></li>
        <li><a href="/festivals/">Festivals · ${te('పండుగలు')}</a></li>
        <li><a href="/search/">Search the catalogue</a></li>
        <li><a href="/list/">My list · ${te('నా జాబితా')}</a></li>
      </ul>
    </div>
    <div>
      <h2>The shop</h2>
      <ul>
        <li><a href="/visit/">Visit &amp; directions</a></li>
        <li><a href="/about/">About Janardhan General Stores</a></li>
        <li><a href="/contact/">Contact</a></li>
        <li><a href="/about/#qr-poster">Shop QR code</a></li>
        <li><a href="/about/#app" data-app-link>Get the app</a></li>
      </ul>
    </div>
    <div>
      <h2>Open</h2>
      <p>${esc(shop.hours.label)}</p>
      <p lang="te" style="color:#b7c3b9">${esc(shop.hours.labelTe)}</p>
      <p style="margin-top:6px"><span class="open-badge" data-open-badge hidden></span></p>
      <ul style="margin-top:8px">
        <li><a href="${telHref}">${icon('phone')}&nbsp; ${esc(shop.phoneDisplay)}</a></li>
        <li><a href="${mailHref}">${icon('mail')}&nbsp; ${esc(shop.email)}</a></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>This website is an information catalogue only. Items shown are representative of what a Kirana and Puja Samagri store carries — availability, brands, pack sizes and (unless stated) prices are confirmed at the shop. No online orders or payments.</p>
    <p>© ${YEAR} ${shop.name}, Rajampet · <a href="/credits/">Image credits</a></p>
  </div>
</footer>`
}

async function page(path, { title, description, current = '', themeName = 'kirana', body, jsonld = [], scripts = [], ogImage, noindex = false, file }) {
  const url = `${SITE}${path}`
  const og = ogImage ? `${SITE}${ogImage}` : `${SITE}/brand/logo.jpg`
  const html = `<!doctype html>
<html lang="en" data-open="${shop.hours.open}" data-close="${shop.hours.close}" data-search-index="${SEARCH_INDEX}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#3a1512">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Janardhan">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="preload" href="/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${CSS}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Janardhan General Stores">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:locale" content="en_IN">
<meta property="og:locale:alternate" content="te_IN">
<meta name="twitter:card" content="summary_large_image">
${jsonld.map(ld).join('\n')}
<script src="${SITE_JS}" defer></script>
<script src="${SEARCH_JS}" defer></script>
<script src="${LIST_JS}" defer></script>
${scripts.filter((s) => s !== SEARCH_JS).map((s) => `<script src="${s}" defer></script>`).join('\n')}
</head>
<body data-theme="${themeName}">
${header(current)}
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
</body>
</html>
`
  const out = file ? join(dist, file) : join(dist, path, 'index.html')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, html)
  if (!noindex) sitemap.push(path)
}

function gallery(name, photos, it) {
  if (!photos.length) return '<div class="ph">' + tileHtml(it, true) + '</div>'
  if (photos.length === 1) {
    return '<div class="ph"><img src="' + img(photos[0]) + '" alt="' + esc(name) + '" width="640" height="640" fetchpriority="high" decoding="async"></div>'
  }
  const n = photos.length
  return '<div class="gallery" data-gallery>' +
    '<div class="g-track ph" tabindex="0" role="region" aria-roledescription="carousel" aria-label="' + esc(name) + ' photos (' + n + '). Swipe or use the arrow keys.">' +
    photos.map((ph, i) => '<figure class="g-slide" id="g-' + (i + 1) + '" aria-label="Photo ' + (i + 1) + ' of ' + n + '"><img src="' + img(ph) + '" alt="' + esc(name) + (i ? ' – photo ' + (i + 1) : '') + '" width="640" height="640" ' + (i ? 'loading="lazy"' : 'fetchpriority="high"') + ' decoding="async"></figure>').join('') +
    '</div><span class="g-count" data-g-count aria-hidden="true">1 / ' + n + '</span>' +
    '<button class="g-nav g-prev" type="button" data-g-prev aria-label="Previous photo" hidden>' + icon('arrow') + '</button>' +
    '<button class="g-nav g-next" type="button" data-g-next aria-label="Next photo" hidden>' + icon('arrow') + '</button>' +
    '<div class="g-thumbs" role="group" aria-label="Choose a photo">' +
    photos.map((ph, i) => '<a class="g-thumb" href="#g-' + (i + 1) + '" data-g-thumb="' + i + '"' + (i ? '' : ' aria-current="true"') + ' aria-label="Show photo ' + (i + 1) + ' of ' + n + '"><img src="' + thumb(ph) + '" alt="" width="80" height="80" loading="lazy" decoding="async"></a>').join('') +
    '</div></div>'
}

// ───────────────────────── components ─────────────────────────
const productCard = typeCard

function catTile(c, eager = false) {
  const cover = c.products[0]
  return `<li><a class="cat-tile" href="${categoryUrl(c)}">
    <div class="ph"><img src="${thumb(cover.slug)}" alt="" width="320" height="320" ${eager ? '' : 'loading="lazy" '}decoding="async"></div>
    <div class="label"><span class="en">${esc(c.name)}</span>${te(c.te, 'span', 'te')}</div>
  </a></li>`
}

function crumbs(items, onLight = false) {
  return `<nav class="crumbs${onLight ? ' on-light' : ''}" aria-label="Breadcrumb"><ol>${items.map(([name, url], i) =>
    i === items.length - 1 ? `<li><span aria-current="page">${esc(name)}</span></li>` : `<li><a href="${url}">${esc(name)}</a></li>`).join('')}</ol></nav>`
}

const visitBand = () => `<section class="container section" aria-labelledby="visit-h">
  <div class="visit-band on-dark"><div class="inner">
    <div>
      <p class="kicker" style="color:#f0d79e">Visit the shop</p>
      <h2 id="visit-h">Come see us on Main Road, Rajampet</h2>
      <address>${shop.address.lines.map(esc).join(', ')}</address>
      ${te(shop.address.linesTe.join(', '), 'p', 'te')}
      <p class="hours-line">${icon('clock')}<span>${esc(shop.hours.label)}</span><span class="open-badge" data-open-badge hidden></span></p>
    </div>
    <div class="actions">
      <a class="btn btn-gold" href="${shop.mapsUrl}" target="_blank" rel="noopener">${icon('directions')}Get directions</a>
      <a class="btn btn-on-dark" href="${telHref}">${icon('phone')}Call ${esc(shop.phoneDisplay)}</a>
      <a class="btn btn-on-dark" href="${whatsappHref('Hello Janardhan General Stores, I have a question.')}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>
    </div>
  </div></div>
</section>`

const askStrip = (msg) => `<section class="container section" aria-labelledby="ask-h">
  <div class="ask" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between">
    <div><h2 id="ask-h">Looking for something not listed?</h2><p>Many more everyday items are kept at the shop. Ask us before you come.</p>${te('ఇక్కడ లేని వస్తువు కావాలా? దయచేసి అడగండి.', 'p')}</div>
    <div class="actions" style="margin:0">
      <a class="btn btn-wa" href="${whatsappHref(msg)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask on WhatsApp</a>
      <a class="btn btn-light" href="${telHref}">${icon('phone')}Call</a>
    </div>
  </div>
</section>`

// ───────────────────────── festival recommendations ─────────────────────────
// Home page: every upcoming festival is pre-rendered (hidden) and site.js shows the one that matches today (IST).
// Festival pages (/festivals/<id>/): the same block, showing the festival's next date.
const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const fmtDay = (iso, year = false) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
const festivalUrl = (f) => `/festivals/${f.id}/`
const festItems = (f) => f.items.map((slug) => {
  const p = products.find((x) => x.slug === slug)
  if (!p && !allTypeSlugs.has(slug)) throw new Error(`Festival ${f.id} uses unknown product ${slug}`)
  return p
}).filter(Boolean)
function festDateLine(f, days, year = false) {
  const start = days[0][0], end = days[days.length - 1][0]
  if (f.season || days.length > 3) return `${fmtDay(start, year)} – ${fmtDay(end, year)}`
  return days.map(([d, en]) => (days.length > 1 ? `${en} ${fmtDay(d, year)}` : fmtDay(d, year))).join(' · ')
}
const upcomingOccs = (f) => f.dates.filter((days) => days[days.length - 1][0] >= todayIST)
for (const f of festivals) for (const days of f.dates) for (const [d] of days) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Festival ${f.id}: bad date ${d}`)

// Banner design chosen in the editor: pattern, decoration symbol, background photo (+ darkness), texts.
const PATTERNS = new Set(['dots', 'sparkle', 'waves', 'rangoli', 'none'])
const festImage = (f) => (existsSync(join(root, 'public', 'img', 'festivals', `${f.id}.webp`)) ? versioned(`/img/festivals/${f.id}.webp`) : '')
function festStyle(f) {
  const b = f.banner || {}
  const image = festImage(f)
  const dim = Math.min(80, Math.max(0, Number.isFinite(b.dim) ? b.dim : 45)) / 100
  const style = `--fa:${f.colors[0]};--fb:${f.colors[1]}${image ? `;--fimg:url('${image}');--fdim:${dim}` : ''}`
  const cls = `pat-${PATTERNS.has(b.pattern) ? b.pattern : 'dots'}${image ? ' has-img' : ''}`
  return { style, cls }
}
const festDecor = (f) => (f.banner?.decor ? `<span class="fest-decor" aria-hidden="true">${esc(f.banner.decor)}</span>` : '')

/** One festival block. `days` = one occurrence (or null for the "dates coming soon" fallback). */
function festBlock(f, days, { id, hidden = true, onPage = false } = {}) {
  const items = festItems(f)
  const b = f.banner || {}
  const look = festStyle(f)
  let attrs = ''
  let dateText = ''
  if (days) {
    const start = days[0][0], end = days[days.length - 1][0]
    const named = f.season ? days.slice(1, -1) : days
    const daysAttr = JSON.stringify(named.map(([d, en, tel, title]) => ({ d, en, te: tel, ...(title ? { title } : {}) })))
    attrs = ` data-fest data-from="${addDays(start, -f.lead)}" data-start="${start}" data-end="${end}"${f.season ? ' data-season' : ''} data-days="${esc(daysAttr)}"`
    dateText = `${esc(f.name)} · ${esc(festDateLine(f, days, onPage))}`
  } else {
    attrs = ' data-fest-fallback'
    dateText = `${esc(f.name)} · dates for the next ${f.season ? 'season' : 'festival'} will be added soon`
  }
  return `<section class="fest ${look.cls}${onPage ? ' fest-page' : ''}" id="${id}" aria-label="${esc(f.name)}"${attrs} style="${look.style}"${hidden ? ' hidden' : ''}>
  ${festDecor(f)}
  <div class="container fest-inner">
    <div class="fest-copy">
      <p class="fest-kicker"><span class="fest-pill" data-fest-when>${days ? 'Coming up' : 'Festival'}</span><span class="fest-date">${dateText}</span></p>
      <div data-phase="before"><h2>${esc(f.before.title)}</h2>${te(f.before.titleTe, 'p', 'te fest-te')}<p class="fest-text">${esc(f.before.text)}</p></div>
      <div data-phase="day" hidden><h2 data-fest-title>${esc(f.day.title)}</h2>${te(f.day.titleTe, 'p', 'te fest-te')}<p class="fest-text">${esc(f.day.text)}</p></div>
      <div class="fest-actions">
        <a class="btn btn-gold" href="${whatsappHref(`Hello Janardhan General Stores, I need items for ${f.name}: `)}" target="_blank" rel="noopener">${icon('whatsapp')}${esc(b.waText || `Send your ${f.name} list`)}</a>
        ${b.hideCall ? '' : `<a class="btn btn-on-dark" href="${telHref}">${icon('phone')}Call</a>`}
      </div>
    </div>
    <div class="fest-items">
      <p class="fest-items-h">${esc(b.itemsTitle || (f.season ? 'For the month' : `Get these for ${f.name}`))} <span>· ${items.length} items</span>${onPage ? '' : ` <a class="fest-all" href="${festivalUrl(f)}">See all ${icon('arrow')}</a>`}</p>
      <ul class="product-grid fest-rail">${items.map((p) => productCard(p)).join('')}</ul>
    </div>
  </div>
</section>`
}

function festivalSections() {
  let lastEnd = ''
  const out = []
  for (const f of festivals) {
    f.dates.forEach((days, i) => {
      const end = days[days.length - 1][0]
      if (end > lastEnd) lastEnd = end
      if (end < todayIST) return // already over
      out.push(festBlock(f, days, { id: `fest-${f.id}-${i}` }))
    })
  }
  const daysLeft = (Date.parse(lastEnd) - Date.parse(todayIST)) / 864e5
  if (daysLeft < 120) console.warn(`⚠ Festival dates run out on ${lastEnd} (${Math.round(daysLeft)} days). Add next year's dates in the editor (Festivals tab).`)
  return out.join('\n')
}

// ───────────────────────── pages ─────────────────────────
function rowHtml(id, title, teTitle, cards, more = '') {
  return cards.length ? '<section class="container section rail-sec" aria-labelledby="' + id + '"><div class="section-head"><h2 id="' + id + '">' + title + (teTitle ? ' ' + te(teTitle) : '') + '</h2>' + more + '</div><ul class="rail">' + cards.join('') + '</ul></section>' : ''
}
const allLines = () => products.flatMap((t) => linesOf(t.slug))
const starLines = allLines().filter((l) => l.some((x) => x.star))
const kitLines = allLines().filter((l) => kitItems(firstIn(l)).length)
const kitsRow = (more = true) => rowHtml('kits-h', 'Ready puja kits', 'పూజా కిట్లు', kitLines.map((l) => lineCard(l)),
  more ? '<a class="link-arrow" href="' + categoryUrl(categoryOf(typeOf(firstIn(kitLines[0] || [skus[0]])).category)) + '">All kits ' + icon('arrow') + '</a>' : '')
const sortBox = '<label class="sort-box" data-sort-wrap hidden><span>Sort</span><select data-sort aria-label="Sort items"><option value="">Shop order</option><option value="name">Name A–Z</option><option value="price">Price: low to high</option><option value="price-d">Price: high to low</option></select></label>'

// Home
{
  const collage = ['clay-diyas', 'toor-dal', 'kumkum', 'bath-soap', 'cashew-nuts', 'neyyi-deepam']
  for (const s of collage) if (!slugs.has(s)) throw new Error(`Home collage uses unknown product ${s}`)
  const panels = sections.map((s) => {
    const cats = categoriesOf(s.slug)
    const n = products.filter((p) => p.section === s.slug).length
    return `<div class="panel" data-theme="${s.theme}">
      <div class="section-head">
        <div><p class="kicker">${esc(s.name)} · ${te(s.te)}</p><h2 id="h-${s.slug}">${esc(s.title)}</h2><p>${esc(s.blurb)}</p></div>
        <a class="link-arrow" href="${sectionUrl(s.slug)}">All ${n} ${esc(s.name)} items ${icon('arrow')}</a>
      </div>
      <ul class="cat-grid" aria-labelledby="h-${s.slug}">${cats.map((c, i) => catTile(c, s.slug === 'kirana' && i < 6)).join('')}</ul>
    </div>`
  }).join('')

  await page('/', {
    title: 'Janardhan General Stores and Puja Samagri, Rajampet | జనార్దన్ జనరల్ స్టోర్స్',
    description: 'Browse everyday Kirana groceries and Puja Samagri at Janardhan General Stores, Main Road, Rajampet. Open every day 6 AM – 10 PM. Call or WhatsApp 97050 06062.',
    current: 'home',
    jsonld: [storeLd],
    body: `${festivalSections()}
<section class="hero on-dark" aria-labelledby="hero-h">
  <div class="container hero-inner">
    <div>
      <p class="eyebrow"><span>${esc(shop.fullName)}</span><span class="sep"></span><span>${icon('pin')} Main Road, Rajampet</span><span class="sep"></span><span class="hide-sm">Open every day · 6 AM – 10 PM</span><span class="open-badge" data-open-badge hidden></span></p>
      <h1 id="hero-h">Kirana &amp; <em>Puja Samagri</em>, right in your neighbourhood.</h1>
      ${te('మీ ఇంటి దగ్గరే కిరాణా సరుకులు & పూజా సామగ్రి — ఒకే చోట.', 'p', 'te-line')}
      <p class="lede">Browse the kinds of everyday groceries and puja items we keep, then call, WhatsApp or drop in at the shop.</p>
      <div class="hero-actions">
        <a class="btn btn-gold" href="${shop.mapsUrl}" target="_blank" rel="noopener">${icon('directions')}Directions</a>
        <a class="btn btn-on-dark" href="${whatsappHref('Hello Janardhan General Stores, I have a question.')}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>
        <a class="btn btn-on-dark" href="${telHref}">${icon('phone')}Call</a>
      </div>
    </div>
    <div class="hero-collage" aria-hidden="true">${collage.map((s) => `<img src="${thumb(s)}" alt="" width="320" height="320">`).join('')}</div>
  </div>
</section>
${rowHtml('star-h', 'Popular at the shop', 'ఎక్కువగా కొనేవి', starLines.map((l) => lineCard(l)))}
<section class="container section" aria-label="Shop by category" style="padding-top:18px">${panels}</section>
${kitsRow()}
${(() => {
  const withLogo = [...new Map(skus.filter((p) => p.brand && brandLogo(p.brand) && products.some((t) => t.slug === p.type)).map((p) => [p.brand, p.brandName])).entries()]
  return withLogo.length ? '<section class="container section brand-row" aria-labelledby="brands-h"><div class="section-head"><h2 id="brands-h">Brands at the shop ' + te('బ్రాండ్లు') + '</h2></div><ul class="logo-strip">' +
    withLogo.map(([id, name]) => '<li><a href="/search/?q=' + encodeURIComponent(name) + '" title="' + esc(name) + '"><img src="' + brandLogo(id) + '" alt="' + esc(name) + '" loading="lazy" decoding="async"></a></li>').join('') + '</ul></section>' : ''
})()}
<section class="container section" aria-labelledby="how-h" style="padding-top:0">
  <div class="section-head"><div><p class="kicker">How it works</p><h2 id="how-h">Browse here. Buy at the shop.</h2></div></div>
  <ol class="how">
    <li><span class="num">1</span><div><h3>Browse the catalogue</h3><p>See the kinds of Kirana and Puja items we keep, in English and ${te('తెలుగు')}.</p></div></li>
    <li><span class="num">2</span><div><h3>Ask before you come</h3><p>Call or WhatsApp to check an item, brand or pack size.</p></div></li>
    <li><span class="num">3</span><div><h3>Visit Janardhan General Stores</h3><p>Main Road, near Sathya Show Room, Rajampet — open every day.</p></div></li>
  </ol>
</section>
${visitBand()}`,
  })
}

// Section pages
for (const s of sections) {
  const cats = categoriesOf(s.slug)
  const n = products.filter((p) => p.section === s.slug).length
  const other = sections.find((x) => x.slug !== s.slug)
  await page(sectionUrl(s.slug), {
    title: `${s.title} — ${n} items | Janardhan General Stores Rajampet`,
    description: `${s.blurb} Browse ${cats.length} ${s.name} categories at Janardhan General Stores, Rajampet.`,
    current: s.slug,
    themeName: s.theme,
    jsonld: [crumbLd([['Home', '/'], [s.name, sectionUrl(s.slug)]])],
    ogImage: img(cats[0].products[0].slug),
    body: `<section class="page-hero" data-theme="${s.theme}">
  <div class="container">
    ${crumbs([['Home', '/'], [s.name, sectionUrl(s.slug)]])}
    <h1>${esc(s.title)}</h1>${te(s.te, 'p', 'te')}
    <p class="sub">${esc(s.blurb)} ${n} representative items in ${cats.length} categories.</p>
  </div>
</section>
<section class="container section" aria-label="${esc(s.name)} categories">
  <ul class="overview">${cats.map((c) => `<li><a class="ov-card" href="${categoryUrl(c)}">
    <div class="thumbs" aria-hidden="true">${c.products.slice(0, 4).map((p) => `<img src="${thumb(p.photo || p.slug)}" alt="" width="160" height="160" loading="lazy" decoding="async">`).join('')}</div>
    <div><h2>${esc(c.name)}</h2>${te(c.te, 'p', 'te')}<p class="meta">${c.products.length} items · ${esc(c.products.slice(0, 3).map((p) => p.name.replace(/ \(.*\)/, '')).join(', '))}…</p><span class="go">View items ${icon('arrow')}</span></div>
  </a></li>`).join('')}</ul>
  ${s.slug === 'puja-samagri' && kitLines.length ? '</section>' + kitsRow() + '<section class="container section" style="padding-top:0">' : ''}
  <p style="margin-top:24px"><a class="link-arrow" href="${sectionUrl(other.slug)}" style="color:${other.slug === 'kirana' ? 'var(--forest)' : 'var(--maroon)'}">Also browse ${esc(other.title)} · ${te(other.te)} ${icon('arrow')}</a></p>
</section>
${askStrip(`Hello Janardhan General Stores, I am looking for a ${s.name} item.`)}`,
  })
}

// Category pages
for (const c0 of categories) {
  const c = { ...c0, products: [...c0.products.map((p) => ({ ...p, category: c0.slug, section: c0.section })), ...extrasOf(c0.slug)] }
  const s = sectionOf(c.section)
  const siblings = categoriesOf(c.section)
  await page(categoryUrl(c), {
    title: `${c.name} (${c.te}) — ${s.name} | Janardhan General Stores Rajampet`,
    description: `${c.blurb} ${c.products.slice(0, 5).map((p) => p.name).join(', ')} and more — representative ${s.name} items at Janardhan General Stores, Rajampet.`,
    current: c.section,
    themeName: s.theme,
    ogImage: img(c.products[0].slug),
    jsonld: [crumbLd([['Home', '/'], [s.name, sectionUrl(s.slug)], [c.name, categoryUrl(c)]])],
    body: `<section class="page-hero" data-theme="${s.theme}">
  <div class="container">
    ${crumbs([['Home', '/'], [s.name, sectionUrl(s.slug)], [c.name, categoryUrl(c)]])}
    <h1>${esc(c.name)}</h1>${te(c.te, 'p', 'te')}
    <p class="sub">${esc(c.blurb)}</p>
  </div>
</section>
<nav class="container chip-row" aria-label="${esc(s.name)} categories">
  <details class="cat-switch">
    <summary>Browse other ${esc(s.name)} categories <span class="n">(${siblings.length})</span></summary>
    <ul class="chips">${siblings.map((x) => `<li><a class="chip" href="${categoryUrl(x)}"${x.slug === c.slug ? ' aria-current="page"' : ''}>${esc(x.name)} <span class="n">${x.products.length + extrasOf(x.slug).length}</span></a></li>`).join('')}</ul>
  </details>
  <ul class="chips chips-wide">${siblings.map((x) => `<li><a class="chip" href="${categoryUrl(x)}"${x.slug === c.slug ? ' aria-current="page"' : ''}>${esc(x.name)} <span class="n">${x.products.length + extrasOf(x.slug).length}</span></a></li>`).join('')}</ul>
</nav>
<section class="container section" aria-label="${esc(c.name)} items" style="padding-top:20px">
  <div class="filter">
    <form hidden class="search-form" role="search" style="max-width:380px">
      <label class="visually-hidden" for="filter">Filter ${esc(c.name)}</label>
      ${icon('search').replace('class="icon"', 'class="icon search-icon"')}
      <input id="filter" type="search" data-filter placeholder="Filter in ${esc(c.name)}…" autocomplete="off" style="padding-right:18px">
    </form>
    <p class="count" data-filter-count aria-live="polite">${c.products.reduce((a, p) => a + linesOf(p.slug).length, 0)} items</p>
    ${sortBox}
  </div>
  ${c.products.length > 1 ? `<div class="type-chips" data-type-chips hidden role="group" aria-label="Type">
    <button type="button" class="tchip" data-type-chip="" aria-pressed="true">All</button>${c.products.map((p) => `<button type="button" class="tchip" data-type-chip="${p.slug}" aria-pressed="false">${esc(typeShort(p))}${linesOf(p.slug).length > 1 ? ` <span class="n">${linesOf(p.slug).length}</span>` : ''}</button>`).join('')}
  </div>` : ''}
  ${brandChips(c.products.flatMap((p) => skusOf(p.slug)))}
  <ul class="product-grid">${(() => { let k = 0; return c.products.map((p) => linesOf(p.slug).map((l) => lineCard(l, { eager: k++ < 2 })).join('')).join('') })()}</ul>
  <div class="empty" data-filter-empty hidden><p>No items match that filter here.</p><p><a href="/search/">Search the whole catalogue</a></p></div>
</section>
${askStrip(`Hello Janardhan General Stores, I am looking for an item in ${c.name}.`)}`,
  })
}

// Type pages (several products) and product pages
const rail = (id, title, teTitle, cards, more = '') => cards.length ? '<section class="container section rail-sec" aria-labelledby="' + id + '"><div class="section-head"><h2 id="' + id + '">' + title + (teTitle ? ' ' + te(teTitle) : '') + '</h2>' + more + '</div><ul class="rail">' + cards.join('') + '</ul></section>' : ''
const askBlock = (name, caution) => '<div class="ask"><h2>Need help?</h2><p>Ask the shop about this item, then pick it up in person.</p>' +
  '<div class="actions"><a class="btn btn-wa" href="' + whatsappHref('Hello Janardhan General Stores, is ' + name + ' available at the shop?') + '" target="_blank" rel="noopener">' + icon('whatsapp') + 'Ask on WhatsApp</a>' +
  '<a class="btn btn-light" href="' + telHref + '">' + icon('phone') + 'Call ' + esc(shop.phoneDisplay) + '</a>' +
  '<a class="btn btn-light" href="' + shop.mapsUrl + '" target="_blank" rel="noopener">' + icon('directions') + 'Directions</a></div>' + (caution || '') +
  '<p class="note">' + icon('info') + '<span>Photos are representative. Stock and prices are confirmed by the shop on WhatsApp.</span></p></div>'
const festFor = (t) => {
  const fs = festivals.filter((f) => f.items.includes(t.slug) || (t.photo && f.items.includes(t.photo)))
  return fs.length ? '<div class="aka fest-for"><h2>Suggested for</h2><ul>' + fs.map((f) => '<li><a href="' + festivalUrl(f) + '" style="--fa:' + f.colors[0] + '">' + esc(f.name) + ' ' + icon('arrow') + '</a></li>').join('') + '</ul></div>' : ''
}
const cautionHtml = (t) => (t.caution ? '<div class="caution" role="note"><strong>' + icon('info') + 'Please note</strong><p>' + esc(t.caution) + '</p><p lang="te" class="te">' + esc(t.cautionTe || '') + '</p></div>' : '')
const moreInCategory = (t, c) => rail('more-h', 'More in ' + esc(c.name), c.te, c.products.filter((x) => x.slug !== t.slug).slice(0, 12).map((x) => typeCard({ ...x, section: c.section, category: c.slug })),
  '<a class="link-arrow" href="' + categoryUrl(c) + '">View all ' + icon('arrow') + '</a>')

for (const t of products) {
  const c = categoryOf(t.category)
  const s = sectionOf(t.section)
  const ps = skusOf(t.slug)
  const base = [['Home', '/'], [s.name, sectionUrl(s.slug)], [c.name, categoryUrl(c)]]
  if (linesOf(t.slug).length > 1) {
    // Type page: every product of this type (all brands, all sizes)
    const brandNames = [...new Set(ps.map((p) => p.brandName).filter(Boolean))]
    await page(productUrl(t), {
      title: t.name + ' – ' + t.te + ' | ' + ps.length + ' products | Janardhan General Stores Rajampet',
      description: t.desc + (brandNames.length ? ' Brands at the shop: ' + brandNames.join(', ') + '.' : ''),
      current: t.section,
      themeName: s.theme,
      ogImage: img(t.photo || t.slug),
      jsonld: [crumbLd([...base, [t.name, productUrl(t)]])],
      body: '<div class="container"><div style="padding-top:14px">' + crumbs([...base, [typeShort(t), productUrl(t)]], true) + '</div>' +
        '<header class="type-head"><div class="th-ph"><img src="' + thumb(t.photo || t.slug) + '" alt="" width="160" height="160"></div><div>' +
        '<a class="chip" href="' + categoryUrl(c) + '">' + esc(c.name) + ' · ' + te(c.te) + '</a><h1>' + esc(t.name) + '</h1>' + te(t.te, 'p', 'te-name') +
        '<p class="desc">' + esc(t.desc) + '</p>' + (t.price ? '<p class="price-tag"><span class="lbl">Price at the shop</span><strong>' + esc(t.price) + '</strong>' + te(t.priceTe || '', 'span', 'te') + '</p>' : '') +
        '<p class="th-meta">' + ps.length + ' products' + (brandNames.length ? ' · ' + brandNames.length + ' brand' + (brandNames.length > 1 ? 's' : '') : '') + '</p></div></header>' +
        '' +
        '<div class="filter"><p class="count" data-filter-count aria-live="polite">' + linesOf(t.slug).length + ' items</p>' + sortBox + '</div>' + brandChips(ps) +
        '<ul class="product-grid">' + linesOf(t.slug).map((l, i) => lineCard(l, { eager: i < 2 })).join('') + '</ul>' +
        '<div class="empty" data-filter-empty hidden><p>No products match.</p></div>' +
        '<div class="type-extra">' + festFor(t) + cautionHtml(t) + '</div></div>' + moreInCategory(t, c),
    })
  }
  for (const p of ps) {
    const url = skuUrl(p)
    const photos = skuPhotos(p)
    const line = lineOf(p)
    const otherSizes = line.filter((x) => x !== p)
    const otherBrands = linesOf(t.slug).filter((l) => !l.includes(p))
    const sameBrandElsewhere = p.brand ? products.filter((x) => x.slug !== p.type).flatMap((x) => linesOf(x.slug)).filter((l) => l[0].brand === p.brand).slice(0, 12) : []
    const many = linesOf(t.slug).length > 1
    const trail = [...base, ...(many ? [[typeShort(t), productUrl(t)]] : []), [p.name + (p.size ? ' · ' + p.size : ''), url]]
    const size = sizeText(p)
    await page(url, {
      title: p.name + (p.size ? ' ' + p.size : '') + ' – ' + (p.te || t.te) + ' | ' + c.name + ' | Janardhan General Stores Rajampet',
      description: (p.desc || t.desc) + ' At Janardhan General Stores, Rajampet.',
      current: t.section,
      themeName: s.theme,
      ogImage: photos[0] ? img(photos[0]) : img(t.photo || t.slug),
      jsonld: [crumbLd(trail)],
      body: '<div class="container"><div style="padding-top:14px">' + crumbs(trail, true) + '</div>' +
        '<article class="pdp"><div class="pdp-media">' + gallery(p.name, photos, p) + '</div><div class="pdp-info">' +
        '<a class="chip" href="' + (many ? productUrl(t) : categoryUrl(c)) + '">' + esc(many ? typeShort(t) : c.name) + ' · ' + te(many ? t.te : c.te) + '</a>' +
        (p.brandName || lineTag(line) ? '<p class="brand-k big' + (brandLogo(p.brand) ? ' has-logo' : '') + '">' + (brandLogo(p.brand) ? '<img class="bk-logo" src="' + brandLogo(p.brand) + '" alt="">' : '') + '<span>' + esc(p.brandName) + '</span>' + (lineTag(line) ? ' <span class="tag-pill inline">' + esc(lineTag(line)) + '</span>' : '') + '</p>' : '') +
        '<h1>' + esc(p.name) + '</h1>' + te(p.te || t.te, 'p', 'te-name') +
        '<div class="buy-box buy' + (p.off ? ' is-off' : '') + '" ' + buyAttr(line, p.id) + ' data-big>' +
        (line.length > 1
          ? '<p class="bb-h">Size <span lang="te">సైజు</span></p><div class="v-chips" role="list">' + line.map((x) => (x === p
            ? '<span class="v-chip" role="listitem" aria-current="true"><span>' + esc(sizeText(x)) + '</span>' + (x.price ? '<small>' + esc(x.price) + '</small>' : '') + '</span>'
            : '<a class="v-chip' + (x.off ? ' is-off' : '') + '" role="listitem" href="' + skuUrl(x) + '"><span>' + esc(sizeText(x)) + '</span>' + (x.price ? '<small>' + esc(x.price) + '</small>' : '') + '</a>')).join('') + '</div>'
          : size ? '<p class="bb-h">Size <span lang="te">సైజు</span></p><p class="bb-size">' + esc(size) + '</p>' : '') +
        '<p class="bb-price" data-price>' + esc(p.price || '') + '</p>' +
        (!p.price && t.price ? '<p class="price-tag"><span class="lbl">Price at the shop</span><strong>' + esc(t.price) + '</strong></p>' : '') +
        (p.off ? '<button class="btn btn-add-big oos" type="button" data-add disabled><span>Out of stock</span></button>' : '<button class="btn btn-primary btn-add-big" type="button" data-add>' + icon('plus') + '<span>' + (kitItems(p).length ? 'Add kit to my list' : 'Add to my list') + '</span><small lang="te">' + (kitItems(p).length ? 'కిట్ జాబితాలో చేర్చండి' : 'జాబితాలో చేర్చండి') + '</small></button>') +
        '<p class="bb-help">' + (kitItems(p).length ? 'Adds every ticked item below to your list, grouped under this kit. ' : 'Add what you need, then send the list to the shop on WhatsApp. ') + '<span lang="te">జాబితా వాట్సాప్‌లో పంపండి.</span></p></div>' + kitPanel(p) +
        '<p class="desc">' + esc(p.desc || t.desc) + '</p>' +
        festFor(t) + askBlock(p.name + (p.size ? ' ' + p.size : ''), cautionHtml(t)) +
        '</div></article></div>' +
        // phones: Add bar that stays at the bottom once the main Add button is scrolled away
        '<div class="sticky-buy buy' + (p.off ? ' is-off' : '') + '" ' + buyAttr(line, p.id) + ' data-sticky aria-hidden="true" inert><div class="sb-t"><strong>' + esc(p.name) + '</strong><span>' + esc(size) + (p.price ? ' · ' + esc(p.price) : '') + '</span></div>' + addBtn('Add ' + p.name + ' ' + size + ' to my list', p.off) + '</div>' +
        rail('sizes-h', 'Other sizes of ' + esc(p.name), 'ఇతర సైజులు', otherSizes.map((x) => sizeCard(line, x))) +
        rail('brands-h', 'Other ' + esc(typeShort(t)), 'ఇతర బ్రాండ్లు', otherBrands.slice(0, 16).map((l) => lineCard(l)), many ? '<a class="link-arrow" href="' + productUrl(t) + '">All ' + ps.length + ' ' + icon('arrow') + '</a>' : '') +
        (sameBrandElsewhere.length ? rail('brand-h', 'More from ' + esc(p.brandName), '', sameBrandElsewhere.map((l) => lineCard(l))) : '') +
        moreInCategory(t, c),
    })
  }
}

// Festivals: list + one page per festival (same horizontal item strip as the home page).
{
  const nextOcc = (f) => upcomingOccs(f)[0]
  const sorted = [...festivals].sort((a, b) => (nextOcc(a)?.[0][0] || '9999').localeCompare(nextOcc(b)?.[0][0] || '9999'))
  await page('/festivals/', {
    title: 'Festivals – what to buy for every Telugu festival | Janardhan General Stores',
    description: 'Sankranti, Ugadi, Sri Rama Navami, Varalakshmi Vratham, Vinayaka Chavithi, Dasara, Deepavali and Karthika Masam: the puja samagri and kirana items you need, at Janardhan General Stores, Rajampet.',
    current: 'festivals',
    jsonld: [crumbLd([['Home', '/'], ['Festivals', '/festivals/']])],
    body: `<section class="page-hero" data-theme="puja"><div class="container">
  ${crumbs([['Home', '/'], ['Festivals', '/festivals/']])}
  <h1>Festivals</h1>${te('పండుగలు', 'p', 'te')}
  <p class="sub">Everything you need for each festival, from puja samagri to kirana for the sweets, in one place.</p>
</div></section>
<section class="container section" aria-label="Festivals">
  <ul class="fest-list">${sorted.map((f) => {
    const occ = nextOcc(f)
    const items = festItems(f)
    const look = festStyle(f)
    return `<li><a class="fest-tile ${look.cls}" href="${festivalUrl(f)}" style="${look.style}">${festDecor(f)}
      <span class="ft-copy"><span class="ft-name">${esc(f.name)}</span>${te(f.te, 'span', 'ft-te')}
        <span class="ft-date">${occ ? esc(festDateLine(f, occ, true)) : 'Dates coming soon'}</span>
        <span class="ft-count">${items.length} items ${icon('arrow')}</span></span>
      <span class="ft-thumbs" aria-hidden="true">${items.slice(0, 3).map((p) => `<img src="${thumb(p.photo || p.slug)}" alt="" width="80" height="80" loading="lazy" decoding="async">`).join('')}</span>
    </a></li>`
  }).join('')}</ul>
</section>
${askStrip('Hello Janardhan General Stores, I need items for a festival: ')}`,
  })

  for (const f of festivals) {
    const occs = upcomingOccs(f)
    const items = festItems(f)
    await page(festivalUrl(f), {
      title: `${f.name} (${f.te}) – puja samagri & items to buy | Janardhan General Stores Rajampet`,
      description: `${f.before.text} ${items.length} items for ${f.name} at Janardhan General Stores, Rajampet.`.slice(0, 300),
      current: 'festivals',
      ogImage: items[0] ? img(items[0].photo || items[0].slug) : undefined,
      jsonld: [crumbLd([['Home', '/'], ['Festivals', '/festivals/'], [f.name, festivalUrl(f)]])],
      body: `<div class="container fest-page-head">
  ${crumbs([['Home', '/'], ['Festivals', '/festivals/'], [f.name, festivalUrl(f)]], true)}
  <h1>${esc(f.name)} ${te(f.te, 'span', 'te')}</h1>
</div>
<div data-fest-page>
${occs.map((days, i) => festBlock(f, days, { id: `fest-${f.id}-${i}`, onPage: true })).join('\n')}
${festBlock(f, null, { id: `fest-${f.id}-soon`, hidden: false, onPage: true })}
</div>
${occs.length ? `<section class="container section" aria-labelledby="dates-h">
  <h2 id="dates-h" class="fest-dates-h">Dates</h2>
  <ul class="fest-dates">${occs.map((days) => `<li>${esc(festDateLine(f, days, true))}</li>`).join('')}</ul>
  <p class="hint">Dates follow the Telugu panchangam and may differ by a day in some calendars.</p>
</section>` : ''}
<section class="container section" aria-labelledby="all-h" style="padding-top:0">
  <div class="section-head"><div><h2 id="all-h">All ${items.length} items for ${esc(f.name)}</h2></div></div>
  <ul class="product-grid">${items.map((p) => productCard(p, { showCat: true })).join('')}</ul>
</section>
${askStrip(`Hello Janardhan General Stores, I need items for ${f.name}: `)}`,
    })
  }
}

// About
await page('/about/', {
  title: 'About Janardhan General Stores — Kirana & Puja Samagri shop, Rajampet',
  description: 'Janardhan General Stores and Puja Samagri (జనార్దన్ జనరల్ స్టోర్స్) is a local Kirana store with every kind of Kirana and Puja Samagri item at one place — Main Road, near Sathya Show Room, Rajampet.',
  current: 'about',
  jsonld: [storeLd],
  body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['About', '/about/']])}
  <h1>About Janardhan General Stores</h1>${te('మా గురించి', 'p', 'te')}
</div></section>
<section class="container section">
  <div class="info-grid" style="align-items:start">
    <div class="prose">
      <p style="margin-top:0;font-size:1.1rem">Janardhan General Stores and Puja Samagri (${te('జనార్దన్ జనరల్ స్టోర్స్ & పూజా సామగ్రి')}) is a local Kirana store on Main Road, near Sathya Show Room, Rajampet.</p>
      <p class="callout"><strong>All kinds of Puja and Kirana items, available at one place.</strong> You don’t need to go to two shops — everyday groceries and everything for your puja are under one roof.</p>
      <p>On the Kirana side we keep rice, dals, flours, oils, spices, dry fruits, soaps, detergents and household needs. For puja we keep kumkuma and pasupu, kalasam sugandhalu, coconuts and kalasam kayalu, karpuram, agarbatti, dhoop, wicks, matti pramidalu, neyyi deepams, vratham and homam samagri, and much more.</p>
      ${te('జనార్దన్ జనరల్ స్టోర్స్ రాజంపేటలోని స్థానిక కిరాణా దుకాణం. పూజకు మరియు కిరాణాకు కావలసిన అన్ని రకాల వస్తువులు ఒకే చోట లభిస్తాయి.', 'p')}
      <h2>About this website</h2>
      <p>This website is a simple catalogue that shows the kinds of items a store like ours carries, so you can plan before you visit. It does not take orders or payments, and there is no account to create.</p>
      <p>Products, brands, pack sizes and prices change with season and supply, so most prices are not listed here. Please call or WhatsApp to check a particular item.</p>
      ${te('ఈ వెబ్‌సైట్ కేవలం సమాచారం కోసం మాత్రమే. ఇక్కడ ఆర్డర్లు లేదా చెల్లింపులు తీసుకోబడవు. ఏదైనా వస్తువు గురించి తెలుసుకోవడానికి దయచేసి ఫోన్ లేదా వాట్సాప్ చేయండి.', 'p')}
    </div>
    <div class="info-card">
      <div class="ic">${icon('store')}</div>
      <h2>Visit us</h2>
      <address>${shop.address.lines.map(esc).join('<br>')}</address>
      <p class="te" lang="te">${shop.address.linesTe.map(esc).join('<br>')}</p>
      <p><strong>${esc(shop.hours.label)}</strong><br><span lang="te" class="te">${esc(shop.hours.labelTe)}</span></p>
      <div class="actions">
        <a class="btn btn-primary" href="${shop.mapsUrl}" target="_blank" rel="noopener">${icon('directions')}Directions</a>
        <a class="btn btn-light" href="/contact/">Contact</a>
      </div>
    </div>
  </div>
</section>
<section class="container section" id="qr-poster">
  <div class="section-head"><div>
    <h2>Shop QR code ${te('షాప్ QR కోడ్')}</h2>
    <p>Scan it with any phone camera to open this catalogue. Print the poster for the counter or the shop front, or share the QR image on WhatsApp.</p>
  </div></div>
  <div class="poster-wrap">
    <article class="poster" aria-label="Printable shop poster with QR code">
      <header class="poster-top">
        <img src="/brand/logo.jpg" alt="" width="96" height="96" loading="lazy">
        <p class="poster-name">Janardhan</p>
        <p class="poster-sub">General Stores &amp; Puja Samagri</p>
        ${te(shop.fullNameTe, 'p', 'poster-te')}
      </header>
      <div class="poster-body">
        <p class="poster-cta">Scan to see all our items</p>
        ${te('మా అన్ని వస్తువులు చూడటానికి స్కాన్ చేయండి', 'p', 'poster-cta-te')}
        <div class="poster-qr"><img src="/brand/qr-site.svg" alt="QR code that opens shop.myconnect.sbs" width="320" height="320"></div>
        <p class="poster-url">shop.myconnect.sbs</p>
        <ul class="poster-facts">
          <li>${icon('phone')}<span>Call / WhatsApp <strong>${esc(shop.phoneDisplay)}</strong></span></li>
          <li>${icon('clock')}<span>${esc(shop.hours.label)}</span></li>
          <li>${icon('pin')}<span>${esc(shop.address.lines.join(', '))}</span></li>
        </ul>
      </div>
      <footer class="poster-foot">Kirana &amp; Puja Samagri — all at one place · ${te('అన్నీ ఒకే చోట')}</footer>
    </article>
    <div class="poster-actions">
      <button class="btn btn-primary" type="button" data-print-poster hidden>${icon('print')}Print poster (A4)</button>
      <a class="btn btn-light" href="/brand/qr-site.png" download="janardhan-general-stores-qr.png">Download QR image</a>
      <p>The poster prints on one A4 page. Keep the QR at least 3 cm wide so phones read it at a glance.</p>
    </div>
  </div>
</section>
<section class="container section" id="app">
  <div class="install-card">
    <img src="/icons/icon-192.png" alt="" width="72" height="72" loading="lazy">
    <div>
      <h2>Janardhan Stores app ${te('యాప్')}</h2>
      <p>Add this catalogue to your phone or computer like an app. It opens in one tap from your home screen, opens instantly and works even with weak or no internet for pages you have opened before. There’s nothing to download from a store.</p>
      <p class="install-done" data-installed hidden>✓ You are using the app.</p>
      <div class="actions">
        <button class="btn btn-primary" type="button" data-install hidden>Install the app</button>
      </div>
      <div class="install-help" data-install-help hidden>
        <p data-help="ios" hidden><strong>iPhone / iPad (Safari):</strong> tap the Share button <span aria-hidden="true">⎋</span> → <strong>Add to Home Screen</strong> → Add.</p>
        <p data-help="other" hidden><strong>Android (Chrome):</strong> menu ⋮ → <strong>Add to Home screen</strong> / <strong>Install app</strong>. <strong>Computer (Chrome / Edge):</strong> click the install icon at the right end of the address bar, or menu → <strong>Install Janardhan Stores</strong>.</p>
      </div>
    </div>
  </div>
</section>`,
})

// My list (filled in by list.js from this browser's saved list)
await page('/list/', {
  title: 'My list | Janardhan General Stores',
  description: 'Your shopping list for Janardhan General Stores. Choose sizes and quantities, then send it to the shop on WhatsApp and pick up at the shop.',
  current: 'list',
  noindex: true,
  body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['My list', '/list/']])}
  <h1>My list</h1>${te('నా జాబితా', 'p', 'te')}
  <p class="sub">Choose sizes and quantities, then send your list to the shop on WhatsApp. Pick up at the shop.</p>
</div></section>
<section class="container section list-section">
  <div data-list-page data-wa="${shop.whatsappNumber}"><p class="list-loading">Loading your list…</p></div>
  <noscript><p>Your list needs JavaScript. You can still <a href="${whatsappHref('Hello Janardhan General Stores, I need these items:')}">send your items on WhatsApp</a> or call ${esc(shop.phoneDisplay)}.</p></noscript>
</section>`,
})

// Shop reply page: opened by the shop from the link at the bottom of a customer's WhatsApp list.
await page('/reply/', {
  title: 'Reply to a list | Janardhan General Stores',
  description: 'For the shop: mark which items of a customer list are available and send the reply on WhatsApp.',
  current: '',
  noindex: true,
  scripts: [REPLY_JS],
  body: `<section class="page-hero plain"><div class="container">
  <h1>Reply to a customer’s list</h1>${te('కస్టమర్ జాబితాకు జవాబు', 'p', 'te')}
</div></section>
<section class="container section reply-section">
  <div data-reply-page data-shop-name="${esc(shop.fullName)}" data-shop-address="${esc(shop.address.lines.join(', '))}" data-shop-phone="${esc(shop.phoneDisplay)}"><p class="list-loading">Loading the list…</p></div>
  <noscript><p>This page needs JavaScript.</p></noscript>
</section>`,
})

// Customer's bill (link in the shop's WhatsApp reply): the bill on screen + "Download PDF bill".
await page('/bill/', {
  title: 'Your bill | Janardhan General Stores',
  description: 'Your bill from Janardhan General Stores, Rajampet.',
  current: '',
  noindex: true,
  scripts: [REPLY_JS],
  body: `<section class="container section reply-section" style="padding-top:18px">
  <h1 class="visually-hidden">Your bill</h1>
  <div data-reply-page data-view="bill" data-shop-name="${esc(shop.fullName)}" data-shop-address="${esc(shop.address.lines.join(', '))}" data-shop-phone="${esc(shop.phoneDisplay)}"><p class="list-loading">Loading your bill…</p></div>
  <noscript><p>This page needs JavaScript.</p></noscript>
</section>`,
})

// Offline fallback (shown by the app/service worker when a page that was never opened is requested without internet)
await page('/offline/', {
  title: 'You are offline | Janardhan General Stores',
  description: 'No internet connection.',
  noindex: true,
  body: `<section class="container nf">
  <p class="code" aria-hidden="true">⚡</p>
  <h1>You’re offline</h1>
  ${te('ఇంటర్నెట్ కనెక్షన్ లేదు.', 'p')}
  <p style="color:var(--muted)">This page hasn’t been saved on your device yet. Pages you opened before still work. You can still call the shop.</p>
  <div class="actions">
    <a class="btn btn-primary" href="/">Home</a>
    <a class="btn btn-light" href="${telHref}">${icon('phone')}Call ${esc(shop.phoneDisplay)}</a>
  </div>
</section>`,
})

// Visit
await page('/visit/', {
  title: 'Visit Janardhan General Stores — Address, hours & directions | Rajampet',
  description: `Janardhan General Stores, ${shop.address.lines.join(', ')}. ${shop.hours.label}. Get Google Maps directions, call or WhatsApp ${shop.phoneDisplay}.`,
  current: 'visit',
  jsonld: [storeLd],
  body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['Visit', '/visit/']])}
  <h1>Visit Janardhan General Stores</h1>${te('మా దుకాణానికి రండి', 'p', 'te')}
  <p class="sub">Main Road, Near Sathya Show Room, Rajampet – 516115.</p>
</div></section>
<section class="container section">
  <div class="info-grid">
    <a class="map-card" href="${shop.mapsUrl}" target="_blank" rel="noopener" aria-label="Open Janardhan General Stores location in Google Maps">
      <span class="road" aria-hidden="true"></span><span class="road b" aria-hidden="true"></span>
      <svg class="pin" width="54" height="66" viewBox="0 0 54 66" aria-hidden="true"><path d="M27 0C12 0 0 12 0 27c0 20 27 39 27 39s27-19 27-39C54 12 42 0 27 0Z" fill="#a34b32"/><circle cx="27" cy="26" r="11" fill="#fff"/></svg>
      <span class="cap"><span><strong>Open in Google Maps</strong><br><span>Illustration — tap for live directions</span></span>${icon('arrow')}</span>
    </a>
    <div class="info-card">
      <div class="ic">${icon('pin')}</div>
      <h2>Address</h2>
      <address>${shop.address.lines.map(esc).join('<br>')}</address>
      <p class="te" lang="te">${shop.address.linesTe.map(esc).join('<br>')}</p>
      <div class="actions"><a class="btn btn-primary" href="${shop.mapsUrl}" target="_blank" rel="noopener">${icon('directions')}Get directions</a></div>
    </div>
    <div class="info-card puja">
      <div class="ic">${icon('clock')}</div>
      <h2>Opening hours</h2>
      <table class="hours"><tbody>
        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => `<tr><th scope="row">${d}</th><td>6:00 AM – 10:00 PM</td></tr>`).join('')}
      </tbody></table>
      <p class="te" lang="te">${esc(shop.hours.labelTe)}</p>
      <p><span class="open-badge" data-open-badge hidden></span></p>
    </div>
    <div class="info-card">
      <div class="ic">${icon('chat')}</div>
      <h2>Before you come</h2>
      <p>Want to check an item, brand or pack size first? Call or message us.</p>
      ${te('రాకముందు ఏదైనా వస్తువు గురించి తెలుసుకోవాలంటే ఫోన్ లేదా వాట్సాప్ చేయండి.', 'p', 'te')}
      <div class="actions">
        <a class="btn btn-light" href="${telHref}">${icon('phone')}Call ${esc(shop.phoneDisplay)}</a>
        <a class="btn btn-wa" href="${whatsappHref('Hello Janardhan General Stores, I am planning to visit the shop.')}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>
        <a class="btn btn-light" href="${mailHref}">${icon('mail')}Email</a>
      </div>
    </div>
  </div>
</section>`,
})

// Contact
await page('/contact/', {
  title: 'Contact Janardhan General Stores — Phone, WhatsApp & email | Rajampet',
  description: `Contact Janardhan General Stores, Rajampet: call or WhatsApp ${shop.phoneDisplay}, email ${shop.email}. ${shop.hours.label}.`,
  current: 'contact',
  jsonld: [storeLd],
  body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['Contact', '/contact/']])}
  <h1>Contact Janardhan General Stores</h1>${te('మమ్మల్ని సంప్రదించండి', 'p', 'te')}
  <p class="sub">Questions about an item? Reach us by phone, WhatsApp or email during shop hours.</p>
</div></section>
<section class="container section">
  <div class="info-grid three">
    <div class="info-card">
      <div class="ic">${icon('phone')}</div>
      <h2>Phone</h2><p class="big">${esc(shop.phoneDisplay)}</p>
      <p class="te" lang="te">ఫోన్ చేయండి</p>
      <div class="actions"><a class="btn btn-primary" href="${telHref}">${icon('phone')}Call now</a></div>
    </div>
    <div class="info-card">
      <div class="ic" style="background:#dff1e6;color:#1f7a4a">${icon('whatsapp')}</div>
      <h2>WhatsApp</h2><p class="big">${esc(shop.phoneDisplay)}</p>
      <p class="te" lang="te">వాట్సాప్‌లో మెసేజ్ చేయండి</p>
      <div class="actions"><a class="btn btn-wa" href="${whatsappHref('Hello Janardhan General Stores, I have a question.')}" target="_blank" rel="noopener">${icon('whatsapp')}Chat on WhatsApp</a></div>
    </div>
    <div class="info-card puja">
      <div class="ic">${icon('mail')}</div>
      <h2>Email</h2><p class="big" style="font-size:1.05rem">${esc(shop.email)}</p>
      <p class="te" lang="te">ఈమెయిల్ పంపండి</p>
      <div class="actions"><a class="btn btn-light" href="${mailHref}">${icon('mail')}Send email</a></div>
    </div>
  </div>
  <p style="margin-top:20px;color:var(--muted)">${icon('clock')} ${esc(shop.hours.label)} · ${te(shop.hours.labelTe)} — <a href="/visit/">Address &amp; directions</a></p>
</section>`,
})

// Search
{
  // Brands: each card shows that brand's own photo when one is marked in the editor, otherwise a lettered tile
  // (never another brand's photo).
  const shortName = (n) => n.replace(/\s*\(.*\)\s*$/, '')
  const brandMap = new Map()
  for (const p of products) {
    for (const it of skusOf(p.slug)) {
      if (!it.brandName) continue
      const b = it.brandName
      const e = brandMap.get(b) || { name: b, items: [], photo: null, logo: brandLogo(it.brand) }
      if (!e.items.includes(shortName(p.name))) e.items.push(shortName(p.name))
      const own = skuMain(it)
      if (!e.photo && own) e.photo = thumb(own)
      brandMap.set(b, e)
    }
  }
  const brandsSorted = [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  const initials = (s) => s.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const brandCard = (b) => `<li><a class="brand-card" href="/search/?q=${encodeURIComponent(b.name)}">
      ${b.logo ? `<img class="bc-logo" src="${b.logo}" alt="" width="56" height="56" loading="lazy" decoding="async">` : b.photo ? `<img src="${b.photo}" alt="" width="56" height="56" loading="lazy" decoding="async">` : `<span class="mono" style="--mc:${monoColor(b.name)}" aria-hidden="true">${esc(initials(b.name))}</span>`}
      <span class="bc-t"><strong>${esc(b.name)}</strong><span>${esc(b.items.slice(0, 2).join(' · '))}${b.items.length > 2 ? ` +${b.items.length - 2}` : ''}</span></span></a></li>`
  const POPULAR = [['Rice', 'బియ్యం'], ['Kandi pappu', 'కంది పప్పు'], ['Oil', 'నూనె'], ['Agarbatti', 'అగరబత్తి'], ['Karpuram', 'కర్పూరం'], ['Coconut', 'కొబ్బరికాయ'], ['Ghee', 'నెయ్యి'], ['Soap', 'సబ్బు'], ['Tea powder', 'టీ పొడి'], ['Pramidalu', 'ప్రమిదలు']]
  const catTile = (c) => {
    const cover = c.products[0]
    return `<li><a class="sc-tile" href="${categoryUrl(c)}" data-theme="${theme(c.section)}"><img src="${thumb(cover.photo || cover.slug)}" alt="" width="64" height="64" loading="lazy" decoding="async">
      <span class="ct-t"><strong>${esc(c.name)}</strong><span lang="te">${esc(c.te)}</span><small>${c.products.length} items</small></span></a></li>`
  }
  await page('/search/', {
    title: 'Search the catalogue | Janardhan General Stores',
    description: 'Search Janardhan General Stores’ Kirana and Puja Samagri catalogue in English or Telugu, by typing or by voice.',
    current: 'search',
    scripts: [SEARCH_JS],
    noindex: true,
    body: `<section class="search-hero"><div class="container">
  ${crumbs([['Home', '/'], ['Search', '/search/']])}
  <h1>What are you looking for?</h1>${te('మీకు ఏమి కావాలి? టైప్ చేయండి లేదా మైక్ నొక్కి చెప్పండి', 'p', 'te')}
</div></section>
<section class="container search-page" data-search-root data-index="${SEARCH_INDEX}">
  <div class="search-bar">
    ${searchForm('q-page')}
    <p class="voice-tip" data-voice-tip hidden>${icon('mic')}<span>Tap the mic and say the item’s name — in Telugu or English. <span lang="te">మైక్ నొక్కి వస్తువు పేరు చెప్పండి.</span></span></p>
    <div class="search-tools" data-search-tools hidden>
      <div class="seg" role="group" aria-label="Filter by section">
        <button type="button" data-section-filter="all">All</button>
        <button type="button" data-section-filter="kirana">Kirana</button>
        <button type="button" data-section-filter="puja-samagri">Puja Samagri</button>
      </div>
    </div>
  </div>
  <p class="search-status" data-status aria-live="polite"></p>
  <noscript><p>Search needs JavaScript. You can still browse <a href="/kirana/">Kirana</a> and <a href="/puja-samagri/">Puja Samagri</a> by category.</p></noscript>
  <div class="brand-banner" data-brand-banner hidden></div>
  <ul class="product-grid" data-results></ul>
  <div class="empty" data-empty hidden>
    <p>No matching items in the online catalogue.</p>
    <p>The shop keeps many more items — <a href="${whatsappHref('Hello Janardhan General Stores, do you have this item?')}" target="_blank" rel="noopener">ask on WhatsApp</a> or <a href="${telHref}">call ${esc(shop.phoneDisplay)}</a>.</p>
    <div class="suggest" style="justify-content:center">${POPULAR.slice(0, 6).map(([s]) => `<a class="chip" href="/search/?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
  </div>
  <div class="search-browse" data-browse>
    <section class="sb-block" aria-labelledby="sb-pop">
      <h2 id="sb-pop">Popular searches</h2>
      <ul class="pop-list">${POPULAR.map(([en, tel]) => `<li><a class="pop" href="/search/?q=${encodeURIComponent(en)}"><span>${esc(en)}</span><span lang="te">${esc(tel)}</span></a></li>`).join('')}</ul>
    </section>
    <section class="sb-block" aria-labelledby="sb-cat">
      <h2 id="sb-cat">Browse by category</h2>
      ${sections.map((s) => `<h3 class="sb-sec" data-theme="${theme(s.slug)}">${esc(s.name)} <span lang="te">${esc(s.te)}</span></h3>
      <ul class="sc-tiles">${categoriesOf(s.slug).map(catTile).join('')}</ul>`).join('')}
    </section>
    <section class="sb-block" aria-labelledby="sb-brand">
      <h2 id="sb-brand">Brands at the shop</h2>
      <p class="sb-sub">Tap a brand to see which items we keep from it.</p>
      <ul class="brand-cards">${brandsSorted.map(brandCard).join('')}</ul>
    </section>
  </div>
</section>`,
  })
}

// Image credits (one overall page; licences for Commons photos require author + licence + source)
{
  const commons = products.filter((p) => !p.photo && credits[p.slug] && !credits[p.slug].own && !missingPhoto.includes(p.slug))
  await page('/credits/', {
    title: 'Image credits | Janardhan General Stores',
    description: 'Credits for the photos and fonts used on the Janardhan General Stores catalogue website.',
    current: '',
    body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['Image credits', '/credits/']])}
  <h1>Image credits</h1>
</div></section>
<section class="container section">
  <div class="prose" style="margin-bottom:20px">
    <p style="margin-top:0">Many product photos on this website were supplied by the shop. Brand names, logos and packaging shown belong to their respective owners.</p>
    <p>Some photos are from <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a> and are used under their free licences (Creative Commons or public domain). They were resized and cropped to fit the site. Their authors and licences are listed below.</p>
    <p>Fonts: Fraunces and Noto Sans Telugu, under the SIL Open Font License (<a href="/fonts/OFL-Fraunces.txt">licence</a>, <a href="/fonts/OFL-NotoSansTelugu.txt">licence</a>).</p>
  </div>
  <div class="table-wrap"><table class="credits-table">
    <thead><tr><th scope="col">Photo</th><th scope="col">Author</th><th scope="col">Licence</th></tr></thead>
    <tbody>${commons.map((p) => {
      const cr = credits[p.slug]
      return `<tr><td data-label="Photo"><a href="${esc(cr.source)}" target="_blank" rel="noopener">${esc(p.name)}</a></td><td data-label="Author">${esc(cr.author)}</td><td data-label="Licence">${cr.licenseUrl ? `<a href="${esc(cr.licenseUrl)}" target="_blank" rel="noopener license">${esc(cr.license)}</a>` : esc(cr.license)}</td></tr>`
    }).join('')}</tbody>
  </table></div>
</section>`,
  })
}

// 404 (Cloudflare Pages serves /404.html with a 404 status for unknown paths)
await page('/404', {
  title: 'Page not found | Janardhan General Stores',
  description: 'This page could not be found on the Janardhan General Stores catalogue.',
  noindex: true,
  file: '404.html',
  body: `<section class="container nf">
  <p class="code" aria-hidden="true">404</p>
  <h1>Page not found</h1>
  ${te('క్షమించండి, ఈ పేజీ దొరకలేదు.', 'p')}
  <p style="color:var(--muted)">The page may have moved. Try searching the catalogue or browse a section.</p>
  ${searchForm('q-404')}
  <div class="actions">
    <a class="btn btn-primary" href="/kirana/">Kirana</a>
    <a class="btn btn-light" href="/puja-samagri/" style="color:var(--maroon)">Puja Samagri</a>
    <a class="btn btn-light" href="/">Home</a>
  </div>
</section>`,
})

// ───────────────────────── SEO files ─────────────────────────
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`)
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: ${SITE}/sitemap.xml\n`)
// ───────────────────────── App (PWA) ─────────────────────────
// Installable on Android, iPhone and Windows/Mac (Chrome/Edge). Icons come from `npm run brand-assets`.
await writeFile(join(dist, 'site.webmanifest'), JSON.stringify({
  id: '/',
  name: 'Janardhan General Stores and Puja Samagri',
  short_name: 'Janardhan Stores',
  description: 'Kirana & Puja Samagri catalogue of Janardhan General Stores, Main Road, Rajampet.',
  lang: 'en-IN',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  background_color: '#2a0e0b',
  theme_color: '#3a1512',
  categories: ['shopping', 'food', 'lifestyle'],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Kirana', short_name: 'Kirana', url: '/kirana/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Puja Samagri', short_name: 'Puja', url: '/puja-samagri/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Search items', short_name: 'Search', url: '/search/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Visit & directions', short_name: 'Visit', url: '/visit/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
  ],
}, null, 2))

// Service worker: pages = network first (always the latest catalogue when online, saved copy when offline or slow),
// hashed CSS/JS/photos/fonts = cache first (they never change under the same name). A new build = a new version,
// and old caches are deleted.
const PRECACHE = ['/', '/offline/', '/list/', '/reply/', REPLY_JS, '/about/', '/visit/', '/contact/', '/kirana/', '/puja-samagri/', '/search/', CSS, SITE_JS, SEARCH_JS, LIST_JS, SEARCH_INDEX,
  '/brand/logo-mark.webp', '/fonts/fraunces-latin.woff2', '/fonts/noto-sans-telugu.woff2', '/icons/icon-192.png']
const htmlHash = hash(sitemap.join('|') + (await readFile(join(dist, 'index.html'), 'utf8')))
const SW_VERSION = hash(PRECACHE.join('|') + htmlHash)
await writeFile(join(dist, 'sw.js'), `// Janardhan General Stores — service worker (generated by scripts/build.mjs; do not edit dist/sw.js).
const VERSION = '${SW_VERSION}'
const CORE = 'core-' + VERSION
const PAGES = 'pages-v1'
const FILES = 'files-v1'
const PRECACHE = ${JSON.stringify(PRECACHE)}
const MAX_PAGES = 120
const MAX_FILES = 400
const PAGE_TIMEOUT = 3500

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('core-') && k !== CORE) await caches.delete(k)
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}
const ok = (r) => r && r.ok && r.type === 'basic'

async function page(e) {
  const req = e.request
  const key = new URL(req.url)
  key.search = ''
  const net = (async () => {
    const r = (await e.preloadResponse) || (await fetch(req))
    if (ok(r) && !r.redirected) {
      const c = await caches.open(PAGES)
      await c.put(key.href, r.clone())
      trim(PAGES, MAX_PAGES)
    }
    return r
  })()
  e.waitUntil(net.catch(() => {}))
  const saved = async () => (await caches.match(key.href, { cacheName: PAGES })) || (await caches.match(key.pathname, { cacheName: CORE }))
  try {
    // Online: the live page. Very slow network: the saved copy (if there is one) after a few seconds.
    return await Promise.race([net, new Promise((res, rej) => setTimeout(async () => { const s = await saved(); s ? res(s) : rej() }, PAGE_TIMEOUT))])
  } catch {
    return (await saved().catch(() => null)) || (await net.catch(() => null)) || (await caches.match('/offline/', { cacheName: CORE })) || Response.error()
  }
}

async function file(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const r = await fetch(req)
  if (ok(r)) {
    const c = await caches.open(FILES)
    await c.put(req, r.clone())
    trim(FILES, MAX_FILES)
  }
  return r
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (req.mode === 'navigate') return e.respondWith(page(e))
  if (/^\\/(assets|img|fonts)\\//.test(url.pathname)) return e.respondWith(file(req))
  // Logo, QR and icons keep the same name when changed: show the saved copy, refresh it in the background.
  if (/^\\/(icons|brand)\\//.test(url.pathname)) {
    const fresh = fetch(req).then(async (r) => { if (ok(r)) await (await caches.open(FILES)).put(req, r.clone()); return r })
    e.waitUntil(fresh.catch(() => {}))
    return e.respondWith(caches.match(req).then((hit) => hit || fresh))
  }
})
`)

console.log(`Built ${sitemap.length + 2} pages (${products.length} products, ${categories.length} categories) → dist/  [SITE_URL=${SITE}]`)
