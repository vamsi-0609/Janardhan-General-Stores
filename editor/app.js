// Janardhan General Stores — local catalogue editor (runs only on this computer, talks to editor/server.mjs).
;(() => {
  'use strict'
  let S = null // state from the server
  let tab = 'products'
  let filters = { q: '', cat: '' }
  let closeGuard = null // returns true if the open drawer may close

  const PREVIEW = () => `http://localhost:${S?.previewPort || 4173}`
  const $ = (sel, el = document) => el.querySelector(sel)

  // ───────── tiny DOM builder (text is always set as text, never as HTML) ─────────
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else if (k === 'value') el.value = v
      else if (k === 'checked') el.checked = !!v
      else el.setAttribute(k, v === true ? '' : v)
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid))
    return el
  }

  // ───────── server calls ─────────
  async function api(method, path, body, raw) {
    const opt = { method, headers: {} }
    if (raw) { opt.body = raw; opt.headers['Content-Type'] = 'application/octet-stream' }
    else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json' }
    const res = await fetch(path, opt)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data
  }
  async function load() { S = await api('GET', '/api/state'); renderStatus(S.build, S.changes) }

  let toastTimer
  function toast(msg, isErr) {
    const t = $('#toast')
    t.textContent = msg
    t.className = 'toast' + (isErr ? ' err' : '')
    t.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (t.hidden = true), isErr ? 7000 : 3200)
  }
  async function act(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); pollBuild(); return r ?? true } catch (e) { toast(e.message, true); return false }
  }

  // ───────── build status ─────────
  let pollTimer
  function renderStatus(build, changes) {
    const el = $('#status')
    const map = { ok: ['ok', 'Preview up to date ✓'], error: ['err', 'Preview build failed – click'], building: ['busy', 'Updating preview…'], pending: ['busy', 'Updating preview…'], idle: ['busy', 'Starting…'] }
    const [cls, text] = map[build.status] || map.idle
    el.className = 'status ' + cls
    el.textContent = text + (changes ? `  ·  ${changes} change${changes === 1 ? '' : 's'} not live yet` : '')
    el.onclick = () => openDrawer('Website preview', [
      h('p', {}, 'Every save rebuilds the website on this computer. "View in browser" opens it at ', h('code', {}, PREVIEW()), '.'),
      h('p', {}, changes ? `${changes} file(s) changed since the last time the site went live. Ask Claude to review and push them when you are done.` : 'Everything matches the live website.'),
      h('p', {}, h('strong', {}, 'Last build output:')),
      h('pre', { class: 'log' }, build.log || '(none yet)'),
    ], [h('button', { class: 'btn', type: 'button', onclick: async () => { await api('POST', '/api/rebuild', {}); pollBuild(); closeDrawer(true) } }, 'Rebuild now')])
  }
  function pollBuild() {
    clearTimeout(pollTimer)
    const tick = async () => {
      try {
        const { build, changes } = await api('GET', '/api/build')
        renderStatus(build, changes)
        if (build.status === 'building' || build.status === 'pending') pollTimer = setTimeout(tick, 700)
      } catch { pollTimer = setTimeout(tick, 2000) }
    }
    pollTimer = setTimeout(tick, 300)
  }

  // ───────── helpers ─────────
  const products = () => S.categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.slug, section: c.section })))
  const productBySlug = (slug) => products().find((p) => p.slug === slug)
  const sectionName = (slug) => S.sections.find((s) => s.slug === slug)?.name || slug
  const productUrl = (p) => `${PREVIEW()}/${p.section}/${p.category}/${p.slug}/`
  const thumbOf = (slug) => S.photos[slug]?.[0]?.thumb || ''
  const slugify = (s) => {
    let x = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
    if (/-\d{1,2}$/.test(x)) x += '-pack'
    return x
  }
  const norm = (s) => String(s || '').toLowerCase()
  function catSelect(value, attrs = {}) {
    return h('select', attrs, S.sections.map((s) => h('optgroup', { label: s.name },
      S.categories.filter((c) => c.section === s.slug).map((c) => h('option', { value: c.slug, selected: c.slug === value }, `${c.name} · ${c.te}`)))))
  }
  function field(label, input, hint, required) {
    return h('label', { class: 'field' }, h('span', { class: required ? 'req' : '' }, label), input, hint ? h('small', {}, hint) : null)
  }

  /** Chip input for lists (also known as, brands). Returns { el, get() }. */
  function chipInput(values, placeholder) {
    let list = [...values]
    const wrap = h('div', { class: 'chips' })
    const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder })
    const add = () => {
      for (const v of input.value.split(',').map((x) => x.trim()).filter(Boolean)) if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v)
      input.value = ''
      draw()
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
      if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw() }
    })
    input.addEventListener('blur', add)
    function draw() {
      wrap.replaceChildren(...list.map((v, i) => h('span', { class: 'chip' }, v, h('button', { type: 'button', 'aria-label': `Remove ${v}`, onclick: () => { list.splice(i, 1); draw() } }, '×'))), input)
    }
    draw()
    wrap.addEventListener('click', (e) => { if (e.target === wrap) input.focus() })
    return { el: wrap, get: () => { add(); return list } }
  }

  // ───────── drawer ─────────
  function openDrawer(title, body, foot, guard) {
    const d = $('#drawer')
    d.replaceChildren(
      h('div', { class: 'drawer-head' }, h('h2', { id: 'drawer-title' }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => closeDrawer() }, '✕')),
      h('div', { class: 'drawer-body' }, body),
      foot ? h('div', { class: 'drawer-foot' }, foot) : '',
    )
    closeGuard = guard || null
    d.hidden = false
    $('#backdrop').hidden = false
    document.body.style.overflow = 'hidden'
    setTimeout(() => (d.querySelector('input:not([readonly]), select, textarea, button') || d).focus(), 30)
  }
  function closeDrawer(force) {
    if (!force && closeGuard && !closeGuard()) return
    $('#drawer').hidden = true
    $('#backdrop').hidden = true
    document.body.style.overflow = ''
    closeGuard = null
  }
  $('#backdrop').addEventListener('click', () => closeDrawer())
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer() })

  // ───────── PRODUCTS ─────────
  function renderProducts() {
    const search = h('input', { type: 'search', placeholder: 'Search by name, Telugu name, brand or also-known-as…', value: filters.q, 'aria-label': 'Search products' })
    search.addEventListener('input', () => { filters.q = search.value; drawList() })
    const sel = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'),
      S.sections.map((s) => h('optgroup', { label: s.name }, S.categories.filter((c) => c.section === s.slug).map((c) => h('option', { value: c.slug, selected: c.slug === filters.cat }, `${c.name} (${c.products.length})`)))))
    sel.addEventListener('change', () => { filters.cat = sel.value; drawList() })
    const ul = h('ul', { class: 'plist' })
    const count = h('span', { class: 'count' })
    function drawList() {
      const q2 = norm(filters.q)
      const rows = products().filter((p) => (!filters.cat || p.category === filters.cat) &&
        (!q2 || [p.name, p.te, p.slug, ...(p.aliases || []), ...(p.brands || [])].some((x) => norm(x).includes(q2))))
      count.textContent = `${rows.length} of ${products().length} products`
      ul.replaceChildren(...(rows.length ? rows.map((p) => {
        const ph = S.photos[p.slug] || []
        const cat = S.categories.find((c) => c.slug === p.category)
        return h('li', {}, h('button', { class: 'pitem', type: 'button', onclick: () => editProduct(p.slug) },
          ph[0] ? h('img', { src: ph[0].thumb, alt: '', loading: 'lazy' }) : h('img', { alt: '' }),
          h('span', { class: 't' }, h('strong', {}, p.name), h('span', { class: 'te', lang: 'te' }, p.te),
            h('span', { class: 'meta' }, `${sectionName(p.section)} › ${cat?.name}`),
            h('span', { class: 'meta' },
              h('span', { class: 'badge' + (ph.length ? '' : ' warn') }, ph.length ? `${ph.length} photo${ph.length > 1 ? 's' : ''}` : 'no photo'),
              ph[0]?.stock ? h('span', { class: 'badge' }, 'stock photo') : '',
              p.brands?.length ? h('span', { class: 'badge' }, `${p.brands.length} brand${p.brands.length > 1 ? 's' : ''}`) : ''))))
      }) : [h('li', { class: 'empty' }, 'No products match. Try another word, or add a new product.')]))
    }
    drawList()
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Products'), h('p', {}, 'Click a product to edit it. Changes show in the preview right after you save.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editProduct(null) }, '＋ Add product')),
      h('div', { class: 'toolbar' }, search, sel, count),
      ul,
    )
  }

  function editProduct(slug) {
    const isNew = !slug
    const p = isNew ? { slug: '', name: '', te: '', aliases: [], desc: '', brands: [], category: filters.cat || S.categories[0].slug } : productBySlug(slug)
    const f = {
      name: h('input', { type: 'text', value: p.name, required: true }),
      te: h('input', { type: 'text', value: p.te, lang: 'te', required: true }),
      slug: h('input', { type: 'text', value: p.slug, readonly: !isNew, spellcheck: 'false' }),
      category: catSelect(p.category),
      desc: h('textarea', { rows: 3, value: p.desc }),
      aliases: chipInput(p.aliases || [], 'Type a name and press Enter'),
      brands: chipInput(p.brands || [], 'Type a brand and press Enter'),
      sizes: h('input', { type: 'text', value: p.sizes || '', placeholder: 'e.g. ₹10 packets · 1 kg · 3 kg' }),
      price: h('input', { type: 'text', value: p.price || '', placeholder: 'e.g. ₹30 – ₹45, depending on size' }),
      priceTe: h('input', { type: 'text', value: p.priceTe || '', lang: 'te', placeholder: 'Telugu (optional)' }),
      caution: h('textarea', { rows: 2, value: p.caution || '', placeholder: 'Optional note shown in a yellow box on the product page' }),
      cautionTe: h('textarea', { rows: 2, value: p.cautionTe || '', lang: 'te', placeholder: 'Telugu (optional)' }),
    }
    let slugTouched = !isNew
    f.slug.addEventListener('input', () => (slugTouched = true))
    f.name.addEventListener('input', () => { if (!slugTouched) f.slug.value = slugify(f.name.value) })
    const festChecks = S.festivals.map((fe) => {
      const cb = h('input', { type: 'checkbox', value: fe.id, checked: !isNew && fe.items.includes(p.slug) })
      return h('label', {}, cb, `${fe.name}`)
    })
    const queue = [] // photos chosen before a new product is saved
    const photoBox = h('div')
    let dirty = false
    const markDirty = () => (dirty = true)

    function drawPhotos() {
      if (p.photo) {
        photoBox.replaceChildren(h('p', { class: 'hint' }, `This product shows the photos of "${productBySlug(p.photo)?.name || p.photo}". Edit the photos there.`))
        return
      }
      const list = isNew ? [] : S.photos[p.slug] || []
      const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true })
      const drop = h('label', { class: 'drop', tabindex: '0' }, h('strong', {}, '＋ Add photos'), h('span', {}, 'Click to choose, or drag photos here'), h('span', {}, 'JPG, PNG or WebP'), fileInput)
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() } })
      const take = (files) => addFiles([...files].filter((x) => /^image\/(jpeg|png|webp)$/.test(x.type)))
      fileInput.addEventListener('change', () => take(fileInput.files))
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over') })
      drop.addEventListener('dragleave', () => drop.classList.remove('over'))
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files) })
      const cards = list.map((ph, i) => h('div', { class: 'photo' + (i === 0 ? ' main' : '') },
        h('img', { src: ph.thumb, alt: `Photo ${i + 1}` }),
        i === 0 ? h('span', { class: 'tag' + (ph.stock ? ' stock' : '') }, ph.stock ? 'Main · stock photo' : 'Main photo') : '',
        h('div', { class: 'ops' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Move left', 'aria-label': 'Move left', disabled: i === 0, onclick: () => photoAct('move', { name: ph.name, dir: -1 }) }, '←'),
          i ? h('button', { class: 'btn small', type: 'button', onclick: () => photoAct('main', { name: ph.name }, list[0]?.stock) }, 'Make main') : h('span'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Move right', 'aria-label': 'Move right', disabled: i === list.length - 1, onclick: () => photoAct('move', { name: ph.name, dir: 1 }) }, '→'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Delete photo', 'aria-label': 'Delete photo', onclick: () => photoAct('delete', { name: ph.name }) }, '🗑')),
        ph.hasSource
          ? h('button', { class: 'btn small adjust', type: 'button', onclick: () => openCropper(p.slug, ph, async () => { await load(); drawPhotos() }) }, ph.crop ? '✂ Adjust (custom)' : '✂ Adjust / crop')
          : h('p', { class: 'hint adjust-note' }, 'Stock photo: add your own photo to adjust it')))
      photoBox.replaceChildren(
        h('div', { class: 'photos' }, cards, drop),
        queue.length ? h('div', {}, h('p', { class: 'hint' }, `${queue.length} photo(s) will be added when you save:`), h('div', { class: 'queue' }, queue.map((q) => h('img', { src: q.url, alt: '' })))) : '',
        h('p', { class: 'hint' }, 'The first photo is the main one (used on cards and lists). On the product page people can swipe through all of them.',
          list[0]?.stock ? ' The current main photo is a stock photo; the first photo you add replaces it.' : ''),
      )
    }
    async function addFiles(files) {
      if (!files.length) return
      if (isNew) { for (const file of files) queue.push({ file, url: URL.createObjectURL(file) }); markDirty(); drawPhotos(); return }
      toast(`Adding ${files.length} photo(s)…`)
      for (const file of files) {
        const ok = await act(() => api('POST', `/api/photo/${p.slug}/add?filename=${encodeURIComponent(file.name)}`, undefined, file))
        if (!ok) break
      }
      await load(); drawPhotos(); toast('Photos saved ✓')
    }
    async function photoAct(op, body, replacesStock) {
      if (op === 'delete' && !confirm('Delete this photo?')) return
      if (op === 'main' && replacesStock && !confirm('The stock photo will be removed and this photo becomes the main photo. Continue?')) return
      if (await act(() => api('POST', `/api/photo/${p.slug}/${op}`, body))) { await load(); drawPhotos() }
    }
    drawPhotos()

    const body = h('form', { id: 'pform', oninput: markDirty, onchange: markDirty, onsubmit: (e) => { e.preventDefault(); save() } },
      h('fieldset', {}, h('legend', {}, 'Basics'),
        h('div', { class: 'grid2' },
          field('English name', f.name, null, true),
          field('Telugu name', f.te, null, true)),
        h('div', { class: 'grid2' },
          field('Category', f.category, 'Section (Kirana / Puja Samagri) comes from the category.', true),
          field('Web name (in the link)', f.slug, isNew ? 'Filled in from the English name. Small letters, numbers and dashes. Cannot be changed later.' : 'Cannot be changed.', true)),
        field('Description', f.desc, 'One or two short sentences shown on the product page.', true)),
      h('fieldset', {}, h('legend', {}, 'Photos'), photoBox),
      h('fieldset', {}, h('legend', {}, 'Names people search for'),
        field('Also known as', f.aliases.el, 'Telugu-English spellings, local names, common misspellings. Used by the search box.')),
      h('fieldset', {}, h('legend', {}, 'Brands, sizes & price (optional)'),
        field('Brands at the shop', f.brands.el, 'Shown as buttons on the product page; also searchable.'),
        field('Pack sizes', f.sizes),
        h('div', { class: 'grid2' }, field('Price', f.price, 'Only if you want a price shown.'), field('Price in Telugu', f.priceTe))),
      h('fieldset', {}, h('legend', {}, 'Note for customers (optional)'),
        h('div', { class: 'grid2' }, field('Note', f.caution), field('Note in Telugu', f.cautionTe))),
      h('fieldset', {}, h('legend', {}, 'Suggest this item for festivals'),
        h('div', { class: 'checks' }, festChecks),
        h('p', { class: 'hint' }, 'Ticked festivals show this item in their "Get these for …" list on the home page.')),
    )

    async function save() {
      const product = {
        slug: f.slug.value.trim(), name: f.name.value, te: f.te.value, desc: f.desc.value,
        aliases: f.aliases.get(), brands: f.brands.get(), sizes: f.sizes.value, price: f.price.value, priceTe: f.priceTe.value,
        caution: f.caution.value, cautionTe: f.cautionTe.value, q: p.q, photo: p.photo,
      }
      const festivals = festChecks.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value)
      const r = await act(() => api('POST', '/api/product', { product, category: f.category.value, originalSlug: isNew ? null : p.slug, festivals }))
      if (!r) return
      if (isNew && queue.length) {
        toast(`Saved. Adding ${queue.length} photo(s)…`)
        for (const q of queue) if (!(await act(() => api('POST', `/api/photo/${product.slug}/add?filename=${encodeURIComponent(q.file.name)}`, undefined, q.file)))) break
      }
      dirty = false
      await load()
      toast(isNew ? 'Product added ✓' : 'Saved ✓')
      render()
      editProduct(product.slug)
    }
    async function del() {
      if (!confirm(`Delete "${p.name}" and its photos? This cannot be undone from the editor.`)) return
      if (await act(() => api('DELETE', `/api/product/${p.slug}`), 'Product deleted')) { await load(); closeDrawer(true); render() }
    }
    openDrawer(isNew ? 'Add a product' : `Edit: ${p.name}`, body, [
      h('button', { class: 'btn primary', type: 'submit', form: 'pform' }, isNew ? 'Add product' : 'Save changes'),
      !isNew ? h('a', { class: 'btn', href: productUrl(p), target: '_blank', rel: 'noopener' }, 'View in browser ↗') : '',
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del }, 'Delete product') : '',
    ], () => !dirty || confirm('You have unsaved changes. Close without saving?'))
  }

  // ───────── PHOTO CROP / ADJUST ─────────
  // The "stage" is a square whose side is the photo's longer edge, with the photo centred in it.
  // The crop box {x, y, s} is in fractions (0–1) of the stage side. Areas outside the photo become white.
  function openCropper(slug, ph, done) {
    let rotate = ph.crop?.rotate || 0
    let box = ph.crop ? { x: ph.crop.x, y: ph.crop.y, s: ph.crop.s } : null
    let W = 1, H = 1
    const MIN = 0.05
    const img = h('img', { alt: '', draggable: 'false' })
    const pimg = h('img', { alt: '', draggable: 'false' })
    const frame = h('div', { class: 'crop-box', tabindex: '0', role: 'slider', 'aria-label': 'Crop area. Drag, or use the arrow keys to move and + / − to zoom.' },
      h('span', { class: 'crop-grid' }), h('span', { class: 'crop-handle', 'aria-hidden': 'true' }))
    const stage = h('div', { class: 'crop-stage' }, img, frame)
    const pinner = h('div', { class: 'crop-pinner' }, pimg)
    const preview = h('div', { class: 'crop-preview', 'aria-label': 'Preview' }, pinner)
    const zoom = h('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Zoom' })
    const info = h('p', { class: 'hint' })

    const imgRect = () => { const S = Math.max(W, H); return { w: W / S, h: H / S, x: (1 - W / S) / 2, y: (1 - H / S) / 2 } }
    const fillBox = () => { const r = imgRect(); const s = Math.min(r.w, r.h); return { x: (1 - s) / 2, y: (1 - s) / 2, s } }
    const clamp = () => {
      box.s = Math.min(1, Math.max(MIN, box.s))
      box.x = Math.min(1 - box.s, Math.max(0, box.x))
      box.y = Math.min(1 - box.s, Math.max(0, box.y))
    }
    const place = (el, r) => Object.assign(el.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` })
    function draw() {
      clamp()
      const r = imgRect()
      place(img, r)
      Object.assign(frame.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.s * 100}%`, height: `${box.s * 100}%` })
      // Preview: the stage scaled so the crop box fills the preview square.
      Object.assign(pinner.style, { width: `${100 / box.s}%`, height: `${100 / box.s}%`, left: `${(-box.x / box.s) * 100}%`, top: `${(-box.y / box.s) * 100}%` })
      place(pimg, r)
      zoom.value = String(Math.round(((1 - box.s) / (1 - MIN)) * 1000))
      const outside = box.x < r.x - 0.001 || box.y < r.y - 0.001 || box.x + box.s > r.x + r.w + 0.001 || box.y + box.s > r.y + r.h + 0.001
      info.textContent = outside ? 'Parts outside the photo will be white, which is good for showing a tall or wide pack whole.' : 'Drag the square to choose the part of the photo to show.'
    }
    function loadImage(keepBox) {
      const src = `/photo/source/${ph.name}?rotate=${rotate}`
      img.onload = () => { W = img.naturalWidth; H = img.naturalHeight; if (!keepBox || !box) box = fillBox(); draw() }
      img.src = src; pimg.src = src
    }
    zoom.addEventListener('input', () => {
      const cx = box.x + box.s / 2, cy = box.y + box.s / 2
      box.s = 1 - (Number(zoom.value) / 1000) * (1 - MIN)
      box.x = cx - box.s / 2; box.y = cy - box.s / 2
      draw()
    })
    // Drag to move (pointer events: mouse, touch and pen).
    let drag = null
    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault(); frame.setPointerCapture(e.pointerId)
      const rect = stage.getBoundingClientRect()
      drag = { px: e.clientX, py: e.clientY, x: box.x, y: box.y, s: box.s, size: rect.width, resize: e.target.classList.contains('crop-handle') }
    })
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = (e.clientX - drag.px) / drag.size, dy = (e.clientY - drag.py) / drag.size
      if (drag.resize) { box.s = Math.min(1 - drag.x, 1 - drag.y, Math.max(MIN, drag.s + Math.max(dx, dy))); box.x = drag.x; box.y = drag.y }
      else { box.x = drag.x + dx; box.y = drag.y + dy }
      draw()
    })
    const end = () => (drag = null)
    frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end)
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const cx = box.x + box.s / 2, cy = box.y + box.s / 2; box.s *= e.deltaY > 0 ? 1.06 : 1 / 1.06; box.s = Math.min(1, Math.max(MIN, box.s)); box.x = cx - box.s / 2; box.y = cy - box.s / 2; draw() }, { passive: false })
    frame.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.01
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (k) { e.preventDefault(); box.x += k[0]; box.y += k[1]; draw() }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom.value = String(Math.min(1000, Number(zoom.value) + 25)); zoom.dispatchEvent(new Event('input')) }
      if (e.key === '-') { e.preventDefault(); zoom.value = String(Math.max(0, Number(zoom.value) - 25)); zoom.dispatchEvent(new Event('input')) }
    })

    const root = h('div', { class: 'cropper-backdrop' })
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey, true) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close() } }
    document.addEventListener('keydown', onKey, true)
    const save = async (crop) => {
      const ok = await act(() => api('POST', `/api/photo/${slug}/crop`, { name: ph.name, crop }), crop ? 'Photo adjusted ✓' : 'Back to automatic ✓')
      if (ok) { close(); done() }
    }
    root.append(h('div', { class: 'cropper', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Adjust photo' },
      h('div', { class: 'drawer-head' }, h('h2', {}, 'Adjust photo'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'cropper-body' },
        h('div', {}, stage, info),
        h('div', { class: 'cropper-side' },
          h('p', { class: 'side-h' }, 'How it will look'), preview,
          h('label', { class: 'field' }, h('span', {}, 'Zoom'), zoom),
          h('div', { class: 'crop-tools' },
            h('button', { class: 'btn small', type: 'button', onclick: () => { rotate = (rotate + 270) % 360; loadImage(false) } }, '↺ Rotate'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { rotate = (rotate + 90) % 360; loadImage(false) } }, '↻ Rotate'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { box = { x: 0, y: 0, s: 1 }; draw() } }, 'Show whole photo'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { box = fillBox(); draw() } }, 'Fill the square')),
          h('p', { class: 'hint' }, 'Tip: scroll the mouse wheel over the photo to zoom; drag the corner of the square to resize it.'))),
      h('div', { class: 'drawer-foot' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => save({ rotate, ...box }) }, 'Save'),
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
        h('span', { class: 'spacer' }),
        ph.crop ? h('button', { class: 'btn', type: 'button', onclick: () => save(null) }, 'Reset to automatic') : '')))
    document.body.append(root)
    loadImage(true)
    setTimeout(() => frame.focus(), 50)
  }

  // ───────── CATEGORIES ─────────
  function renderCategories() {
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Categories'), h('p', {}, 'Groups of products. Use ↑ ↓ to change the order they appear on the website.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editCategory(null) }, '＋ Add category')),
      h('div', {}, S.sections.map((s) => {
        const cats = S.categories.filter((c) => c.section === s.slug)
        return [h('h2', { class: 'group-h' }, `${s.name} · ${s.te}`), h('div', { class: 'cards' }, cats.map((c, i) => h('div', { class: 'row-card' },
          h('div', { class: 't' }, h('strong', {}, `${c.name} · `, h('span', { lang: 'te' }, c.te)),
            h('span', {}, c.products.length ? `${c.products.length} products · ${c.blurb}` : 'Empty: not shown on the website until you add a product'),
            !c.products.length ? h('span', { class: 'badge warn' }, 'empty') : ''),
          h('div', { class: 'acts' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => moveCat(c.slug, -1) }, '↑'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === cats.length - 1, onclick: () => moveCat(c.slug, 1) }, '↓'),
            c.products.length ? h('a', { class: 'btn small', href: `${PREVIEW()}/${c.section}/${c.slug}/`, target: '_blank', rel: 'noopener' }, 'View ↗') : '',
            h('button', { class: 'btn small', type: 'button', onclick: () => { filters = { q: '', cat: c.slug }; switchTab('products') } }, 'Products'),
            h('button', { class: 'btn small', type: 'button', onclick: () => editCategory(c.slug) }, 'Edit')))))]
      })),
    )
  }
  async function moveCat(slug, dir) { if (await act(() => api('POST', `/api/category/${slug}/move`, { dir }))) { await load(); render() } }
  function editCategory(slug) {
    const isNew = !slug
    const c = isNew ? { section: S.sections[0].slug, slug: '', name: '', te: '', blurb: '' } : S.categories.find((x) => x.slug === slug)
    const f = {
      section: h('select', {}, S.sections.map((s) => h('option', { value: s.slug, selected: s.slug === c.section }, s.name))),
      name: h('input', { type: 'text', value: c.name }), te: h('input', { type: 'text', value: c.te, lang: 'te' }),
      slug: h('input', { type: 'text', value: c.slug, readonly: !isNew }), blurb: h('textarea', { rows: 2, value: c.blurb }),
    }
    let touched = !isNew
    f.slug.addEventListener('input', () => (touched = true))
    f.name.addEventListener('input', () => { if (!touched) f.slug.value = slugify(f.name.value) })
    if (!isNew) f.section.disabled = c.products.length > 0
    const save = async () => {
      if (await act(() => api('POST', '/api/category', { category: { section: f.section.value, slug: f.slug.value, name: f.name.value, te: f.te.value, blurb: f.blurb.value }, originalSlug: isNew ? null : c.slug }), 'Saved ✓')) { await load(); closeDrawer(true); render() }
    }
    const del = async () => {
      if (!confirm(`Delete the category "${c.name}"?`)) return
      if (await act(() => api('DELETE', `/api/category/${c.slug}`), 'Category deleted')) { await load(); closeDrawer(true); render() }
    }
    openDrawer(isNew ? 'Add a category' : `Edit category: ${c.name}`, h('form', { id: 'cform', onsubmit: (e) => { e.preventDefault(); save() } },
      h('fieldset', {}, h('legend', {}, 'Category'),
        field('Section', f.section, !isNew && c.products.length ? 'Empty the category to move it to the other section.' : null, true),
        h('div', { class: 'grid2' }, field('English name', f.name, null, true), field('Telugu name', f.te, null, true)),
        field('Web name (in the link)', f.slug, isNew ? 'Filled in from the English name. Cannot be changed later.' : 'Cannot be changed.', true),
        field('Short description', f.blurb, 'Shown under the category title.', true))), [
      h('button', { class: 'btn primary', type: 'submit', form: 'cform' }, isNew ? 'Add category' : 'Save changes'),
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del, disabled: c.products.length > 0, title: c.products.length ? 'Only empty categories can be deleted' : '' }, 'Delete category') : '',
    ])
  }

  // ───────── FESTIVALS ─────────
  const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const nextOcc = (fe) => fe.dates.find((o) => o[o.length - 1][0] >= todayIST())
  const shiftDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const fmt = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  function renderFestivals() {
    const sorted = [...S.festivals].sort((a, b) => (nextOcc(a)?.[0][0] || '9999').localeCompare(nextOcc(b)?.[0][0] || '9999'))
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Festivals'), h('p', {}, 'The home page shows the next festival automatically: suggested items before it, and a greeting on the day.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editFestival(null) }, '＋ Add festival')),
      h('div', { class: 'cards' }, sorted.map((fe) => {
        const occ = nextOcc(fe)
        return h('div', { class: 'row-card fest-card', style: `--c1:${fe.colors[0]}` },
          h('div', { class: 't' }, h('strong', {}, `${fe.name} · `, h('span', { lang: 'te' }, fe.te)),
            h('span', {}, occ ? `Next: ${fmt(occ[0][0])}${occ.length > 1 ? ` – ${fmt(occ[occ.length - 1][0])}` : ''} · shown ${fe.lead} days before · ${fe.items.length} items` : 'No upcoming date: add next year’s date'),
            !occ ? h('span', { class: 'badge warn' }, 'needs a new date') : ''),
          h('div', { class: 'acts' },
            occ ? h('a', { class: 'btn small', href: `${PREVIEW()}/?fest-date=${occ[0][0]}`, target: '_blank', rel: 'noopener' }, 'Preview ↗') : '',
            h('button', { class: 'btn small', type: 'button', onclick: () => editFestival(fe.id) }, 'Edit')))
      })),
    )
  }

  function editFestival(id) {
    const isNew = !id
    const src = isNew
      ? { id: '', name: '', te: '', colors: ['#70413b', '#c58a2b'], lead: 10, before: { title: '', titleTe: '', text: '' }, day: { title: '', titleTe: '', text: '' }, items: [], dates: [[['', '', '']]] }
      : JSON.parse(JSON.stringify(S.festivals.find((x) => x.id === id)))
    const fe = src
    let dirty = false
    const inp = (v, attrs = {}) => h('input', { type: 'text', value: v || '', ...attrs })
    const f = {
      name: inp(fe.name), te: inp(fe.te, { lang: 'te' }), id: inp(fe.id, { readonly: !isNew }),
      c1: h('input', { type: 'color', value: fe.colors[0] }), c2: h('input', { type: 'color', value: fe.colors[1] }),
      lead: h('input', { type: 'number', min: 0, max: 60, value: fe.lead }),
      season: h('input', { type: 'checkbox', checked: !!fe.season }),
      note: inp(fe.note),
      bt: inp(fe.before.title), bte: inp(fe.before.titleTe, { lang: 'te' }), btx: h('textarea', { rows: 3, value: fe.before.text }),
      dt: inp(fe.day.title), dte: inp(fe.day.titleTe, { lang: 'te' }), dtx: h('textarea', { rows: 3, value: fe.day.text }),
    }
    let touched = !isNew
    f.id.addEventListener('input', () => (touched = true))
    f.name.addEventListener('input', () => { if (!touched) f.id.value = slugify(f.name.value) })

    // ── Banner design ──
    const bn = { pattern: 'dots', decor: '', dim: 45, itemsTitle: '', waText: '', hideCall: false, ...(fe.banner || {}) }
    const PRESETS = [['Diya maroon', '#4a1a15', '#c58a2b'], ['Sankranti orange', '#b4451c', '#e8a33a'], ['Temple red', '#a3122a', '#e0782f'], ['Lakshmi pink', '#9c1f4d', '#d9a13b'],
      ['Saffron', '#c2410c', '#f0b429'], ['Mango leaf', '#2f6b3a', '#a9b83a'], ['Shiva blue', '#1f2a4d', '#55658f'], ['Karthika night', '#24204d', '#b8792a'], ['Forest', '#23402f', '#c5a66a'], ['Royal purple', '#4b1d5e', '#d4a24c']]
    const DECORS = ['', '🪔', '🕉️', '🌺', '🌼', '🪷', '🌾', '🪁', '🥥', '🐘', '🔱', '🏹', '🌙', '✨', '🎉', '🍬']
    const PATTERN_LABELS = [['dots', 'Dots'], ['sparkle', 'Sparkles'], ['waves', 'Waves'], ['rangoli', 'Rangoli'], ['none', 'Plain']]
    const b = {
      pattern: h('select', { 'aria-label': 'Background pattern' }, PATTERN_LABELS.map(([v, l]) => h('option', { value: v, selected: bn.pattern === v }, l))),
      decor: h('input', { type: 'text', value: bn.decor, maxlength: 8, placeholder: 'or type an emoji', 'aria-label': 'Decoration symbol', style: 'max-width:140px' }),
      dim: h('input', { type: 'range', min: 0, max: 80, value: bn.dim, 'aria-label': 'Photo darkness' }),
      itemsTitle: inp(bn.itemsTitle, { placeholder: fe.season ? 'For the month' : `Get these for ${fe.name || '…'}` }),
      waText: inp(bn.waText, { placeholder: `Send your ${fe.name || '…'} list` }),
      hideCall: h('input', { type: 'checkbox', checked: !!bn.hideCall }),
    }
    let bannerImg = (!isNew && S.festImages?.[fe.id]) || ''
    const decorBtns = h('div', { class: 'decor-picks' }, DECORS.map((d) => h('button', { type: 'button', class: 'decor-pick', 'aria-label': d ? `Use ${d}` : 'No decoration', onclick: () => { b.decor.value = d; dirty = true; drawPv() } }, d || 'None')))
    const presetBtns = h('div', { class: 'preset-picks' }, PRESETS.map(([label, c1, c2]) => h('button', { type: 'button', class: 'preset-pick', title: label, 'aria-label': `Colours: ${label}`, style: `background:linear-gradient(135deg, ${c1} 0 55%, ${c2} 55%)`, onclick: () => { f.c1.value = c1; f.c2.value = c2; dirty = true; drawPv() } })))
    const imgInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true })
    const imgBox = h('div', { class: 'banner-img' })
    function drawImgBox() {
      imgBox.replaceChildren(
        bannerImg ? h('img', { src: bannerImg, alt: 'Banner photo' }) : '',
        h('div', { class: 'banner-img-acts' },
          isNew ? h('span', { class: 'hint' }, 'Save the festival first, then add a background photo.')
            : h('button', { class: 'btn small', type: 'button', onclick: () => imgInput.click() }, bannerImg ? 'Change photo' : '＋ Add background photo'),
          bannerImg ? h('button', { class: 'btn small danger', type: 'button', onclick: removeImg }, 'Remove photo') : ''),
        bannerImg ? field('Darken the photo (so the text stays readable)', b.dim) : '')
    }
    imgInput.addEventListener('change', async () => {
      const file = imgInput.files[0]; imgInput.value = ''
      if (!file) return
      toast('Adding banner photo…')
      if (await act(() => api('POST', `/api/festival-image/${fe.id}`, undefined, file), 'Banner photo saved ✓')) { await load(); bannerImg = S.festImages?.[fe.id] || ''; drawImgBox(); drawPv() }
    })
    async function removeImg() {
      if (!confirm('Remove the banner photo?')) return
      if (await act(() => api('DELETE', `/api/festival-image/${fe.id}`), 'Banner photo removed')) { await load(); bannerImg = ''; drawImgBox(); drawPv() }
    }
    drawImgBox()

    // Live preview, close to the website banner
    const pv = h('div', { class: 'fest-preview' })
    const pvMode = { day: false }
    const pvToggle = h('div', { class: 'seg' },
      h('button', { type: 'button', 'aria-pressed': 'true', onclick: (e) => { pvMode.day = false; setSeg(e.target); drawPv() } }, 'Before the festival'),
      h('button', { type: 'button', 'aria-pressed': 'false', onclick: (e) => { pvMode.day = true; setSeg(e.target); drawPv() } }, 'On the day'))
    const setSeg = (btn) => [...pvToggle.children].forEach((x) => x.setAttribute('aria-pressed', String(x === btn)))
    function drawPv() {
      const c1 = f.c1.value, c2 = f.c2.value
      pv.className = `fest-preview pat-${b.pattern.value}${bannerImg ? ' has-img' : ''}`
      pv.style.cssText = `--c1:${c1};--c2:${c2};--dim:${Number(b.dim.value) / 100};${bannerImg ? `--img:url('${bannerImg}')` : ''}`
      const name = f.name.value || 'Festival'
      const thumbs = items.slice(0, 4).map((slug) => { const p = productBySlug(slug); return h('img', { src: thumbOf(p?.photo || slug), alt: '' }) })
      pv.replaceChildren(
        b.decor.value ? h('span', { class: 'pv-decor', 'aria-hidden': 'true' }, b.decor.value) : '',
        h('div', { class: 'pv-copy' },
          h('small', { class: 'pv-pill' + (pvMode.day ? ' day' : '') }, pvMode.day ? `Today · ${name}` : 'In 5 days'),
          h('strong', {}, (pvMode.day ? f.dt.value : f.bt.value) || 'Festival title'),
          h('span', { class: 'pv-te', lang: 'te' }, pvMode.day ? f.dte.value : f.bte.value),
          h('span', { class: 'pv-text' }, pvMode.day ? f.dtx.value : f.btx.value),
          h('span', { class: 'pv-btns' }, h('span', { class: 'pv-btn gold' }, b.waText.value || `Send your ${name} list`), b.hideCall.checked ? '' : h('span', { class: 'pv-btn' }, 'Call'))),
        h('div', { class: 'pv-items' }, h('span', { class: 'pv-items-h' }, b.itemsTitle.value || (f.season.checked ? 'For the month' : `Get these for ${name}`)), h('span', { class: 'pv-thumbs' }, thumbs)))
    }
    for (const x of [f.c1, f.c2, f.name, f.bt, f.bte, f.btx, f.dt, f.dte, f.dtx, b.pattern, b.decor, b.dim, b.itemsTitle, b.waText, b.hideCall, f.season]) {
      x.addEventListener('input', drawPv); x.addEventListener('change', drawPv)
    }

    // items
    let items = [...fe.items]
    const itemsUl = h('ul', { class: 'items-list' })
    const pickIn = h('input', { type: 'search', placeholder: 'Search a product to add…', 'aria-label': 'Add a suggested item' })
    const pickRes = h('ul', { class: 'picker-results', hidden: true })
    function drawItems() {
      itemsUl.replaceChildren(...items.map((slug, i) => {
        const p = productBySlug(slug)
        return h('li', {}, h('img', { src: thumbOf(p?.photo || slug), alt: '' }), h('span', { class: 'n' }, p ? `${p.name} · ${p.te}` : slug),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; dirty = true; drawItems() } }, '↑'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; dirty = true; drawItems() } }, '↓'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: () => { items.splice(i, 1); dirty = true; drawItems() } }, '×'))
      }))
      drawPv()
    }
    pickIn.addEventListener('input', () => {
      const q = norm(pickIn.value)
      if (!q) { pickRes.hidden = true; return }
      const res = products().filter((p) => !items.includes(p.slug) && [p.name, p.te, ...(p.aliases || [])].some((x) => norm(x).includes(q))).slice(0, 12)
      pickRes.replaceChildren(...(res.length ? res.map((p) => h('li', {}, h('button', { type: 'button', onclick: () => { items.push(p.slug); dirty = true; pickIn.value = ''; pickRes.hidden = true; drawItems(); pickIn.focus() } },
        h('img', { src: thumbOf(p.photo || p.slug), alt: '' }), `${p.name} · ${p.te}`))) : [h('li', { class: 'hint', style: 'padding:8px' }, 'No match')]))
      pickRes.hidden = false
    })
    pickIn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); pickRes.hidden = true } })
    drawItems()

    // dates
    let dates = fe.dates.map((o) => o.map((r) => [...r]))
    const datesBox = h('div')
    function drawDates() {
      datesBox.replaceChildren(...dates.map((occ, oi) => h('div', { class: 'occ' },
        h('div', { class: 'occ-head' }, `${occ[0]?.[0]?.slice(0, 4) || 'New'} ${f.season.checked ? '(first day, special days, last day)' : ''}`,
          h('button', { class: 'btn small danger', type: 'button', onclick: () => { if (confirm('Remove these dates?')) { dates.splice(oi, 1); dirty = true; drawDates() } } }, 'Remove')),
        h('div', { class: 'drow drow-head' }, h('span', {}, 'Date'), h('span', {}, 'Day name'), h('span', {}, 'Telugu'), h('span', {}, 'Special greeting (optional)'), h('span')),
        occ.map((r, ri) => h('div', { class: 'drow' },
          h('input', { type: 'date', value: r[0], 'aria-label': 'Date', oninput: (e) => { r[0] = e.target.value; dirty = true } }),
          h('input', { type: 'text', value: r[1], placeholder: 'e.g. Deepavali', 'aria-label': 'Day name', oninput: (e) => { r[1] = e.target.value; dirty = true } }),
          h('input', { type: 'text', value: r[2], lang: 'te', placeholder: 'e.g. దీపావళి', 'aria-label': 'Telugu day name', oninput: (e) => { r[2] = e.target.value; dirty = true } }),
          h('input', { type: 'text', value: r[3] || '', placeholder: 'e.g. Happy Dasara!', 'aria-label': 'Special greeting', oninput: (e) => { r[3] = e.target.value; dirty = true } }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove day', onclick: () => { occ.splice(ri, 1); if (!occ.length) dates.splice(oi, 1); dirty = true; drawDates() } }, '×'))),
        h('button', { class: 'btn small', type: 'button', onclick: () => { const last = occ[occ.length - 1]; occ.push([nextDay(last?.[0]), last?.[1] || '', last?.[2] || '']); dirty = true; drawDates() } }, '＋ Add a day'))),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const last = dates[dates.length - 1]
        dates.push(last ? last.map((r) => [plusYear(r[0]), r[1], r[2], ...(r[3] ? [r[3]] : [])]) : [['', fe.name || '', fe.te || '']])
        dirty = true; drawDates()
        toast('Copied with dates +1 year. Please correct the dates from the panchangam.')
      } }, '＋ Add next year (copy and change dates)'))
    }
    const nextDay = (iso) => (iso ? shiftDays(iso, 1) : '')
    const plusYear = (iso) => (iso ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}` : '')
    f.season.addEventListener('change', drawDates)
    drawDates()

    const body = h('form', { id: 'fform', oninput: () => (dirty = true), onsubmit: (e) => { e.preventDefault(); save() } },
      h('fieldset', {}, h('legend', {}, 'Festival'),
        h('div', { class: 'grid2' }, field('English name', f.name, null, true), field('Telugu name', f.te, null, true)),
        h('div', { class: 'grid2' },
          field('Web name', f.id, isNew ? 'Filled in from the name. Cannot be changed later.' : 'Cannot be changed.', true),
          field('Show items how many days before?', f.lead, '0 = only on the festival day(s).', true)),
        h('label', { class: 'check' }, f.season, 'This is a month-long season (like Karthika Masam), not a one-day festival'),
        field('Private note (not shown on the site)', f.note)),
      h('fieldset', {}, h('legend', {}, 'Banner design'),
        h('div', { class: 'pv-wrap' }, pvToggle, pv),
        h('div', { class: 'field' }, h('span', {}, 'Colours'), presetBtns, h('div', { class: 'colors' }, h('label', {}, f.c1, ' Main colour'), h('label', {}, f.c2, ' Glow / highlight'))),
        h('div', { class: 'grid2' },
          field('Background pattern', b.pattern),
          h('div', { class: 'field' }, h('span', {}, 'Decoration symbol'), decorBtns, b.decor)),
        h('div', { class: 'field' }, h('span', {}, 'Background photo (optional)'), imgBox, imgInput),
        h('div', { class: 'grid2' },
          field('Heading above the items', b.itemsTitle, 'Leave empty for the standard text.'),
          field('WhatsApp button text', b.waText, 'Leave empty for the standard text.')),
        h('label', { class: 'check' }, b.hideCall, 'Hide the Call button on this banner')),
      h('fieldset', {}, h('legend', {}, 'Before the festival'),
        h('div', { class: 'grid2' }, field('Title', f.bt, 'e.g. "Deepavali is coming. Light up your home!"', true), field('Telugu line', f.bte, null, true)),
        field('Text', f.btx, 'What to buy, in one or two sentences.', true)),
      h('fieldset', {}, h('legend', {}, 'On the festival day'),
        h('div', { class: 'grid2' }, field('Greeting', f.dt, 'e.g. "Happy Deepavali!"', true), field('Telugu greeting', f.dte, 'e.g. "దీపావళి శుభాకాంక్షలు!"', true)),
        field('Text', f.dtx, null, true)),
      h('fieldset', {}, h('legend', {}, 'Suggested items'), h('div', { class: 'picker' }, pickIn, pickRes), itemsUl),
      h('fieldset', {}, h('legend', {}, 'Dates'), h('p', { class: 'hint' }, 'Add one block per year. Take the dates from a Telugu panchangam.'), datesBox),
    )

    async function save() {
      const festival = {
        id: f.id.value.trim(), name: f.name.value, te: f.te.value, colors: [f.c1.value, f.c2.value], lead: Number(f.lead.value),
        season: f.season.checked, note: f.note.value,
        banner: { pattern: b.pattern.value, decor: b.decor.value, dim: Number(b.dim.value), itemsTitle: b.itemsTitle.value, waText: b.waText.value, hideCall: b.hideCall.checked },
        before: { title: f.bt.value, titleTe: f.bte.value, text: f.btx.value }, day: { title: f.dt.value, titleTe: f.dte.value, text: f.dtx.value },
        items, dates,
      }
      if (await act(() => api('POST', '/api/festival', { festival, originalId: isNew ? null : fe.id }), isNew ? 'Festival added ✓' : 'Saved ✓')) {
        dirty = false; await load(); render(); editFestival(festival.id)
      }
    }
    async function del() {
      if (!confirm(`Delete the festival "${fe.name}"?`)) return
      if (await act(() => api('DELETE', `/api/festival/${fe.id}`), 'Festival deleted')) { await load(); closeDrawer(true); render() }
    }
    const occ = !isNew && nextOcc(fe)
    openDrawer(isNew ? 'Add a festival' : `Edit festival: ${fe.name}`, body, [
      h('button', { class: 'btn primary', type: 'submit', form: 'fform' }, isNew ? 'Add festival' : 'Save changes'),
      occ ? h('a', { class: 'btn', href: `${PREVIEW()}/?fest-date=${occ[0][0]}`, target: '_blank', rel: 'noopener' }, 'Preview festival day ↗') : '',
      occ && fe.lead ? h('a', { class: 'btn', href: `${PREVIEW()}/?fest-date=${shiftDays(occ[0][0], -Math.min(fe.lead, 3))}`, target: '_blank', rel: 'noopener' }, 'Preview days before ↗') : '',
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del }, 'Delete festival') : '',
    ], () => !dirty || confirm('You have unsaved changes. Close without saving?'))
  }

  // ───────── PUBLISH TO THE LIVE WEBSITE ─────────
  async function openPublish() {
    let info
    try { info = await api('GET', '/api/publish') } catch (e) { toast(e.message, true); return }
    const note = h('input', { type: 'text', maxlength: 120, placeholder: 'e.g. Added Santoor photos, new Diwali items' })
    const stepsBox = h('ol', { class: 'pub-steps' })
    const result = h('div')
    const go = h('button', { class: 'btn gold', type: 'button' }, '🚀 Publish now')
    const sum = info.summary || { files: 0, lines: [] }
    const nothing = !sum.files && !info.running
    const body = h('div', { class: 'publish' },
      info.running ? '' : nothing
        ? h('div', { class: 'empty' }, 'Everything is already live. There are no new changes to publish.')
        : h('div', {},
          h('p', {}, h('strong', {}, 'These changes will go live on '), h('a', { href: info.liveUrl, target: '_blank', rel: 'noopener' }, 'shop.myconnect.sbs'), h('strong', {}, ':')),
          h('ul', { class: 'pub-sum' }, sum.lines.length ? sum.lines.map((l) => h('li', {}, l)) : h('li', {}, `${sum.files} file(s) changed`)),
          h('p', { class: 'hint' }, 'Tip: check everything with "View in browser" first. Before publishing, the website is rebuilt and checked automatically. If anything is wrong, nothing is published.'),
          field('Short note about this update (optional)', note, 'Saved with this version, so you can find it later.')),
      stepsBox, result)
    const drawSteps = (p) => {
      stepsBox.replaceChildren(...p.steps.map((s) => h('li', { class: `pub-step ${s.status}` },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, { running: '⏳', done: '✅', error: '❌', warn: '⚠️' }[s.status] || '•'),
        h('span', {}, h('strong', {}, s.label), s.detail ? h('span', { class: 'pub-detail' }, s.detail) : ''))))
      if (p.error) result.replaceChildren(h('p', { class: 'pub-error' }, p.error))
      else if (p.live === 'live') result.replaceChildren(h('p', { class: 'pub-ok' }, '🎉 Your changes are live! ', h('a', { href: p.liveUrl || 'https://shop.myconnect.sbs/', target: '_blank', rel: 'noopener' }, 'Open shop.myconnect.sbs ↗')))
      else if (p.live === 'slow') result.replaceChildren(h('p', { class: 'pub-error' }, 'Uploaded, but the live site has not updated yet. Open Cloudflare → Workers & Pages → janardhan-general-stores → Deployments to see why.'))
      else result.replaceChildren()
    }
    let timer
    const poll = async () => {
      try {
        const p = await api('GET', '/api/publish')
        drawSteps(p)
        const busy = p.running || p.live === 'deploying'
        go.disabled = busy
        go.textContent = busy ? 'Publishing…' : '🚀 Publish now'
        if (busy && !$('#drawer').hidden) timer = setTimeout(poll, 1500)
        else { await load(); renderStatus(S.build, S.changes) }
      } catch { timer = setTimeout(poll, 3000) }
    }
    go.addEventListener('click', async () => {
      if (!confirm('Publish these changes to the live website now?')) return
      go.disabled = true
      if (await act(() => api('POST', '/api/publish', { note: note.value }))) { clearTimeout(timer); poll() } else go.disabled = false
    })
    openDrawer('Publish to the live website', body, [
      nothing ? '' : go,
      h('a', { class: 'btn', href: PREVIEW(), target: '_blank', rel: 'noopener' }, 'View in browser first ↗'),
      h('span', { class: 'spacer' }),
      h('a', { class: 'btn', href: info.liveUrl, target: '_blank', rel: 'noopener' }, 'Open live site ↗'),
    ])
    drawSteps(info)
    if (info.running || info.live === 'deploying') poll()
  }
  $('#publish').addEventListener('click', openPublish)

  // ───────── HELP ─────────
  function renderHelp() {
    $('#main').replaceChildren(h('div', { class: 'help' },
      h('h2', {}, 'How this editor works'),
      h('p', {}, 'This editor runs only on this computer. It changes the website’s files here and rebuilds a preview automatically after every save.'),
      h('ol', {},
        h('li', {}, 'Add or edit products, photos, categories and festivals here.'),
        h('li', {}, 'Click ', h('strong', {}, 'View in browser'), ' (top right) to check the website exactly as visitors will see it.'),
        h('li', {}, 'When you are happy, ask Claude to ', h('strong', {}, 'review and push'), '. Only then do the changes go live on shop.myconnect.sbs.')),
      h('h2', {}, 'Photos'),
      h('ul', {},
        h('li', {}, 'Add several photos per product. The first one is the main photo (cards, lists, search).'),
        h('li', {}, 'Use ← → to reorder, ', h('strong', {}, 'Make main'), ' to move a photo to the front, 🗑 to delete.'),
        h('li', {}, 'Photos are cropped to a square automatically; tall or wide pack shots are fitted whole so labels are not cut off.'),
        h('li', {}, 'Use your own photos or brand pack shots. Avoid copying photos from shopping websites.')),
      h('h2', {}, 'Festivals'),
      h('ul', {},
        h('li', {}, 'Each festival has its suggested items, a "before" message, a festival-day greeting, and dates for each year.'),
        h('li', {}, h('strong', {}, 'Once a year'), ', open each festival and click "Add next year", then correct the dates from the panchangam. Festivals without an upcoming date are marked "needs a new date".'),
        h('li', {}, 'Preview any day by opening ', h('code', {}, `${PREVIEW()}/?fest-date=2027-01-14`), '.')),
      h('h2', {}, 'Closing'),
      h('p', {}, 'Close the black editor window (or press Ctrl+C in it) when you are done. Your changes are already saved.'),
    ))
  }

  // ───────── tabs ─────────
  function render() {
    if (!S) return
    ;({ products: renderProducts, categories: renderCategories, festivals: renderFestivals, help: renderHelp })[tab]()
  }
  function switchTab(t) {
    tab = t
    document.querySelectorAll('[data-tab]').forEach((b) => (b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')))
    render()
    $('#main').focus({ preventScroll: true })
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)))
  $('#view-site').addEventListener('click', () => { api('POST', '/api/preview', {}).catch(() => {}) })

  load().then(() => { render(); pollBuild() }).catch((e) => {
    $('#main').replaceChildren(h('div', { class: 'empty' }, `Could not load the editor data: ${e.message}. Is the editor window still open?`))
  })
})()
