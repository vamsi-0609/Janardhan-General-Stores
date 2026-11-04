/**
 * Janardhan General Stores static catalogue — build script. Plain Node, no framework, no network, no backend.
 * Pre-renders every route to HTML in dist/ for Cloudflare Pages.
 *
 *   SITE_URL=https://shop.myconnect.sbs node scripts/build.mjs
 */
import { rm, mkdir, cp, readFile, writeFile, access, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shop, telHref, mailHref, whatsappHref } from '../src/data/shop.mjs'
import { sections, categories, products, categoriesOf, sectionOf, categoryOf } from '../src/data/catalogue.mjs'
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
// Image URLs carry a short version code from the file contents (?v=…). When a photo is replaced, its URL changes,
// so browsers and Cloudflare fetch the new photo at once instead of showing a cached old one.
const versions = new Map()
function versioned(path) {
  if (!versions.has(path)) {
    let file = join(root, 'public', path)
    if (!existsSync(file) && path.startsWith('/img/products/')) file = join(root, 'public', 'img', 'placeholder.webp')
    versions.set(path, existsSync(file) ? `${path}?v=${createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8)}` : path)
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

const sectionLabelShort = (slug) => (slug === 'puja-samagri' ? 'Puja Samagri' : 'Kirana')
const searchIndex = products.map((p) => {
  const c = categoryOf(p.category)
  return { n: p.name, t: p.te, a: [...p.aliases, ...(p.brands || [])], b: p.brands || [], c: c.name, ct: c.te, s: sectionLabelShort(p.section), sec: p.section, u: productUrl(p), i: thumb(p.photo || p.slug) }
})
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
    <button type="submit" aria-label="Search">${icon('arrow')}</button>
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
    <details class="menu">
      <summary aria-label="Menu">${icon('menu')}</summary>
      <nav class="menu-panel" aria-label="Main menu">
        ${NAV.map(([k, href, en, t]) => `<a href="${href}"${cur(k)}><span>${en}</span>${te(t)}</a>`).join('')}
        <a href="/search/"${cur('search')}><span>Search</span>${te('వెతకండి')}</a>
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
      </ul>
    </div>
    <div>
      <h2>The shop</h2>
      <ul>
        <li><a href="/visit/">Visit &amp; directions</a></li>
        <li><a href="/about/">About Janardhan General Stores</a></li>
        <li><a href="/contact/">Contact</a></li>
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

function gallery(p) {
  const photos = photosOf(p)
  if (photos.length === 1) {
    return `<div class="ph"><img src="${img(photos[0])}" alt="${esc(p.name)}" width="640" height="640" fetchpriority="high" decoding="async"></div>`
  }
  const n = photos.length
  return `<div class="gallery" data-gallery>
        <div class="g-track ph" tabindex="0" role="region" aria-roledescription="carousel" aria-label="${esc(p.name)} photos (${n}). Swipe or use the arrow keys.">
          ${photos.map((ph, i) => `<figure class="g-slide" id="g-${i + 1}" aria-label="Photo ${i + 1} of ${n}"><img src="${img(ph)}" alt="${esc(p.name)}${i ? ` – photo ${i + 1}` : ''}" width="640" height="640" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></figure>`).join('')}
        </div>
        <span class="g-count" data-g-count aria-hidden="true">1 / ${n}</span>
        <button class="g-nav g-prev" type="button" data-g-prev aria-label="Previous photo" hidden>${icon('arrow')}</button>
        <button class="g-nav g-next" type="button" data-g-next aria-label="Next photo" hidden>${icon('arrow')}</button>
        <div class="g-thumbs" role="group" aria-label="Choose a photo">
          ${photos.map((ph, i) => `<a class="g-thumb" href="#g-${i + 1}" data-g-thumb="${i}"${i ? '' : ' aria-current="true"'} aria-label="Show photo ${i + 1} of ${n}"><img src="${thumb(ph)}" alt="" width="80" height="80" loading="lazy" decoding="async"></a>`).join('')}
        </div>
      </div>`
}

// ───────────────────────── components ─────────────────────────
function productCard(p, { eager = false, showCat = false } = {}) {
  const c = categoryOf(p.category)
  return `<li data-filter-item="${esc([p.name, p.te, ...p.aliases, ...(p.brands || [])].join(' '))}"><a class="card" data-theme="${theme(p.section)}" href="${productUrl(p)}">
    <div class="ph"><img src="${thumb(p.photo || p.slug)}" srcset="${thumb(p.photo || p.slug)} 320w, ${img(p.photo || p.slug)} 640w" sizes="(min-width:1280px) 230px, (min-width:768px) 30vw, 46vw" alt="${esc(p.name)}" width="320" height="320" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>
    <div class="body">${showCat ? `<span class="cat">${esc(c.name)}</span>` : ''}<span class="en">${esc(p.name)}</span>${te(p.te, 'span', 'te')}${p.price ? `<span class="price">${esc(p.price)}</span>` : ''}${p.brands ? `<span class="brands">${esc(p.brands.join(' · '))}</span>` : ''}</div>
  </a></li>`
}

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
  if (!p) throw new Error(`Festival ${f.id} uses unknown product ${slug}`)
  return p
})
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
<section class="container section" aria-label="Shop by category" style="padding-top:18px">${panels}</section>
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
  <p style="margin-top:24px"><a class="link-arrow" href="${sectionUrl(other.slug)}" style="color:${other.slug === 'kirana' ? 'var(--forest)' : 'var(--maroon)'}">Also browse ${esc(other.title)} · ${te(other.te)} ${icon('arrow')}</a></p>
