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

  // ───────── TYPES (e.g. Detergent Powder, Toor Dal) ─────────
  function renderTypes() {
    const search = h('input', { type: 'search', placeholder: 'Search types by name, Telugu name or other names…', value: filters.q, 'aria-label': 'Search types' })
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
      count.textContent = `${rows.length} of ${products().length} types`
      ul.replaceChildren(...(rows.length ? rows.map((p) => {
        const ph = S.photos[p.slug] || []
        const cat = S.categories.find((c) => c.slug === p.category)
        return h('li', {}, h('button', { class: 'pitem', type: 'button', onclick: () => editType(p.slug) },
          ph[0] ? h('img', { src: ph[0].thumb, alt: '', loading: 'lazy' }) : h('img', { alt: '' }),
          h('span', { class: 't' }, h('strong', {}, p.name), h('span', { class: 'te', lang: 'te' }, p.te),
            h('span', { class: 'meta' }, `${sectionName(p.section)} › ${cat?.name}`),
            h('span', { class: 'meta' },
              h('span', { class: 'badge' + (ph.length ? '' : ' warn') }, ph.length ? `${ph.length} photo${ph.length > 1 ? 's' : ''}` : 'no photo'),
              ph[0]?.stock ? h('span', { class: 'badge' }, 'stock photo') : '',
              h('span', { class: 'badge' + (skusOfType(p.slug).length ? ' qty' : ' warn') }, `${skusOfType(p.slug).length} product${skusOfType(p.slug).length === 1 ? '' : 's'}`)))))
      }) : [h('li', { class: 'empty' }, 'No types match. Try another word, or add a new type.')]))
    }
    drawList()
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Types of products'), h('p', {}, 'A type groups the products customers look for, e.g. “Detergent Powder” holds Tide, Rin and Ariel in every size. It has the photo, Telugu name, description and other names for search.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editType(null) }, '＋ Add type')),
      h('div', { class: 'toolbar' }, search, sel, count),
      ul,
    )
  }

  function editType(slug) {
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
    const alsoChecks = S.sections.map((sec) => h('div', { class: 'also-sec' }, h('p', { class: 'sd-h' }, sec.name),
      h('div', { class: 'checks' }, S.categories.filter((c) => c.section === sec.slug).map((c) => h('label', { 'data-cat': c.slug }, h('input', { type: 'checkbox', value: c.slug, checked: (p.alsoIn || []).includes(c.slug) }), c.name)))))
    const syncAlso = () => alsoChecks.forEach((d) => d.querySelectorAll('label').forEach((l) => { const own = l.dataset.cat === f.category.value; l.hidden = own; if (own) l.querySelector('input').checked = false }))
    f.category.addEventListener('change', syncAlso); syncAlso()
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
          : h('p', { class: 'hint adjust-note' }, 'Stock photo: add your own photo to adjust it'),
        ''))
      photoBox.replaceChildren(
        h('div', { class: 'photos' }, cards, drop),
        queue.length ? h('div', {}, h('p', { class: 'hint' }, `${queue.length} photo(s) will be added when you save:`), h('div', { class: 'queue' }, queue.map((q) => h('img', { src: q.url, alt: '' })))) : '',
        h('p', { class: 'hint' }, 'The first photo is the main one (used on cards and lists). On the product page people can swipe through all of them.',
          list[0]?.stock ? ' The current main photo is a stock photo; the first photo you add replaces it.' : ''),
      )
    }
    // "Brand in this photo": search shows this photo when someone looks for that brand (e.g. Cinthol → the Cinthol photo).
    function brandPick(ph, i) {
      const saved = productBySlug(p.slug)?.brands || []
      if (isNew || !saved.length) return ''
      const cur = productBySlug(p.slug)?.photoBrands?.[i] || ''
      const sel = h('select', { 'aria-label': `Brand shown in photo ${i + 1}`, onchange: async (e) => {
        e.stopPropagation()
        if (await act(() => api('POST', `/api/photo/${p.slug}/brand`, { name: ph.name, brand: sel.value }), sel.value ? `Photo ${i + 1} = ${sel.value} ✓` : 'Photo marked as general ✓')) { await load(); drawPhotos() }
      } }, h('option', { value: '' }, 'General / all brands'), saved.map((b) => h('option', { value: b, selected: b === cur }, b)))
      sel.addEventListener('input', (e) => e.stopPropagation())
      return h('label', { class: 'pbrand' }, 'Brand in this photo', sel)
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
      h('fieldset', {}, h('legend', {}, 'Also show in (optional)'),
        h('p', { class: 'hint' }, 'For items used both ways, e.g. Ghee (Kirana › Cooking Oils) also in Puja Samagri › Deepam & Oil. The item keeps one page, and it is also listed in the ticked categories and found by search in their section.'),
        alsoChecks),
      h('fieldset', {}, h('legend', {}, 'Photos'), photoBox),
      h('fieldset', {}, h('legend', {}, 'Names people search for'),
        field('Also known as', f.aliases.el, 'Telugu-English spellings, local names, common misspellings. Used by the search box.')),
      !isNew ? h('fieldset', {}, h('legend', {}, `Products of this type (${skusOfType(p.slug).length})`),
        h('ul', { class: 'sib-list' }, skusOfType(p.slug).map((x) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => { closeDrawer(true); editSku(x.id) } }, `${x.name}${x.size ? ' · ' + x.size : ''}${x.brand ? ' — ' + brandName(x.brand) : ''}${x.off ? ' (out of stock)' : ''}`)))),
        h('button', { class: 'btn small', type: 'button', onclick: () => { closeDrawer(true); editSku(null, { type: p.slug }) } }, '＋ Add a product of this type')) : h('p', { class: 'hint' }, 'After saving the type, add its products (brands and sizes) in the Products tab.'),
      h('fieldset', {}, h('legend', {}, 'Price note (optional)'),
        h('div', { class: 'grid2' }, field('Price note', f.price, 'Only for a general note like “₹30 – ₹45, depending on size”. Set exact prices on each product.'), field('Price note in Telugu', f.priceTe))),
      h('fieldset', {}, h('legend', {}, 'Note for customers (optional)'),
        h('div', { class: 'grid2' }, field('Note', f.caution), field('Note in Telugu', f.cautionTe))),
      h('fieldset', {}, h('legend', {}, 'Suggest this item for festivals'),
        h('div', { class: 'checks' }, festChecks),
        h('p', { class: 'hint' }, 'Ticked festivals show this item in their "Get these for …" list on the home page.')),
    )

    async function save() {
      const product = {
        slug: f.slug.value.trim(), name: f.name.value, te: f.te.value, desc: f.desc.value,
        aliases: f.aliases.get(), price: f.price.value, priceTe: f.priceTe.value,
        caution: f.caution.value, cautionTe: f.cautionTe.value, q: p.q, photo: p.photo,
        alsoIn: alsoChecks.flatMap((d) => [...d.querySelectorAll('input:checked')].map((c) => c.value)),
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
      toast(isNew ? 'Type added ✓' : 'Saved ✓')
      render()
      editType(product.slug)
    }
    async function del() {
      if (!confirm(`Delete "${p.name}" and its photos? This cannot be undone from the editor.`)) return
      if (await act(() => api('DELETE', `/api/product/${p.slug}`), 'Product deleted')) { await load(); closeDrawer(true); render() }
    }
    openDrawer(isNew ? 'Add a type' : `Edit type: ${p.name}`, body, [
      h('button', { class: 'btn primary', type: 'submit', form: 'pform' }, isNew ? 'Add type' : 'Save changes'),
      !isNew ? h('a', { class: 'btn', href: productUrl(p), target: '_blank', rel: 'noopener' }, 'View in browser ↗') : '',
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del }, 'Delete type') : '',
    ], () => !dirty || confirm('You have unsaved changes. Close without saving?'))
  }

  // ───────── PRODUCTS: one product (e.g. “Rin Detergent Powder”) has one or more SIZES (each with its own price, stock, photos) ─────────
  let pf = { q: '', cat: '', type: '', brand: '', stock: '', view: 'list' } // product filters
  const typeBySlug = (slug) => products().find((t) => t.slug === slug)
  const brandName = (id) => (S.brands.find((b) => b.id === id) || {}).name || ''
  const skusOfType = (slug) => S.skus.filter((p) => p.type === slug)
  const skuThumb = (p) => (p.photos?.[0] ? `/photo/thumb/${p.photos[0]}.webp?v=${S.photoMeta?.[p.photos[0]]?.v || 0}` : '')
  const shortT = (t) => (t ? t.name.replace(/\s*\(.*\)\s*$/, '') : '')
  const sizeLabel = (p) => (p.loose ? `Loose · from ${p.min || 250} g` : p.size || (p.kit?.length ? `Kit · ${p.kit.length} items` : p.unit ? `per ${p.unit}` : ''))
  const lineKeyOf = (p) => `${p.type}|${p.brand || ''}|${p.name}`
  const lineSkus = (p) => S.skus.filter((x) => lineKeyOf(x) === lineKeyOf(p))
  /** Address of a size on the website (same rule as the build). */
  const skuPreviewUrl = (p) => {
    const t = typeBySlug(p.type)
    if (!t) return PREVIEW()
    const lines = new Map()
    for (const x of skusOfType(p.type).filter((x) => !x.hide)) { const k = lineKeyOf(x); if (!lines.has(k)) lines.set(k, []); lines.get(k).push(x) }
    const ls = [...lines.values()]
    const firstIn = (l) => l.find((x) => !x.off) || l[0]
    return ls.length === 1 && firstIn(ls[0]).id === p.id ? productUrl(t) : `${productUrl(t)}${p.id}/`
  }
  const UNITS = [['piece', 'pieces'], ['packet', 'packets'], ['bar', 'bars'], ['bottle', 'bottles'], ['box', 'boxes'], ['bag', 'bags'], ['can', 'cans'], ['tube', 'tubes'], ['sachet', 'sachets'], ['set', 'sets'], ['kit', 'kits'], ['bundle', 'bundles'], ['leaf', 'leaves'], ['pair', 'pairs'], ['dozen', 'dozens'], ['roll', 'rolls'], ['item', 'items']]
  const TAGS = ['New', 'Popular', 'Best value', 'Fresh stock', 'Festival special', 'Limited stock']
  const fmtG = (g) => (g < 1000 ? `${g} g` : `${+(g / 1000).toFixed(2)} kg`)
  /** Things the owner may want to fix on a size. */
  const issuesOf = (p) => [!p.loose && /₹/.test(p.size || '') ? 'rupees in size' : '', !p.price ? 'no price' : '', !p.photos?.length ? 'no photo' : ''].filter(Boolean)
  function typeSelect(value, cat) {
    return h('select', {}, h('option', { value: '' }, '— choose type —'), S.sections.map((s) => h('optgroup', { label: s.name },
      S.categories.filter((c) => c.section === s.slug && (!cat || c.slug === cat)).flatMap((c) => c.products.map((t) => h('option', { value: t.slug, selected: t.slug === value }, `${shortT(t)} · ${c.name}`))))))
  }
  const seg = (options, value, onPick) => h('div', { class: 'seg', role: 'group' }, options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, label)))

  function renderSkus() {
    const search = h('input', { type: 'search', placeholder: 'Search name, size, price, brand, other names…', value: pf.q, 'aria-label': 'Search products' })
    const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'),
      S.sections.map((s) => h('optgroup', { label: s.name }, S.categories.filter((c) => c.section === s.slug).map((c) => h('option', { value: c.slug, selected: c.slug === pf.cat }, c.name)))))
    const typeBox = h('span')
    const brand = h('select', { 'aria-label': 'Brand' }, h('option', { value: '' }, 'All brands'), h('option', { value: '-', selected: pf.brand === '-' }, '(no brand)'), S.brands.map((b) => h('option', { value: b.id, selected: b.id === pf.brand }, b.name)))
    const SHOW = [['', 'Everything'], ['in', 'In stock'], ['out', 'Out of stock'], ['fix', '⚠ Needs attention'], ['rupee', '₹ written in the size'], ['noprice', 'Without price'], ['nophoto', 'Without photo'], ['kit', '🪔 Puja kits'], ['star', '★ On the home page'], ['tag', 'With a label'], ['hidden', 'Hidden from the website']]
    const stock = h('select', { 'aria-label': 'Show' }, SHOW.map(([v, l]) => h('option', { value: v, selected: v === pf.stock }, l)))
    const count = h('span', { class: 'count' })
    const out = h('div', { class: 'table-wrap' })
    const drawTypes = () => {
      const sel = typeSelect(pf.type, pf.cat)
      sel.setAttribute('aria-label', 'Type')
      sel.options[0].textContent = 'All types'
      sel.addEventListener('change', () => { pf.type = sel.value; draw() })
      typeBox.replaceChildren(sel)
    }
    search.addEventListener('input', () => { pf.q = search.value; draw() })
    cat.addEventListener('change', () => { pf.cat = cat.value; pf.type = ''; drawTypes(); draw() })
    brand.addEventListener('change', () => { pf.brand = brand.value; draw() })
    stock.addEventListener('change', () => { pf.stock = stock.value; draw() })
    const test = {
      in: (p) => !p.off, out: (p) => p.off, fix: (p) => issuesOf(p).length > 0, rupee: (p) => issuesOf(p).includes('rupees in size'), noprice: (p) => !p.price, nophoto: (p) => !p.photos?.length,
      kit: (p) => !!p.kit?.length, star: (p) => !!p.star, tag: (p) => !!p.tag, hidden: (p) => !!p.hide,
    }
    function rowsNow() {
      const q = norm(pf.q)
      const catOf = (p) => typeBySlug(p.type)?.category
      return S.skus.filter((p) => (!pf.cat || catOf(p) === pf.cat) && (!pf.type || p.type === pf.type) &&
        (!pf.brand || (pf.brand === '-' ? !p.brand : p.brand === pf.brand)) && (!pf.stock || test[pf.stock](p)) &&
        (!q || [p.name, p.te, p.size, p.price, brandName(p.brand), typeBySlug(p.type)?.name, ...(p.aliases || [])].some((x) => norm(x).includes(q))))
    }
    function draw() { pf.view === 'prices' ? drawPrices() : drawList() }
    function drawList() {
      const rows = rowsNow()
      const groups = new Map()
      for (const p of rows) { const k = lineKeyOf(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p) }
      const lines = [...groups.values()]
      count.textContent = `${lines.length} products · ${rows.length} sizes`
      const tbody = h('tbody', {}, lines.length ? lines.slice(0, 300).map((sub) => {
        const p = sub[0], t = typeBySlug(p.type), all = lineSkus(p)
        const pic = skuThumb(all.find((x) => x.photos?.length) || p)
        const inStock = all.filter((x) => !x.off).length
        const tag = (all.find((x) => x.tag) || {}).tag
        return h('tr', { class: (inStock ? '' : 'is-off') + (all.every((x) => x.hide) ? ' is-hidden' : '') },
          h('td', { class: 'c-ph' }, pic ? h('img', { src: pic, alt: '', loading: 'lazy' }) : h('span', { class: 'noph' }, 'no photo')),
          h('td', { class: 'c-name' }, h('button', { class: 'link-strong', type: 'button', onclick: () => editSku(p.id) }, p.name), p.te ? h('span', { class: 'te', lang: 'te' }, p.te) : '',
            h('div', { class: 'flags' }, tag ? h('span', { class: 'tagpill' }, tag) : '', all.some((x) => x.star) ? h('span', { class: 'flag star', title: 'On the home page' }, '★ Home') : '',
              all.some((x) => x.kit?.length) ? h('span', { class: 'flag kit' }, '🪔 Kit') : '', all.every((x) => x.hide) ? h('span', { class: 'flag hid' }, 'Hidden') : '')),
          h('td', { class: 'c-sizes' }, h('div', { class: 'chips-in' }, all.map((x) => h('button', { type: 'button', class: 'sizechip' + (x.off ? ' off' : '') + (issuesOf(x).includes('rupees in size') ? ' warn' : ''), title: (x.off ? 'Out of stock. ' : '') + (issuesOf(x).length ? 'Needs: ' + issuesOf(x).join(', ') : 'Edit this size'), onclick: () => editSku(x.id) }, (sizeLabel(x) || 'no size') + (x.price ? ' · ' + x.price : ''))),
            h('button', { type: 'button', class: 'sizechip add', title: 'Add another size of this product', onclick: () => editSku(p.id, { addSize: true }) }, '＋ size'))),
          h('td', {}, brandName(p.brand) || h('span', { class: 'muted' }, '—')),
          h('td', {}, t ? shortT(t) : h('span', { class: 'badge warn' }, 'type missing')),
          h('td', { class: 'c-stock' }, h('span', { class: 'badge' + (inStock === all.length ? ' qty' : inStock ? '' : ' warn') }, `${inStock}/${all.length} in stock`)),
          h('td', { class: 'c-act' }, h('button', { class: 'btn small', type: 'button', onclick: () => editSku(p.id) }, 'Edit')))
      }) : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'No products match. Change the filters, or add a product.'))])
      if (lines.length > 300) tbody.append(h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'Showing the first 300. Use the search or filters to find the others.')))
      out.replaceChildren(h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, ['Photo', 'Product', 'Sizes (click to edit)', 'Brand', 'Type', 'Stock', ''].map((x) => h('th', {}, x)))), tbody))
    }
    // Prices & stock: every size in one list, edited right here (saved as soon as you leave the box).
    async function quick(p, body, el) {
      el?.classList.add('saving')
      const ok = await act(() => api('POST', `/api/sku/${p.id}/quick`, body))
      el?.classList.remove('saving')
      if (ok) {
        for (const [k, v] of Object.entries(body)) { if (v === '' || v === false) delete p[k]; else p[k] = v }
        if (body.size) delete p.unit
        el?.classList.add('saved'); setTimeout(() => el?.classList.remove('saved'), 1200)
      }
      return ok
    }
    function drawPrices() {
      const rows = rowsNow()
      count.textContent = `${rows.length} sizes`
      const tbody = h('tbody', {}, rows.length ? rows.slice(0, 400).map((p) => {
        const pic = skuThumb(p)
        const size = h('input', { type: 'text', value: p.loose ? `Loose · from ${fmtG(p.min || 250)}` : p.size || '', disabled: !!p.loose, placeholder: p.unit ? `per ${p.unit}` : 'size', 'aria-label': `Size of ${p.name}` })
        const price = h('input', { type: 'text', value: p.price || '', placeholder: '₹', 'aria-label': `Price of ${p.name} ${p.size || ''}` })
        const sw = h('input', { type: 'checkbox', checked: !p.off, 'aria-label': `${p.name} ${p.size || ''} in stock` })
        const issues = h('td', { class: 'c-issues' })
        function redrawIssues() {
          const list = issuesOf(p)
          const m = !p.loose && (p.size || '').match(/₹\s*(\d+)/)
          issues.replaceChildren(...list.map((x) => h('span', { class: 'badge warn' }, x)),
            m ? h('button', { type: 'button', class: 'btn small', title: 'Moves the rupees to Price. Then type the real size (e.g. 50 g).', onclick: async () => {
              const rest = (p.size || '').replace(/₹\s*\d+\s*/, '').trim()
              const body = { size: rest ? rest[0].toUpperCase() + rest.slice(1) : 'Packet' }
              if (!p.price) body.price = `₹${m[1]}`
              if (await quick(p, body)) { size.value = p.size; price.value = p.price || ''; redrawIssues(); size.focus(); size.select() }
            } }, `Move ₹${m[1]} to Price`) : '')
        }
        size.addEventListener('change', () => { if (size.value.trim()) quick(p, { size: size.value.trim() }, size).then(redrawIssues) })
        price.addEventListener('change', () => quick(p, { price: price.value.trim() }, price).then(redrawIssues))
        for (const el of [size, price]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur() })
        const tr = h('tr', { class: p.off ? 'is-off' : '' },
          h('td', { class: 'c-ph' }, pic ? h('img', { src: pic, alt: '', loading: 'lazy' }) : h('span', { class: 'noph' }, 'no photo')),
          h('td', { class: 'c-name' }, h('button', { class: 'link-strong', type: 'button', onclick: () => editSku(p.id) }, p.name), h('span', { class: 'te' }, [brandName(p.brand), shortT(typeBySlug(p.type))].filter(Boolean).join(' · '))),
          h('td', { class: 'c-in' }, size), h('td', { class: 'c-in' }, price),
          h('td', {}, h('label', { class: 'switch' }, sw, h('span', { class: 'slider' }))), issues)
        sw.addEventListener('change', async () => { if (!(await quick(p, { off: !sw.checked }))) sw.checked = !sw.checked; tr.classList.toggle('is-off', !sw.checked) })
        redrawIssues()
        return tr
      }) : [h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Nothing matches the filters.'))])
      if (rows.length > 400) tbody.append(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Showing the first 400. Use the search or filters to find the others.')))
      out.replaceChildren(h('table', { class: 'ptable prices' }, h('thead', {}, h('tr', {}, ['Photo', 'Product', 'Size', 'Price', 'In stock', 'Check'].map((x) => h('th', {}, x)))), tbody))
    }
    drawTypes()
    draw()
    const kitType = (S.categories.find((c) => c.slug === 'pooja-kits')?.products[0] || {}).slug || ''
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Products'), h('p', {}, 'A product (e.g. “Rin Detergent Powder”) has one or more sizes. Each size has its own price, stock and photos. Open a product to edit all its sizes on one screen.')),
        h('div', { class: 'head-acts' }, h('button', { class: 'btn', type: 'button', onclick: () => editSku(null, { kit: true, type: kitType }) }, '🪔 Add puja kit'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => editSku(null, pf.type ? { type: pf.type } : {}) }, '＋ Add product'))),
      h('div', { class: 'view-row' }, seg([['list', 'Products'], ['prices', '₹ Prices & stock (quick edit)']], pf.view, (v) => { pf.view = v; renderSkus() }),
        pf.view === 'prices' ? h('span', { class: 'hint' }, 'Type a price or size and press Enter: it is saved straight away. The switch = in stock.') : ''),
      h('div', { class: 'toolbar filters' }, search, cat, typeBox, brand, stock, count),
      out,
    )
  }

  /**
   * The product screen: everything about one product and ALL its sizes.
   *   editSku(id)                 open the product that has this size (that size opens)
   *   editSku(id, { addSize })    …and add a new size row
   *   editSku(null, preset)       new product (preset: type, brand, name, kit …)
   */
  function editSku(id, preset = {}) {
    const isNew = !id
    const first = isNew ? null : S.skus.find((x) => x.id === id)
    if (!isNew && !first) return toast('That product was not found.', true)
    const orig = isNew ? null : { type: first.type, brand: first.brand || '', name: first.name }
    const line = isNew ? [] : lineSkus(first)
    const common = (arrs) => (arrs.length ? arrs.reduce((a, b) => a.filter((x) => b.includes(x))) : [])
    const sharedAliases = isNew ? [...(preset.aliases || [])] : common(line.map((x) => x.aliases || []))
    const descs = line.map((x) => x.desc || '')
    const sharedDesc = isNew ? preset.desc || '' : descs.every((d) => d === descs[0]) ? descs[0] : ''
    const L = { tag: (line.find((x) => x.tag) || {}).tag || '', star: line.some((x) => x.star), hide: line.length > 0 && line.every((x) => x.hide), kit: line.some((x) => x.kit?.length) || !!preset.kit }
    let seq = 0
    const toRow = (x) => ({ key: ++seq, id: x.id || null, size: x.loose ? '' : x.size || '', price: x.price || '', loose: !!x.loose, min: x.min || 250, step: x.step || ((x.min || 250) < 250 ? 25 : 250),
      unit: x.unit || (L.kit ? 'set' : 'piece'), off: !!x.off, desc: x.desc && x.desc !== sharedDesc ? x.desc : '', aliases: (x.aliases || []).filter((a) => !sharedAliases.includes(a)),
      quick: [...(x.quick || [])], kit: (x.kit || []).map((k) => ({ ...k })), photos: x.photos || [] })
    const rows = isNew ? [toRow({})] : line.map(toRow)
    const opened = new Set()
    if (isNew || rows.length === 1) opened.add(rows[0].key)
    else { const r = rows.find((x) => x.id === id); if (r) opened.add(r.key) }
    if (preset.addSize) { const r = toRow({ unit: rows[0].unit }); rows.push(r); opened.clear(); opened.add(r.key) }
    let dirty = !!preset.addSize
    const mark = () => (dirty = true)

    // ── product fields (shared by all sizes) ──
    const t0 = typeBySlug(isNew ? preset.type : first.type)
    const f = {
      cat: h('select', {}, h('option', { value: '' }, 'All categories'), S.sections.map((s) => h('optgroup', { label: s.name }, S.categories.filter((c) => c.section === s.slug).map((c) => h('option', { value: c.slug, selected: c.slug === t0?.category }, c.name))))),
      typeBox: h('span'), type: null, brand: h('select'),
      name: h('input', { type: 'text', value: isNew ? preset.name || '' : first.name, placeholder: L.kit ? 'e.g. Varalakshmi Vratham Kit' : 'e.g. Rin Detergent Powder' }),
      te: h('input', { type: 'text', value: isNew ? preset.te || '' : first.te || '', lang: 'te', placeholder: 'optional, e.g. రిన్ సర్ఫ్' }),
      aliases: chipInput(sharedAliases, 'Type another name and press Enter'),
      desc: h('textarea', { rows: 3, value: sharedDesc, placeholder: 'optional — leave empty to use the type’s description' }),
      tag: h('select', {}, h('option', { value: '' }, 'No label'), TAGS.map((x) => h('option', { value: x, selected: x === L.tag }, x)), h('option', { value: '*', selected: !!L.tag && !TAGS.includes(L.tag) }, 'Own words…')),
      tagOwn: h('input', { type: 'text', maxlength: 20, value: L.tag && !TAGS.includes(L.tag) ? L.tag : '', placeholder: 'e.g. Organic (max 20 letters)' }),
      star: h('input', { type: 'checkbox', checked: L.star }),
      hide: h('input', { type: 'checkbox', checked: L.hide }),
      kit: h('input', { type: 'checkbox', checked: L.kit }),
    }
    const drawType = () => {
      f.type = typeSelect(f.type?.value || (isNew ? preset.type : first.type) || '', f.cat.value)
      f.type.addEventListener('change', () => { mark(); drawBrands(); suggest() })
      f.typeBox.replaceChildren(f.type)
    }
    const drawBrands = () => {
      const cur = f.brand.value || (isNew ? preset.brand : first.brand) || ''
      const ty = f.type?.value || ''
      const own = [...new Set(S.skus.filter((x) => x.type === ty && x.brand).map((x) => x.brand))]
      f.brand.replaceChildren(h('option', { value: '' }, '— no brand —'),
        own.length ? h('optgroup', { label: `Brands of ${shortT(typeBySlug(ty)) || 'this type'}` }, own.map((b) => h('option', { value: b, selected: b === cur }, brandName(b)))) : '',
        h('optgroup', { label: own.length ? 'Other brands (adds it to this type)' : 'All brands' }, S.brands.filter((b) => !own.includes(b.id)).map((b) => h('option', { value: b.id, selected: b.id === cur }, b.name))))
    }
    f.cat.addEventListener('change', drawType)
    drawType(); drawBrands()
    const suggestion = h('button', { type: 'button', class: 'link', hidden: true })
    function suggest() {
      const t = typeBySlug(f.type?.value), b = brandName(f.brand.value)
      const s = t ? `${b ? b + ' ' : ''}${shortT(t)}` : ''
      suggestion.hidden = !s || f.name.value.trim() === s
      suggestion.textContent = `Use “${s}”`
      suggestion.onclick = () => { f.name.value = s; mark(); suggestion.hidden = true }
    }
    f.brand.addEventListener('change', suggest)
    f.name.addEventListener('input', suggest)
    suggest()
    const tagRow = field('Own label', f.tagOwn)
    const syncTag = () => (tagRow.hidden = f.tag.value !== '*')
    f.tag.addEventListener('change', syncTag); syncTag()
    f.kit.addEventListener('change', () => { syncRows(); drawRows() })

    // ── sizes table ──
    const tbody = h('tbody')
    const sizeHint = h('p', { class: 'hint' })
    function syncRows() { for (const r of rows) if (r._al) r.aliases = r._al.get() }
    const leave = (fn) => () => { if (!dirty || confirm('Leave without saving your changes?')) { closeDrawer(true); fn() } }
    function moveRow(i, d) { syncRows(); const j = i + d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; mark(); drawRows() }
    function drawRows() {
      tbody.replaceChildren(...rows.flatMap((r, i) => {
        const isOpen = opened.has(r.key)
        const size = h('input', { type: 'text', value: r.loose ? '' : r.size, disabled: r.loose, placeholder: r.loose ? 'Loose (by weight)' : 'e.g. ½ kg, 1 L, Big', 'aria-label': 'Size', oninput: (e) => { r.size = e.target.value; mark(); hint() } })
        const price = h('input', { type: 'text', value: r.price, placeholder: '₹ (optional)', 'aria-label': 'Price', oninput: (e) => { r.price = e.target.value; mark() } })
        const sw = h('input', { type: 'checkbox', checked: !r.off, 'aria-label': 'In stock', onchange: (e) => { r.off = !e.target.checked; mark(); tr.classList.toggle('is-off', r.off) } })
        const pic = r.photos[0] ? h('img', { src: `/photo/thumb/${r.photos[0]}.webp?v=${S.photoMeta?.[r.photos[0]]?.v || 0}`, alt: '' }) : h('span', { class: 'noph' }, r.id ? '＋' : '—')
        const tr = h('tr', { class: 'size-row' + (r.off ? ' is-off' : '') + (isOpen ? ' open' : '') },
          h('td', { class: 'c-ord' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => moveRow(i, -1) }, '↑'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === rows.length - 1, onclick: () => moveRow(i, 1) }, '↓')),
          h('td', { class: 'c-in' }, size, r.loose ? h('small', { class: 'muted' }, `from ${fmtG(r.min)} · each + ${fmtG(r.step)}`) : ''),
          h('td', { class: 'c-in' }, price),
          h('td', {}, h('label', { class: 'switch' }, sw, h('span', { class: 'slider' }))),
          h('td', { class: 'c-ph' }, h('button', { type: 'button', class: 'ph-btn', title: 'Photos', onclick: () => toggle(r) }, pic, r.photos.length > 1 ? h('span', { class: 'n' }, r.photos.length) : '')),
          h('td', { class: 'c-act' }, h('button', { type: 'button', class: 'btn small' + (isOpen ? ' on' : ''), 'aria-expanded': String(isOpen), onclick: () => toggle(r) }, isOpen ? 'Close ▴' : 'More ▾'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove this size', title: 'Remove this size', onclick: () => removeRow(r) }, '🗑')))
        return isOpen ? [tr, h('tr', { class: 'size-more' }, h('td', { colspan: 6 }, details(r)))] : [tr]
      }))
      hint()
    }
    function hint() {
      const labels = rows.map((r) => (r.loose ? 'loose' : r.size.trim().toLowerCase()))
      const dup = labels.some((x, i) => labels.indexOf(x) !== i)
      sizeHint.textContent = dup ? '⚠ Two sizes are the same. Give each one a different size.' : `${rows.length} size${rows.length === 1 ? '' : 's'}. The first size in stock is shown first on cards. Use ↑ ↓ to change the order.`
      sizeHint.classList.toggle('warn-text', dup)
    }
    function toggle(r) { syncRows(); opened.has(r.key) ? opened.delete(r.key) : opened.add(r.key); drawRows() }
    function removeRow(r) {
      if (rows.length === 1) return toast('A product needs at least one size. Use “Delete product” to remove it completely.', true)
      if (r.id && !confirm(`Remove the size “${r.loose ? 'Loose' : r.size || 'no size'}”? It is deleted when you press Save.`)) return
      syncRows(); rows.splice(rows.indexOf(r), 1); mark(); drawRows()
    }
    function addRow() {
      syncRows()
      const r = toRow({ unit: rows[rows.length - 1]?.unit })
      rows.push(r); opened.clear(); opened.add(r.key); mark(); drawRows()
      setTimeout(() => [...tbody.querySelectorAll('tr.size-row')].pop()?.querySelector('.c-in input')?.focus(), 30)
    }

    // ── one size: loose settings, count word, quick amounts, description, names, photos, kit contents ──
    function details(r) {
      const G = [10, 25, 50, 100, 250, 500, 1000]
      const loose = h('input', { type: 'checkbox', checked: r.loose })
      const min = h('select', {}, G.map((g) => h('option', { value: g, selected: g === r.min }, fmtG(g))))
      const stp = h('select', {}, G.map((g) => h('option', { value: g, selected: g === r.step }, fmtG(g))))
      const prev = h('small', {})
      const drawPrev = () => (prev.textContent = `Customers can choose: ${[0, 1, 2, 3].map((k) => fmtG(r.min + k * r.step)).join(', ')} … or type any amount.`)
      loose.addEventListener('change', () => { r.loose = loose.checked; mark(); syncRows(); drawRows() })
      min.addEventListener('change', () => { r.min = Number(min.value); mark(); drawPrev() })
      stp.addEventListener('change', () => { r.step = Number(stp.value); mark(); drawPrev() })
      drawPrev()
      const unit = h('select', { onchange: (e) => { r.unit = e.target.value; mark() } }, UNITS.map(([u, pl]) => h('option', { value: u, selected: u === r.unit }, pl)))
      const quickIn = h('input', { type: 'text', value: r.quick.join(', '), placeholder: 'e.g. 5, 10, 25, 50', oninput: (e) => { r.quick = e.target.value.split(/[ ,]+/).map(Number).filter((n) => n > 0 && n <= 100000); mark() } })
      const desc = h('textarea', { rows: 2, value: r.desc, placeholder: 'optional — only if this size needs its own words', oninput: (e) => { r.desc = e.target.value; mark() } })
      r._al = chipInput(r.aliases, 'e.g. rin 10 rupees packet')
      return h('div', { class: 'size-details' },
        h('div', { class: 'sd-col' },
          h('label', { class: 'check-line' }, loose, h('span', {}, h('strong', {}, 'Sold loose by weight'), ' — customers choose how much')),
          r.loose ? h('div', {}, h('div', { class: 'grid2' }, field('Starts from', min, 'Smallest amount.'), field('Each + adds', stp, '10 g or 25 g for costly items, 250 g for dals, rice, chillies.')), prev) : '',
          !r.loose ? field('Counted in (when there is no size)', unit, 'Used in the WhatsApp list, e.g. “3 bars”, “2 sets”.') : '',
          !r.loose ? field('Quick amounts (optional)', quickIn, 'Buttons customers can tap, e.g. 5, 10, 25 for diyas.') : '',
          field('Description of this size (optional)', desc, 'Shown on this size’s page instead of the product description.'),
          field('Extra search names for this size', r._al.el, 'Only for this size. Names for all sizes go in “Search names” below.')),
        h('div', { class: 'sd-col' }, h('p', { class: 'sd-h' }, 'Photos of this size'), photoBox(r)),
        f.kit.checked ? h('div', { class: 'sd-wide' }, kitEditor(r)) : '')
    }

    // ── photos of one size (saved straight away) ──
    function photoBox(r) {
      if (!r.id) return h('p', { class: 'hint' }, 'Save first, then add photos of this size.')
      const refresh = async () => { syncRows(); await load(); r.photos = S.skus.find((x) => x.id === r.id)?.photos || []; drawRows() }
      const op = async (o, body) => { if (o === 'delete' && !confirm('Remove this photo?')) return; if (await act(() => api('POST', `/api/sku/${r.id}/photo?op=${o}`, body))) await refresh() }
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true })
      file.addEventListener('change', async () => {
        for (const fl of file.files) if (!(await act(() => api('POST', `/api/sku/${r.id}/photo?op=add&filename=${encodeURIComponent(fl.name)}`, undefined, fl)))) break
        toast('Photos saved ✓'); await refresh()
      })
      const others = rows.filter((x) => x !== r && x.id && x.photos.length)
      const copy = others.length ? h('select', { 'aria-label': 'Use photos of another size', onchange: async (e) => { if (e.target.value && await act(() => api('POST', `/api/sku/${r.id}/photo?op=copy-from`, { from: e.target.value }), 'Photos added ✓')) await refresh() } },
        h('option', { value: '' }, 'Use photos of another size…'), others.map((x) => h('option', { value: x.id }, `${x.loose ? 'Loose' : x.size || 'no size'} (${x.photos.length})`))) : ''
      return h('div', {},
        h('div', { class: 'photos small' }, r.photos.map((name, i) => {
          const meta = S.photoMeta?.[name] || {}
          return h('div', { class: 'photo' + (i === 0 ? ' main' : '') },
            h('img', { src: `/photo/thumb/${name}.webp?v=${meta.v || 0}`, alt: `Photo ${i + 1}` }),
            i === 0 ? h('span', { class: 'tag' }, 'Main') : '',
            h('div', { class: 'ops' },
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move left', disabled: i === 0, onclick: () => op('move', { name, dir: -1 }) }, '←'),
              i ? h('button', { class: 'btn small', type: 'button', onclick: () => op('main', { name }) }, 'Main') : h('span'),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move right', disabled: i === r.photos.length - 1, onclick: () => op('move', { name, dir: 1 }) }, '→'),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove photo', onclick: () => op('delete', { name }) }, '🗑')),
            meta.hasSource ? h('button', { class: 'btn small adjust', type: 'button', onclick: () => openCropper(r.id, { name, crop: meta.crop || null }, refresh, `/api/sku/${r.id}/crop`) }, '✂ Adjust') : '')
        }),
        h('label', { class: 'drop', tabindex: '0' }, h('strong', {}, '＋ Add photos'), h('span', {}, 'one or more'), file)),
        h('div', { class: 'vtools' }, copy, h('span', { class: 'hint' }, 'Photos are saved straight away. The first photo is the main one.')))
    }

    // ── puja kit: the shop's products that go into this kit ──
    function kitEditor(r) {
      const find = h('input', { type: 'search', placeholder: 'Find a product to add, e.g. camphor, kumkum, coconut…', 'aria-label': 'Find a product to add to the kit' })
      const results = h('div', { class: 'kit-results' })
      const head = h('p', { class: 'sd-h' })
      const list = h('ol', { class: 'kit-items' })
      const ownIds = new Set(rows.map((x) => x.id).filter(Boolean))
      function drawList() {
        list.replaceChildren(...(r.kit.length ? r.kit.map((k, i) => {
          const p = S.skus.find((x) => x.id === k.id)
          if (!p) return h('li', { class: 'missing' }, `“${k.id}” no longer exists. `, h('button', { type: 'button', class: 'link', onclick: () => { r.kit.splice(i, 1); mark(); drawList() } }, 'Remove'))
          const sizes = lineSkus(p)
          const sizeSel = sizes.length > 1 ? h('select', { 'aria-label': `Size of ${p.name}`, onchange: (e) => { const np = S.skus.find((x) => x.id === e.target.value); if (!!np.loose !== !!p.loose) k.a = np.loose ? np.min || 250 : 1; k.id = e.target.value; mark(); drawList() } },
            sizes.map((x) => h('option', { value: x.id, selected: x.id === k.id }, `${sizeLabel(x) || 'no size'}${x.price ? ' · ' + x.price : ''}${x.off ? ' (out of stock)' : ''}`))) : h('span', { class: 'muted' }, sizeLabel(p) || '—')
          const amt = h('input', { type: 'number', min: 1, max: 100000, step: p.loose ? p.step || 25 : 1, value: k.a, 'aria-label': p.loose ? `Grams of ${p.name}` : `How many ${p.name}`, class: 'amt', oninput: (e) => { const n = Math.round(Number(e.target.value)); if (n > 0) { k.a = n; mark() } } })
          return h('li', { class: p.off ? 'is-off' : '' },
            p.photos?.[0] ? h('img', { src: skuThumb(p), alt: '' }) : h('span', { class: 'noph' }, ''),
            h('span', { class: 'kn' }, h('strong', {}, p.name), p.off ? h('span', { class: 'badge warn' }, 'out of stock') : ''), sizeSel,
            h('span', { class: 'ka' }, amt, h('small', {}, p.loose ? 'grams' : 'count')),
            h('span', { class: 'kb' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [r.kit[i - 1], r.kit[i]] = [r.kit[i], r.kit[i - 1]]; mark(); drawList() } }, '↑'),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${p.name}`, onclick: () => { r.kit.splice(i, 1); mark(); drawList(); drawResults() } }, '✕')))
        }) : [h('li', { class: 'empty' }, 'No items yet. Find products above and click them to add.')]))
        head.textContent = `🪔 Contents of this kit · ${r.kit.length} item${r.kit.length === 1 ? '' : 's'}`
      }
      function drawResults() {
        const q = norm(find.value).trim()
        if (!q) return results.replaceChildren()
        const hits = S.skus.filter((p) => !p.kit?.length && !ownIds.has(p.id) && !p.hide && [p.name, p.te, p.size, brandName(p.brand), ...(p.aliases || [])].some((x) => norm(x).includes(q))).slice(0, 12)
        results.replaceChildren(...(hits.length ? hits.map((p) => {
          const inKit = r.kit.some((k) => k.id === p.id)
          return h('button', { type: 'button', class: 'kit-hit', disabled: inKit, onclick: () => { r.kit.push({ id: p.id, a: p.loose ? p.min || 250 : 1 }); mark(); drawList(); drawResults(); find.focus() } },
            p.photos?.[0] ? h('img', { src: skuThumb(p), alt: '' }) : h('span', { class: 'noph' }, ''), h('span', {}, h('strong', {}, p.name), ' ', h('small', {}, [sizeLabel(p), p.price].filter(Boolean).join(' · '))), inKit ? h('em', {}, 'added') : h('b', {}, '＋'))
        }) : [h('p', { class: 'hint' }, 'No product found. Add it in Products first.')]))
      }
      find.addEventListener('input', drawResults)
      find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); results.querySelector('.kit-hit:not(:disabled)')?.click() } })
      drawList()
      return h('div', { class: 'kit-ed' }, head, h('p', { class: 'hint' }, 'Customers see this list on the kit page. They can untick items, change sizes and amounts, then add the whole kit to their list in one tap. Amount = how many, or grams for loose items.'), find, results, list)
    }

    drawRows()
    const body = h('form', { id: 'lform', class: 'line-form', oninput: mark, onchange: mark, onsubmit: (e) => { e.preventDefault(); save(false) } },
      h('fieldset', {}, h('legend', {}, L.kit ? '🪔 Puja kit' : 'Product'),
        h('div', { class: 'grid2' }, field('Category', f.cat), field('Type of product', f.typeBox, h('span', {}, L.kit ? 'e.g. Varalakshmi Vratham Kit. ' : 'e.g. Detergent Powder. ', h('button', { type: 'button', class: 'link', onclick: leave(() => editType(null)) }, '＋ New type')), true)),
        h('div', { class: 'grid2' }, field('Brand', f.brand, h('span', {}, 'Pick “no brand” for loose and puja items. ', h('button', { type: 'button', class: 'link', onclick: leave(() => editBrand(null)) }, '＋ New brand'))),
          h('label', { class: 'field' }, h('span', { class: 'req' }, 'Product name'), f.name, h('small', {}, 'Same for every size. ', suggestion))),
        field('Telugu name (optional)', f.te)),
      h('fieldset', {}, h('legend', {}, 'Sizes, prices & stock'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'ptable sizes-t' }, h('thead', {}, h('tr', {}, ['Order', 'Size', 'Price', 'In stock', 'Photos', ''].map((x) => h('th', {}, x)))), tbody)),
        h('div', { class: 'vtools' }, h('button', { type: 'button', class: 'btn', onclick: addRow }, '＋ Add another size'), sizeHint)),
      h('fieldset', {}, h('legend', {}, 'On the website'),
        h('div', { class: 'grid2' }, field('Label on the card', f.tag, 'A small badge on the photo, e.g. “New”.'), tagRow),
        h('label', { class: 'check-line' }, f.star, h('span', {}, h('strong', {}, '★ Show on the home page'), ' in “Popular at the shop”')),
        h('label', { class: 'check-line' }, f.kit, h('span', {}, h('strong', {}, '🪔 This is a puja kit'), ' — choose its contents under “More ▾” of the size')),
        h('label', { class: 'check-line' }, f.hide, h('span', {}, h('strong', {}, 'Hide from the website'), ' (keeps it here for later. For “not available today”, switch off In stock instead.)'))),
      h('fieldset', {}, h('legend', {}, 'Search names & description (all sizes)'),
        field('Search names', f.aliases.el, 'Local names and spellings, e.g. “rin surf”, “rin powder”. The type’s names are searched too.'),
        field('Description (optional)', f.desc, 'Shown on the product page. Leave empty to use the type’s description.')))

    async function save(close) {
      syncRows()
      const name = f.name.value.trim()
      if (!f.type.value) { f.type.focus(); return toast('Choose the type of product.', true) }
      if (!name) { f.name.focus(); return toast('Type the product name.', true) }
      const tag = f.tag.value === '*' ? f.tagOwn.value.trim() : f.tag.value
      const shared = f.aliases.get()
      const sizes = rows.map((r) => ({ id: r.id || undefined, type: f.type.value, brand: f.brand.value, name, te: f.te.value.trim(),
        size: r.loose ? 'Loose' : r.size.trim(), loose: r.loose, min: r.min, step: r.step, unit: r.unit, price: r.price.trim(), off: r.off,
        desc: r.desc.trim() || f.desc.value.trim(), aliases: [...new Set([...shared, ...r.aliases])], quick: r.loose ? [] : r.quick,
        kit: f.kit.checked ? r.kit : [], tag, star: f.star.checked, hide: f.hide.checked }))
      const res = await act(() => api('POST', '/api/line', { orig, sizes }), 'Saved ✓')
      if (!res) return
      dirty = false
      await load()
      closeDrawer(true)
      render()
      if (!close) editSku(res.ids[Math.max(0, rows.findIndex((r) => opened.has(r.key)))] || res.ids[0])
    }
    async function del() {
      const saved = rows.filter((r) => r.id)
      if (!confirm(`Delete “${first.name}” and all its ${saved.length} size${saved.length === 1 ? '' : 's'}? Its own photos are deleted too.`)) return
      for (const r of saved) if (!(await act(() => api('DELETE', `/api/sku/${r.id}`)))) break
      toast('Product deleted'); await load(); closeDrawer(true); render()
    }
    openDrawer(isNew ? (L.kit ? 'Add a puja kit' : 'Add a product') : first.name, body, [
      h('button', { class: 'btn primary', type: 'submit', form: 'lform' }, isNew ? 'Add' : 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => save(true) }, isNew ? 'Add & close' : 'Save & close'),
      !isNew ? h('a', { class: 'btn', href: skuPreviewUrl(first), target: '_blank', rel: 'noopener' }, 'View ↗') : '',
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del }, 'Delete product') : '',
    ], () => !dirty || confirm('You have unsaved changes. Close without saving?'))
  }

  // ───────── BRANDS ─────────
  let bf = { q: '', show: '', sort: 'az' } // brand filters
  const brandLogoUrl = (b) => `/brandlogo/${b.id}.webp?v=${b.logoV || 0}`
  function renderBrands() {
    const counts = Object.fromEntries(S.brands.map((b) => [b.id, S.skus.filter((p) => p.brand === b.id)]))
    const typesOf = (id) => [...new Set(counts[id].map((p) => shortT(typeBySlug(p.type))).filter(Boolean))]
    const search = h('input', { type: 'search', value: bf.q, placeholder: 'Search brands, e.g. Rin, Priya…', 'aria-label': 'Search brands' })
    const show = h('select', { 'aria-label': 'Show' }, [['', 'All brands'], ['logo', 'With logo'], ['nologo', 'Without logo'], ['unused', 'Not used by any product']].map(([v, l]) => h('option', { value: v, selected: v === bf.show }, l)))
    const sort = h('select', { 'aria-label': 'Sort' }, [['az', 'A – Z'], ['most', 'Most products']].map(([v, l]) => h('option', { value: v, selected: v === bf.sort }, l)))
    const count = h('span', { class: 'count' })
    const grid = h('div', { class: 'bgrid' })
    function draw() {
      const q = norm(bf.q).trim()
      let list = S.brands.filter((b) => (!q || norm(b.name).includes(q) || norm(b.te).includes(q) || typesOf(b.id).some((t) => norm(t).includes(q))) &&
        (!bf.show || (bf.show === 'logo' ? b.logo : bf.show === 'nologo' ? !b.logo : !counts[b.id].length)))
      list = list.sort((a, b) => (bf.sort === 'most' ? counts[b.id].length - counts[a.id].length : 0) || a.name.localeCompare(b.name))
      const withLogo = S.brands.filter((b) => b.logo).length
      count.textContent = `${list.length} of ${S.brands.length} brands · ${withLogo} with logo`
      grid.replaceChildren(...(list.length ? list.map((b) => {
        const n = counts[b.id].length, types = typesOf(b.id)
        return h('article', { class: 'bcard' },
          h('button', { type: 'button', class: 'bcard-logo' + (b.logo ? '' : ' empty'), title: b.logo ? 'Edit logo' : 'Add a logo (optional)', onclick: () => (b.logo ? openLogoEditor(b) : editBrand(b.id)) },
            b.logo ? h('img', { src: brandLogoUrl(b), alt: `${b.name} logo` }) : h('span', {}, '＋ Add logo')),
          h('div', { class: 'bcard-t' }, h('strong', {}, b.name), b.te ? h('span', { lang: 'te' }, b.te) : '',
            h('small', {}, n ? `${n} product${n === 1 ? '' : 's'} · ${types.slice(0, 2).join(', ')}${types.length > 2 ? ' …' : ''}` : 'Not used yet')),
          h('div', { class: 'bcard-acts' },
            h('button', { class: 'btn small', type: 'button', onclick: () => editBrand(b.id) }, 'Edit'),
            b.logo ? h('button', { class: 'btn small', type: 'button', onclick: () => openLogoEditor(b) }, '✂ Logo') : '',
            n ? h('button', { class: 'btn small', type: 'button', onclick: () => { pf = { q: '', cat: '', type: '', brand: b.id, stock: '', view: 'list' }; switchTab('products') } }, 'Products') : ''))
      }) : [h('p', { class: 'empty' }, 'No brands match. Try another word, or add the brand.')]))
    }
    search.addEventListener('input', () => { bf.q = search.value; draw() })
    show.addEventListener('change', () => { bf.show = show.value; draw() })
    sort.addEventListener('change', () => { bf.sort = sort.value; draw() })
    draw()
    $('#main').replaceChildren(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Brands'), h('p', {}, 'Add a brand once, then pick it in any product. Renaming a brand renames it everywhere. A logo is optional: it shows on product cards, product pages, brand filters and the moving brand row on the home page.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => editBrand(null) }, '＋ Add brand')),
      h('div', { class: 'toolbar filters' }, search, show, sort, count),
      grid,
    )
    setTimeout(() => search.focus({ preventScroll: true }), 30)
  }
  function editBrand(id) {
    const isNew = !id
    const b = isNew ? { id: '', name: '', te: '' } : S.brands.find((x) => x.id === id)
    const f = { name: h('input', { type: 'text', value: b.name, placeholder: 'e.g. Rin' }), te: h('input', { type: 'text', value: b.te || '', lang: 'te', placeholder: 'optional' }) }
    const used = isNew ? 0 : S.skus.filter((p) => p.brand === id).length
    const logoFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true })
    logoFile.addEventListener('change', async () => {
      const fl = logoFile.files[0]
      if (fl && await act(() => api('POST', `/api/brand/${b.id}/logo`, undefined, fl), 'Logo saved ✓')) { await load(); closeDrawer(true); render(); editBrand(b.id) }
    })
    const removeLogo = async () => { if (confirm('Remove this logo?') && await act(() => api('DELETE', `/api/brand/${b.id}/logo`), 'Logo removed')) { await load(); closeDrawer(true); render(); editBrand(b.id) } }
    const logoBox = isNew ? h('p', { class: 'hint' }, 'Save the brand first, then you can add its logo (optional).') : h('div', { class: 'logo-edit' },
      b.logo ? h('div', { class: 'logo-prev' }, h('img', { src: brandLogoUrl(b), alt: `${b.name} logo` })) : h('div', { class: 'logo-prev empty' }, 'No logo'),
      h('div', { class: 'vtools' }, h('label', { class: 'btn' }, b.logo ? 'Change logo' : '＋ Add logo', logoFile),
        b.logo ? h('button', { type: 'button', class: 'btn', onclick: () => { closeDrawer(true); openLogoEditor(b) } }, '✂ Crop / rotate / background') : '',
        b.logo ? h('button', { type: 'button', class: 'btn danger', onclick: removeLogo }, 'Remove logo') : ''),
      h('p', { class: 'hint' }, 'Optional. Any picture of the logo works (PNG, JPG, a photo). A plain white or grey background is removed automatically. Use ✂ to choose exactly which part to keep.'))
    const save = async () => { if (await act(() => api('POST', '/api/brand', { brand: { id: b.id, name: f.name.value, te: f.te.value }, originalId: isNew ? null : b.id }), 'Saved ✓')) { await load(); closeDrawer(true); render() } }
    const del = async () => { if (!confirm(`Delete the brand “${b.name}”?`)) return; if (await act(() => api('DELETE', `/api/brand/${b.id}`), 'Brand deleted')) { await load(); closeDrawer(true); render() } }
    openDrawer(isNew ? 'Add a brand' : `Edit brand: ${b.name}`, h('form', { id: 'bform', onsubmit: (e) => { e.preventDefault(); save() } },
      h('fieldset', {}, h('legend', {}, 'Brand'), h('div', { class: 'grid2' }, field('Brand name', f.name, null, true), field('Telugu (optional)', f.te)),
        !isNew ? h('p', { class: 'hint' }, `${used} product${used === 1 ? '' : 's'} use this brand.`) : ''),
      h('fieldset', {}, h('legend', {}, 'Logo (optional)'), logoBox)), [
      h('button', { class: 'btn primary', type: 'submit', form: 'bform' }, isNew ? 'Add brand' : 'Save'),
      h('span', { class: 'spacer' }),
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: del, disabled: used > 0, title: used ? 'Change or delete its products first' : '' }, 'Delete brand') : '',
    ])
  }

  // ───────── LOGO EDITOR: choose the part to keep, rotate, remove the plain background ─────────
  function openLogoEditor(b) {
    const st = { rot: b.logoEdit?.rotate || 0, sel: b.logoEdit?.crop ? { ...b.logoEdit.crop } : { x: 0, y: 0, w: 1, h: 1 }, clean: b.logoEdit?.clean !== false }
    const MIN = 0.03
    const img = h('img', { alt: '', draggable: 'false' })
    const sel = h('div', { class: 'lg-sel' }, ['nw', 'ne', 'sw', 'se'].map((c) => h('span', { class: `lg-h ${c}`, 'data-h': c })))
    const wrap = h('div', { class: 'lg-wrap' }, img, sel)
    const prevLight = h('canvas', { width: 260, height: 130 }), prevDark = h('canvas', { width: 260, height: 130 })
    const clean = h('input', { type: 'checkbox', checked: st.clean })
    const info = h('p', { class: 'hint lg-info' })
    const clamp = () => {
      const s = st.sel
      s.w = Math.min(1, Math.max(MIN, s.w)); s.h = Math.min(1, Math.max(MIN, s.h))
      s.x = Math.min(1 - s.w, Math.max(0, s.x)); s.y = Math.min(1 - s.h, Math.max(0, s.y))
    }
    function draw() {
      clamp()
      const s = st.sel
      Object.assign(sel.style, { left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` })
      const full = s.x < 0.002 && s.y < 0.002 && s.w > 0.996 && s.h > 0.996
      info.textContent = full ? 'Whole picture selected: empty borders are cut off automatically.' : `Keeping ${Math.round(s.w * 100)}% × ${Math.round(s.h * 100)}% of the picture.`
      if (!img.naturalWidth) return
      for (const [cv, bg] of [[prevLight, '#f6f4ee'], [prevDark, '#3a1210']]) {
        const c = cv.getContext('2d')
        c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height)
        const sw = s.w * img.naturalWidth, sh = s.h * img.naturalHeight
        const k = Math.min((cv.width - 24) / sw, (cv.height - 24) / sh)
        c.drawImage(img, s.x * img.naturalWidth, s.y * img.naturalHeight, sw, sh, (cv.width - sw * k) / 2, (cv.height - sh * k) / 2, sw * k, sh * k)
      }
    }
    const load = () => { img.src = `/brandsrc/${b.id}.png?rotate=${st.rot}&t=${Date.now()}` }
    img.addEventListener('load', draw)
    // pointer: drag on the picture = new box; drag the box = move; drag a corner = resize
    let drag = null
    const pt = (e) => { const r = img.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) } }
    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      wrap.setPointerCapture(e.pointerId)
      const p = pt(e), s = { ...st.sel }
      const corner = e.target.dataset?.h
      const whole = s.x < 0.002 && s.y < 0.002 && s.w > 0.996 && s.h > 0.996 // whole picture: a drag draws a new box
      drag = corner ? { mode: 'size', corner, s } : e.target === sel && !whole ? { mode: 'move', p, s } : { mode: 'new', p }
      if (drag.mode === 'new') { st.sel = { x: p.x, y: p.y, w: MIN, h: MIN }; draw() }
    })
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return
      const p = pt(e)
      if (drag.mode === 'move') st.sel = { ...drag.s, x: drag.s.x + p.x - drag.p.x, y: drag.s.y + p.y - drag.p.y }
      else if (drag.mode === 'new') st.sel = { x: Math.min(p.x, drag.p.x), y: Math.min(p.y, drag.p.y), w: Math.abs(p.x - drag.p.x), h: Math.abs(p.y - drag.p.y) }
      else {
        const s = drag.s, right = s.x + s.w, bottom = s.y + s.h
        const x1 = drag.corner.includes('w') ? Math.min(p.x, right - MIN) : s.x, x2 = drag.corner.includes('e') ? Math.max(p.x, s.x + MIN) : right
        const y1 = drag.corner.includes('n') ? Math.min(p.y, bottom - MIN) : s.y, y2 = drag.corner.includes('s') ? Math.max(p.y, s.y + MIN) : bottom
        st.sel = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
      }
      draw()
    })
    const end = () => { drag = null }
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end)
    const rotate = (d) => { st.rot = (st.rot + d + 360) % 360; st.sel = { x: 0, y: 0, w: 1, h: 1 }; load() }
    const root = h('div', { class: 'lg-overlay' })
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey, true) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('keydown', onKey, true)
    async function save() {
      const s = st.sel, full = s.x < 0.002 && s.y < 0.002 && s.w > 0.996 && s.h > 0.996
      if (await act(() => api('POST', `/api/brand/${b.id}/logo-edit`, { rotate: st.rot, crop: full ? null : s, clean: clean.checked }), 'Logo saved ✓')) { close(); await load2(); render() }
    }
    const load2 = () => api('GET', '/api/state').then((x) => { S = x; renderStatus(S.build, S.changes) })
    root.append(h('div', { class: 'lg-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Edit logo: ${b.name}` },
      h('div', { class: 'lg-head' }, h('h2', {}, `Edit logo · ${b.name}`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'lg-body' },
        h('div', { class: 'lg-left' },
          h('div', { class: 'lg-tools' },
            h('button', { type: 'button', class: 'btn small', onclick: () => rotate(-90) }, '⟲ Rotate left'),
            h('button', { type: 'button', class: 'btn small', onclick: () => rotate(90) }, '⟳ Rotate right'),
            h('button', { type: 'button', class: 'btn small', onclick: () => { st.sel = { x: 0, y: 0, w: 1, h: 1 }; draw() } }, '⤢ Whole picture')),
          h('div', { class: 'lg-stage' }, wrap),
          h('p', { class: 'hint' }, 'Drag on the picture to choose the part to keep. Drag the box to move it, or a corner to resize it.'), info),
        h('div', { class: 'lg-right' },
          h('p', { class: 'sd-h' }, 'Preview'), prevLight, prevDark,
          h('label', { class: 'check-line' }, clean, h('span', {}, h('strong', {}, 'Remove plain background'), ' — white or grey around the logo becomes see-through (done when you save)')))),
      h('div', { class: 'lg-foot' }, h('button', { type: 'button', class: 'btn primary', onclick: save }, 'Save logo'), h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'))))
    document.body.append(root)
    load()
    draw()
  }

  // ───────── PHOTO CROP / ADJUST ─────────
  // The "stage" is a square whose side is the photo's longer edge, with the photo centred in it.
  // The crop box {x, y, s} is in fractions (0–1) of the stage side. Areas outside the photo become white.
  function openCropper(slug, ph, done, endpoint) {
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
      const ok = await act(() => api('POST', endpoint || `/api/photo/${slug}/crop`, { name: ph.name, crop }), crop ? 'Photo adjusted ✓' : 'Back to automatic ✓')
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
            h('button', { class: 'btn small', type: 'button', onclick: () => { filters = { q: '', cat: c.slug }; switchTab('types') } }, 'Types'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { pf = { q: '', cat: c.slug, type: '', brand: '', stock: '' }; switchTab('products') } }, 'Products'),
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
      if (p.error) result.replaceChildren(h('p', { class: 'pub-error' }, p.error), h('button', { class: 'btn', type: 'button', onclick: () => { closeDrawer(true); switchTab('help'); setTimeout(() => document.getElementById('if-publishing-fails')?.scrollIntoView({ block: 'start' }), 50) } }, '❓ What should I do? (Help)'))
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
    const s = (t) => h('strong', {}, t)
    const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text)
    const problem = (title, open, ...body) => h('details', { class: 'trouble', open: open || null }, h('summary', {}, title), h('div', {}, ...body))
    $('#main').replaceChildren(h('div', { class: 'help' },
      h('h2', {}, 'Quick guide: how the shop is organised'),
      h('ol', { class: 'guide' },
        h('li', {}, s('Category'), ' – a shelf area, e.g. Household Cleaning. (Categories tab)'),
        h('li', {}, s('Type'), ' – what customers look for, e.g. Detergent Powder. It has the photo, Telugu name, description and other names for search. (Types tab)'),
        h('li', {}, s('Brand'), ' – e.g. Rin, Tide. Add once, then pick it in products. Renaming a brand renames it everywhere. (Brands tab)'),
        h('li', {}, s('Product + sizes'), ' – e.g. “Rin Detergent Powder” in ₹10 sachet, ½ kg, 1 kg. Each size has its own price, photos, description and stock. (Products tab)')),
      h('h2', {}, 'Products tab – everyday work'),
      h('ul', { class: 'guide' },
        h('li', {}, s('Find a product:'), ' type in the search box, or use the filters: category, type, brand, and “Show” (out of stock, ⚠ needs attention, without price, without photo, puja kits, home page, hidden).'),
        h('li', {}, s('One row = one product.'), ' The small buttons are its sizes (crossed out = out of stock, red edge = rupees written in the size). Click the name or a size to open the product.'),
        h('li', {}, s('The product screen'), ' shows everything about the product on one page: name, brand and type at the top, then a table with ', s('every size'), ' (size, price, in stock, photos). Change anything, then press ', s('Save'), '.'),
        h('li', {}, s('Add a size:'), ' “＋ Add another size” under the table (or “＋ size” in the list). Type the size (e.g. “1 kg”) and the price (e.g. “₹55”). Brand, type and name are shared, so you never type them again.'),
        h('li', {}, s('Order of sizes:'), ' ↑ ↓ in the table. The first size in stock is the one customers see first on the card.'),
        h('li', {}, s('More ▾'), ' on a size opens its details: sold loose, counted in (pieces, sets …), quick amounts, its own description, extra search names, and its ', s('photos'), '.'),
        h('li', {}, s('Remove a size:'), ' 🗑 in its row, then Save. ', s('Delete product'), ' (bottom right) removes the product with all its sizes.'),
        h('li', {}, s('Size and price:'), ' put only the size in Size (“50 g packet”, “½ kg”, “Big”) and the rupees in Price (“₹10”). Never write the price inside the size.')),
      h('h2', {}, '₹ Prices & stock (quick edit)'),
      h('ul', { class: 'guide' },
        h('li', {}, 'Click ', s('₹ Prices & stock'), ' above the filters. Every size is one line with its size, price and stock switch.'),
        h('li', {}, 'Type a price and press ', s('Enter'), ': it is saved straight away (the box turns green). Flip the switch for in stock / out of stock.'),
        h('li', {}, s('Fix sizes with rupees:'), ' choose “Show: ₹ written in the size”. Click ', s('Move ₹10 to Price'), ': the ₹10 goes into Price and the size box is selected so you can type the real size (e.g. “10 g packet”).'),
        h('li', {}, 'Choose “Show: ⚠ Needs attention” to see every size without a price or photo.')),
      h('h2', {}, 'On the website: label, home page, hide'),
      h('ul', { class: 'guide' },
        h('li', {}, s('Label on the card:'), ' a small badge on the product photo, e.g. “New”, “Popular”, “Fresh stock”, or your own words (up to 20 letters).'),
        h('li', {}, s('★ Show on the home page:'), ' the product appears in “Popular at the shop” on the home page. Choose a few favourites (8–12 looks best).'),
        h('li', {}, s('Hide from the website:'), ' takes the product off the website but keeps it here. For “not available today”, switch off In stock instead: customers still see it, with the Add button greyed out.')),
      h('h2', {}, '🪔 Puja kits'),
      h('ul', { class: 'guide' },
        h('li', {}, 'A puja kit (e.g. Varalakshmi Vratham Kit) is a product whose ', s('contents are other products of the shop'), ', each with an amount.'),
        h('li', {}, s('New kit:'), ' “🪔 Add puja kit” at the top of the Products tab. Give it a name and Telugu name, then open ', s('More ▾'), ' on its size to fill the contents.'),
        h('li', {}, s('Contents:'), ' type in “Find a product” (e.g. “camphor”) and click a result to add it. For each item choose the size and the amount: ', s('how many'), ', or ', s('grams'), ' for loose items (e.g. 250). Use ↑ to reorder, ✕ to remove.'),
        h('li', {}, 'On the website the kit page shows “What’s inside”. Customers can untick what they already have, change sizes and amounts, and add the whole kit in one tap. In My list and on WhatsApp the items are listed under the kit’s name.'),
        h('li', {}, 'Out-of-stock items stay in the kit but are not added. If a product in a kit is deleted, it is taken out of the kit automatically.'),
        h('li', {}, 'Festivals are separate: to show a kit on a festival page, add the kit’s type to that festival’s items in the Festivals tab.')),
      h('h2', {}, 'Loose items (rice, dals, spices sold by weight)'),
      h('ul', { class: 'guide' },
        h('li', {}, 'Open ', s('More ▾'), ' on the size and tick ', s('Sold loose by weight'), '. Then choose ', s('Starts from'), ' (smallest amount) and ', s('Each + adds'), ' (the step).'),
        h('li', {}, 'Examples: dals, rice, dry chillies → starts 250 g, + adds 250 g. Cardamom, cloves, kaju → starts 25 g, + adds 25 g. Very costly items (e.g. pista, japathri) → starts 10 g, + adds 10 g.'),
        h('li', {}, 'Customers can also type an amount (e.g. 7 kg). It is rounded to your steps.')),
      h('h2', {}, 'Types and brands'),
      h('ul', { class: 'guide' },
        h('li', {}, s('New type:'), ' Types tab → “＋ Add type” → name, Telugu name, category, description, photo. Then add its products in the Products tab.'),
        h('li', {}, s('Find a brand:'), ' Brands tab → type in the search box, or choose “With logo / Without logo / Not used”.'),
        h('li', {}, s('Edit a logo:'), ' click the logo (or “✂ Logo”). Drag on the picture to choose the part to keep, drag the box to move it, or a corner to resize. ⟲ ⟳ rotate. Tick “Remove plain background” to make white or grey around the logo see-through. The preview shows it on a light and a dark background. Press “Save logo”. You can change it again any time.'),
h('li', {}, s('Brand logo (optional):'), ' Brands tab → click “＋ logo” (or Edit) → “＋ Add logo”. Any picture of the logo works (PNG, JPG or a photo). The logo then shows on product cards, product pages, the brand buttons, search, and in “Brands at the shop” on the home page. A product without a photo shows its brand logo instead of a plain name tile. No logo? The brand name is shown, as before.'),
        h('li', {}, s('Brands of a type:'), ' when you choose a type in a product, the brand list shows that type’s brands first. Picking another brand adds it to the type.'),
        h('li', {}, s('Price note:'), ' a type can have a general note like “₹30 – ₹45, depending on size”. Exact prices go on each size.')),
      h('h2', {}, 'Putting changes on the website'),
      h('ul', { class: 'guide' },
        h('li', {}, 'Every save updates the preview on this computer. Click ', s('View in browser'), ' to check it.'),
        h('li', {}, 'When you are happy, click ', s('🚀 Publish to website'), '. The live site updates in 1–2 minutes.')),
      h('h2', {}, 'How this editor works'),
      h('p', {}, 'This editor runs only on this computer. It changes the website’s files here and rebuilds a preview automatically after every save.'),
      h('ol', {},
        h('li', {}, 'Add or edit products, photos, categories and festivals here.'),
        h('li', {}, 'Click ', s('View in browser'), ' (top right) to check the website exactly as visitors will see it.'),
        h('li', {}, 'When you are happy, click ', s('🚀 Publish to website'), ', then ', s('Publish now'), '. The website is rebuilt, checked, saved and uploaded. Wait for ', s('“🎉 Your changes are live!”'), ' (usually 1–2 minutes).')),

      h('h2', {}, 'Telugu typing'),
      h('ul', {},
        h('li', {}, 'In any Telugu box, type the word in English letters: ', h('code', {}, 'kandi pappu'), ' becomes ', h('span', { lang: 'te' }, 'కంది పప్పు'), '.'),
        h('li', {}, s('Space'), ' uses the first spelling, ', s('1–6'), ' (or a click) picks another one, ', s('Esc'), ' keeps the English word.'),
        h('li', {}, 'Turn it on or off with the ', s('అ Telugu typing'), ' button at the top, or press ', s('Ctrl+G'), '.')),

      h('h2', {}, 'Photos'),
      h('ul', {},
        h('li', {}, 'Open a product, click ', s('More ▾'), ' on a size (or click its photo square). Add several photos per size. The first one is the main photo (cards, lists, search).'),
        h('li', {}, 'Use ← → to reorder, ', s('Make main'), ' to move a photo to the front, 🗑 to delete, ', s('✂ Adjust / crop'), ' to choose the part that shows.'),
        h('li', {}, 'A product without a photo shows a coloured name tile. Add a photo of that pack to replace the tile.'),
        h('li', {}, 'Use your own photos or brand pack shots. Avoid copying photos from shopping websites.')),

      h('h2', {}, 'Festivals'),
      h('ul', {},
        h('li', {}, 'Each festival has its suggested items, a "before" message, a festival-day greeting, and dates for each year.'),
        h('li', {}, s('Once a year'), ', open each festival and click "Add next year", then correct the dates from the panchangam. Festivals without an upcoming date are marked "needs a new date".'),
        h('li', {}, 'Preview any day by opening ', h('code', {}, `${PREVIEW()}/?fest-date=2027-01-14`), '.')),

      h('h2', { id: 'if-publishing-fails' }, 'If publishing fails'),
      h('div', { class: 'callout-ok' },
        h('p', {}, s('Your work is never lost. '), 'Once “Saving this version ✅” is ticked, your changes are safe on this computer, even if the upload fails.'),
        h('p', {}, s('Trying again is always safe. '), 'Pressing Publish again never duplicates or breaks anything. You can keep editing while you wait; the next publish sends everything together.')),
      h('p', {}, 'Read the red message at the bottom of the Publish window and open the matching problem below:'),
      problem('“GitHub is having a problem right now (not your fault)”', true,
        h('p', {}, 'GitHub (where the website is stored) is having a short outage. The editor already tried 3 times.'),
        h('ol', {},
          h('li', {}, 'Wait 15–30 minutes. Do nothing else.'),
          h('li', {}, 'Click ', s('🚀 Publish to website'), ' → ', s('Publish now'), ' again. It will list “saved version(s) waiting to be uploaded”, which is normal.'),
          h('li', {}, 'Still failing? Open ', ext('https://www.githubstatus.com/', 'githubstatus.com'), '. If it is not all green, GitHub is still down: try again later (even the next day is fine).'))),
      problem('“GitHub needs you to sign in again”', false,
        h('ol', {},
          h('li', {}, 'Open the ', h('code', {}, 'static-site'), ' folder in File Explorer.'),
          h('li', {}, 'Click the address bar, type ', h('code', {}, 'cmd'), ' and press Enter. A black window opens.'),
          h('li', {}, 'Type ', h('code', {}, 'git push'), ' and press Enter. A GitHub sign-in window opens: sign in.'),
          h('li', {}, 'Come back here and publish again.'))),
      problem('“No internet connection to GitHub”', false,
        h('p', {}, 'Check the Wi-Fi or mobile data on this computer, then publish again.')),
      problem('“GitHub has newer changes than this computer”', false,
        h('p', {}, 'Someone changed the website directly on GitHub or from another computer. ', s('Do not try to fix this yourself.'), ' Ask Claude to “sync the static site”; it will merge both safely. Your changes here stay saved.')),
      problem('“Uploaded, but the live site has not updated yet”', false,
        h('p', {}, 'GitHub received your changes, but Cloudflare (which shows the website) has not put them live yet.'),
        h('ol', {},
          h('li', {}, 'Wait 5 minutes and refresh ', ext('https://shop.myconnect.sbs/', 'shop.myconnect.sbs'), '.'),
          h('li', {}, 'Still old? Open ', ext('https://dash.cloudflare.com/', 'dash.cloudflare.com'), ' → ', s('Workers & Pages'), ' → ', s('janardhan-general-stores'), ' → ', s('Deployments'), '.'),
          h('li', {}, 'If the newest one says ', s('Failed'), ', open it and click ', s('Retry deployment'), '. If Cloudflare itself has problems (', ext('https://www.cloudflarestatus.com/', 'cloudflarestatus.com'), '), just wait.'))),
      problem('“The website could not be built” or “The check found problems”', false,
        h('p', {}, 'Nothing was published, so the live website is untouched. Usually a box was left empty or a photo is broken. Take a screenshot of the Publish window and send it to Claude.')),
      problem('Something else, or not sure', false,
        h('p', {}, 'Take a screenshot of the whole Publish window (including the red text) and send it to Claude. Your changes are safe in the meantime.')),

      h('h2', {}, 'Closing'),
      h('p', {}, 'Close the black editor window (or press Ctrl+C in it) when you are done. Your changes are already saved.'),
    ))
  }

  // ───────── TELUGU TYPING: type in English letters, get Telugu (like Google's Telugu keyboard) ─────────
  // Works in every Telugu box (lang="te"). Type "kandi pappu" → కంది పప్పు. Each word turns into Telugu when you
  // press Space, Enter, Tab or a comma/full stop. A small list shows other spellings: click one, or press 1–6.
  // Esc keeps the word in English. Words come from Google's Telugu engine; without internet, built-in rules are used.
  const TeIME = (() => {
    let on = localStorage.getItem('te-ime') !== 'off'
    const cache = new Map() // word → options
    const V = { a: ['అ', ''], aa: ['ఆ', 'ా'], i: ['ఇ', 'ి'], ii: ['ఈ', 'ీ'], ee: ['ఈ', 'ీ'], u: ['ఉ', 'ు'], uu: ['ఊ', 'ూ'], oo: ['ఊ', 'ూ'],
      e: ['ఎ', 'ె'], ae: ['ఏ', 'ే'], ai: ['ఐ', 'ై'], o: ['ఒ', 'ొ'], oa: ['ఓ', 'ో'], au: ['ఔ', 'ౌ'], ou: ['ఔ', 'ౌ'] }
    const C = { ksh: 'క్ష', chh: 'ఛ', kh: 'ఖ', gh: 'ఘ', ch: 'చ', jh: 'ఝ', th: 'త', dh: 'ద', ph: 'ఫ', bh: 'భ', sh: 'శ', k: 'క', g: 'గ', c: 'చ', j: 'జ',
      t: 'ట', d: 'డ', n: 'న', p: 'ప', f: 'ఫ', b: 'బ', m: 'మ', y: 'య', r: 'ర', l: 'ల', v: 'వ', w: 'వ', s: 'స', h: 'హ', x: 'క్స', z: 'జ', q: 'క' }
    const vKeys = Object.keys(V).sort((a, b) => b.length - a.length)
    const cKeys = Object.keys(C).sort((a, b) => b.length - a.length)
    /** Offline fallback: simple phonetic rules (Google's engine is used whenever there is internet). */
    function rules(word) {
      const w = word.toLowerCase()
      let out = '', i = 0, afterC = false
      while (i < w.length) {
        const v = vKeys.find((k) => w.startsWith(k, i))
        if (v) { out += afterC ? V[v][1] : V[v][0]; i += v.length; afterC = false; continue }
        const c = cKeys.find((k) => w.startsWith(k, i))
        if (!c) { i++; continue }
        const atEnd = i + c.length === w.length
        const nextIsC = !atEnd && !vKeys.some((k) => w.startsWith(k, i + c.length))
        // n/m before another consonant (kandi, pampu) and m at the end (deepam) become the round "ం".
        if ((c === 'n' || c === 'm') && out && !afterC && (nextIsC || (c === 'm' && atEnd))) { out += 'ం'; i += c.length; continue }
        if (afterC) out += '్'
        out += C[c]; i += c.length; afterC = true
      }
      if (afterC) out += '్'
      return out
    }
    async function options(word) {
      const key = word.toLowerCase()
      if (cache.has(key)) return cache.get(key)
      let list = []
      try { list = (await api('GET', `/api/telugu?text=${encodeURIComponent(key)}`)).options || [] } catch {}
      if (!list.length) { const local = rules(key); if (local) list = [local] }
      else cache.set(key, list)
      return list
    }

    const box = h('div', { class: 'te-ime', role: 'listbox', 'aria-label': 'Telugu spellings', hidden: true })
    document.body.append(box)
    let cur = null // { el, start, end, word, list, pick, seq }
    let seq = 0
    const isTe = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.lang === 'te' && !el.readOnly
    function wordAtCaret(el) {
      const end = el.selectionStart
      if (end == null || end !== el.selectionEnd) return null
      const m = el.value.slice(0, end).match(/[A-Za-z]+$/)
      return m ? { start: end - m[0].length, end, word: m[0] } : null
    }
    function hide() { box.hidden = true; cur = null }
    function draw() {
      if (!cur || !cur.list.length) { box.hidden = true; return }
      box.replaceChildren(
        ...cur.list.map((o, i) => h('button', { type: 'button', role: 'option', 'aria-selected': String(i === cur.pick), class: i === cur.pick ? 'on' : '', lang: 'te',
          onmousedown: (e) => { e.preventDefault(); cur.pick = i; commit('') } }, h('small', {}, String(i + 1)), o)),
        h('span', { class: 'te-ime-hint' }, 'Space = use · 1–6 = choose · Esc = keep English'))
      const r = cur.el.getBoundingClientRect()
      box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 380))}px`
      box.style.top = `${r.bottom + 4}px`
      box.hidden = false
    }
    async function refresh(el) {
      const w = wordAtCaret(el)
      if (!w) { hide(); return }
      const my = ++seq
      const local = rules(w.word)
      cur = { el, ...w, list: cache.get(w.word.toLowerCase()) || (local ? [local] : []), pick: 0, seq: my }
      draw()
      const list = await options(w.word)
      if (!cur || cur.seq !== my) return
      cur.list = list
      cur.pick = 0
      draw()
    }
    /** Replace the English word with the chosen Telugu word (and add `after`, e.g. a space). */
    function commit(after) {
      if (!cur) return false
      const { el, start, end, word } = cur
      const te = cur.list[cur.pick] || rules(word)
      if (el.value.slice(start, end) !== word || !te) { hide(); return false }
      el.setRangeText(te + after, start, end, 'end')
      hide()
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    /** Wait for Google's answer before converting (people often press Space very quickly). */
    async function commitWhenReady(after) {
      const c = cur
      if (!c) return
      const list = await options(c.word)
      if (cur !== c) return
      if (list.length) { c.list = list; c.pick = Math.min(c.pick, list.length - 1) }
      commit(after)
    }
    document.addEventListener('input', (e) => { if (on && e.isTrusted && isTe(e.target)) refresh(e.target) })
    document.addEventListener('keydown', (e) => {
      if (!on || !isTe(e.target) || !cur || cur.el !== e.target) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return }
      if (/^[1-6]$/.test(e.key) && cur.list[Number(e.key) - 1]) { e.preventDefault(); cur.pick = Number(e.key) - 1; commit(''); return }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && cur.list.length) { e.preventDefault(); cur.pick = (cur.pick + (e.key === 'ArrowDown' ? 1 : cur.list.length - 1)) % cur.list.length; draw(); return }
      const after = { ' ': ' ', Enter: '', Tab: '', ',': ', ', '.': '. ', '!': '! ', '?': '? ' }[e.key]
      if (after === undefined) return
      if (e.key === 'Tab') { commit(''); return } // Tab still moves to the next box
      e.preventDefault()
      commitWhenReady(e.key === 'Enter' && e.target.tagName === 'TEXTAREA' ? '\n' : after)
    }, true)
    document.addEventListener('focusout', (e) => { if (cur && cur.el === e.target) commit('') })
    addEventListener('scroll', () => { if (cur) draw() }, true)
    addEventListener('resize', () => { if (cur) draw() })
    // Hint on every Telugu box.
    document.addEventListener('focusin', (e) => {
      if (isTe(e.target) && (!e.target.placeholder || e.target.dataset.imeHint)) {
        e.target.placeholder = on ? 'Type in English, e.g. kandi pappu → కంది పప్పు' : ''
        e.target.dataset.imeHint = '1'
      }
    })
    function toggle() {
      on = !on
      localStorage.setItem('te-ime', on ? 'on' : 'off')
      hide()
      paint()
      toast(on ? 'Telugu typing ON: type English letters in Telugu boxes' : 'Telugu typing OFF: Telugu boxes take what you type as it is')
    }
    const btn = h('button', { type: 'button', class: 'btn small te-toggle', title: 'Type English letters in Telugu boxes and get Telugu letters (Ctrl+G)', onclick: toggle })
    function paint() { btn.textContent = on ? 'అ Telugu typing: ON' : 'అ Telugu typing: OFF'; btn.classList.toggle('off', !on) }
    paint()
    document.addEventListener('keydown', (e) => { if (e.ctrlKey && !e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); toggle() } })
    return { btn, rules }
  })()
  document.querySelector('.top-actions')?.prepend(TeIME.btn)

  // ───────── tabs ─────────
  function render() {
    if (!S) return
    ;({ products: renderSkus, types: renderTypes, brands: renderBrands, categories: renderCategories, festivals: renderFestivals, help: renderHelp })[tab]()
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