</section>
${askStrip(`Hello Janardhan General Stores, I am looking for a ${s.name} item.`)}`,
  })
}

// Category pages
for (const c of categories) {
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
    <ul class="chips">${siblings.map((x) => `<li><a class="chip" href="${categoryUrl(x)}"${x.slug === c.slug ? ' aria-current="page"' : ''}>${esc(x.name)} <span class="n">${x.products.length}</span></a></li>`).join('')}</ul>
  </details>
  <ul class="chips chips-wide">${siblings.map((x) => `<li><a class="chip" href="${categoryUrl(x)}"${x.slug === c.slug ? ' aria-current="page"' : ''}>${esc(x.name)} <span class="n">${x.products.length}</span></a></li>`).join('')}</ul>
</nav>
<section class="container section" aria-label="${esc(c.name)} items" style="padding-top:20px">
  <div class="filter">
    <form hidden class="search-form" role="search" style="max-width:380px">
      <label class="visually-hidden" for="filter">Filter ${esc(c.name)}</label>
      ${icon('search').replace('class="icon"', 'class="icon search-icon"')}
      <input id="filter" type="search" data-filter placeholder="Filter in ${esc(c.name)}…" autocomplete="off" style="padding-right:18px">
    </form>
    <p class="count" data-filter-count aria-live="polite">${c.products.length} items</p>
  </div>
  <ul class="product-grid">${c.products.map((p, i) => productCard({ ...p, section: c.section, category: c.slug }, { eager: i < 2 })).join('')}</ul>
  <div class="empty" data-filter-empty hidden><p>No items match that filter here.</p><p><a href="/search/">Search the whole catalogue</a></p></div>
</section>
${askStrip(`Hello Janardhan General Stores, I am looking for an item in ${c.name}.`)}`,
  })
}

// Product pages
for (const p of products) {
  const c = categoryOf(p.category)
  const s = sectionOf(p.section)
  const related = c.products.filter((x) => x.slug !== p.slug).slice(0, 6).map((x) => ({ ...x, section: c.section, category: c.slug }))
  const msg = `Hello Janardhan General Stores, is ${p.name} available at the shop?`
  await page(productUrl(p), {
    title: `${p.name} – ${p.te} | ${c.name} | Janardhan General Stores Rajampet`,
    description: `${p.desc} ${p.name} (${p.te}) in ${c.name} at Janardhan General Stores, Rajampet. Call or WhatsApp to check availability.`,
    current: p.section,
    themeName: s.theme,
    ogImage: img(p.photo || p.slug),
    jsonld: [crumbLd([['Home', '/'], [s.name, sectionUrl(s.slug)], [c.name, categoryUrl(c)], [p.name, productUrl(p)]])],
    body: `<div class="container">
  <div style="padding-top:14px">${crumbs([['Home', '/'], [s.name, sectionUrl(s.slug)], [c.name, categoryUrl(c)], [p.name, productUrl(p)]], true)}</div>
  <article class="pdp">
    <div class="pdp-media">
      ${gallery(p)}
    </div>
    <div class="pdp-info">
      <a class="chip" href="${categoryUrl(c)}">${esc(c.name)} · ${te(c.te)}</a>
      <h1>${esc(p.name)}</h1>
      ${te(p.te, 'p', 'te-name')}
      <p class="desc">${esc(p.desc)}</p>
      ${p.price ? `<p class="price-tag"><span class="lbl">Price at the shop</span><strong>${esc(p.price)}</strong>${te(p.priceTe, 'span', 'te')}</p>` : ''}
      ${p.brands || p.sizes ? `<div class="stock-info">${p.brands ? `<div class="aka"><h2>Brands at the shop</h2><ul class="brand-list">${p.brands.map((b) => `<li><a href="/search/?q=${encodeURIComponent(b)}">${esc(b)}</a></li>`).join('')}</ul></div>` : ''}${p.sizes ? `<p class="sizes"><span>Pack sizes</span> ${esc(p.sizes)}</p>` : ''}</div>` : ''}
      ${p.aliases.length ? `<div class="aka"><h2>Also known as</h2><ul>${p.aliases.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      ${(() => {
        const fs = festivals.filter((f) => f.items.includes(p.slug) || (p.photo && f.items.includes(p.photo)))
        return fs.length ? `<div class="aka fest-for"><h2>Suggested for</h2><ul>${fs.map((f) => `<li><a href="${festivalUrl(f)}" style="--fa:${f.colors[0]}">${esc(f.name)} ${icon('arrow')}</a></li>`).join('')}</ul></div>` : ''
      })()}
      <div class="ask">
        <h2>Want this item?</h2>
        <p>Ask the shop about availability, brands and pack sizes, then pick it up in person.</p>
        ${te('అందుబాటులో ఉందో లేదో ఫోన్ లేదా వాట్సాప్ ద్వారా అడగండి.', 'p')}
        <div class="actions">
          <a class="btn btn-wa" href="${whatsappHref(msg)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask on WhatsApp</a>
          <a class="btn btn-light" href="${telHref}">${icon('phone')}Call ${esc(shop.phoneDisplay)}</a>
          <a class="btn btn-light" href="${shop.mapsUrl}" target="_blank" rel="noopener">${icon('directions')}Directions</a>
        </div>
        ${p.caution ? `<div class="caution" role="note"><strong>${icon('info')}Please note</strong><p>${esc(p.caution)}</p><p lang="te" class="te">${esc(p.cautionTe)}</p></div>` : ''}
        <p class="note">${icon('info')}<span>${p.price ? 'Price as informed by the shop and may change. Photo is representative.' : p.brands ? 'Brands listed are ones the shop usually keeps; stock and prices vary, so please ask. Photo shows one of the brands we keep.' : 'This is a representative catalogue item. Stock, brands and prices are not shown online and are confirmed at the shop.'}</span></p>
      </div>
    </div>
  </article>
</div>
${related.length ? `<section class="container section" aria-labelledby="rel-h">
  <div class="section-head"><h2 id="rel-h">More in ${esc(c.name)} ${te(c.te)}</h2><a class="link-arrow" href="${categoryUrl(c)}">View all ${c.products.length} ${icon('arrow')}</a></div>
  <ul class="product-grid related">${related.map((x) => productCard(x)).join('')}</ul>
</section>` : ''}`,
  })
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
await page('/search/', {
  title: 'Search the catalogue | Janardhan General Stores',
  description: 'Search Janardhan General Stores’ Kirana and Puja Samagri catalogue in English or Telugu.',
  current: 'search',
  scripts: [SEARCH_JS],
  noindex: true,
  body: `<section class="page-hero plain"><div class="container">
  ${crumbs([['Home', '/'], ['Search', '/search/']])}
  <h1>Search the catalogue</h1>${te('ఉత్పత్తుల కోసం వెతకండి', 'p', 'te')}
</div></section>
<section class="container section search-page" data-search-root data-index="${SEARCH_INDEX}">
  ${searchForm('q-page')}
  <div class="search-tools" data-search-tools hidden>
    <div class="seg" role="group" aria-label="Filter by section">
      <button type="button" data-section-filter="all">All</button>
      <button type="button" data-section-filter="kirana">Kirana</button>
      <button type="button" data-section-filter="puja-samagri">Puja Samagri</button>
    </div>
  </div>
  <div class="brand-filter"><h2>Brands at the shop</h2><ul class="chips">${[...new Set(products.flatMap((p) => p.brands || []))].sort().map((b) => `<li><a class="chip" href="/search/?q=${encodeURIComponent(b)}">${esc(b)}</a></li>`).join('')}</ul></div>
  <p data-status aria-live="polite" style="color:var(--muted);margin-bottom:16px"></p>
  <noscript><p>Search needs JavaScript. You can still browse <a href="/kirana/">Kirana</a> and <a href="/puja-samagri/">Puja Samagri</a> by category.</p></noscript>
  <ul class="product-grid" data-results></ul>
  <div class="empty" data-empty hidden>
    <p>No matching items in the online catalogue.</p>
    <p>The shop keeps many more items — <a href="${whatsappHref('Hello Janardhan General Stores, do you have this item?')}" target="_blank" rel="noopener">ask on WhatsApp</a> or <a href="${telHref}">call ${esc(shop.phoneDisplay)}</a>.</p>
    <div class="suggest" style="justify-content:center">${['Rice', 'Kandi pappu', 'Agarbatti', 'కర్పూరం', 'Ghee', 'Diya'].map((s) => `<a class="chip" href="/search/?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
  </div>
</section>`,
})

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
await writeFile(join(dist, 'site.webmanifest'), JSON.stringify({
  name: 'Janardhan General Stores and Puja Samagri', short_name: 'Janardhan Stores', start_url: '/', display: 'browser',
  background_color: '#f6f6f2', theme_color: '#3a1512', icons: [{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
}, null, 2))

console.log(`Built ${sitemap.length + 2} pages (${products.length} products, ${categories.length} categories) → dist/  [SITE_URL=${SITE}]`)
