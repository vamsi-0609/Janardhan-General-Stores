// Client-side catalogue search over the static index (no server, no external requests).
//  • Every page: the header search boxes show live suggestions as you type (products, categories, festivals).
//  • /search/: the full results page, also updated on every keystroke.
;(() => {
  const INDEX_URL = document.documentElement.dataset.searchIndex
  if (!INDEX_URL) return

  // ───────── matching ─────────
  // Normalise: lower-case, strip Latin accents, keep Telugu, collapse punctuation.
  const base = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/[^a-z0-9ఀ-౿]+/g, ' ').trim()
  // Loose form for transliteration variants: kandhi ≈ kandi, pappu ≈ papu, agarbathi ≈ agarbatti, w ≈ v, ee ≈ i, oo ≈ u.
  const loose = (s) => base(s).replace(/([a-z])\1+/g, '$1').replace(/([bcdgjkpt])h/g, '$1').replace(/w/g, 'v').replace(/ee/g, 'i').replace(/oo/g, 'u')

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]
      let best = i
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        best = Math.min(best, cur[j])
      }
      if (best > max) return max + 1
      prev = cur
    }
    return prev[b.length]
  }

  function prepare(item) {
    const name = loose(item.n)
    const te = base(item.t)
    const aliases = loose(item.a.join(' '))
    const brands = loose((item.b || []).join(' '))
    const cat = loose(`${item.c} ${item.s}`) + ' ' + base(item.ct)
    const all = `${name} ${te} ${aliases} ${cat}`
    // Exact (not loosened) word lists, for 1–2 letter typing.
    const bName = base(item.n).split(' ')
    const bOther = base(`${item.a.join(' ')} ${(item.b || []).join(' ')}`).split(' ')
    return { ...item, _name: name, _te: te, _aliases: aliases, _brands: brands, _all: all, _words: [...new Set(all.split(' '))].filter((w) => w.length >= 3), _bName: bName, _bOther: bOther }
  }

  // 1–2 letters: only words that START with exactly what was typed (so "gh" finds ghee, not every "g").
  function scoreShort(item, t) {
    if (item._bName[0]?.startsWith(t)) return 100
    if (item._bName.some((w) => w.startsWith(t))) return 75
    if (item._te.split(' ').some((w) => w.startsWith(t))) return 70
    if (item._bOther.some((w) => w.startsWith(t))) return 30
    return 0
  }

  // Score one typed word against one item. Higher = better. 0 = no match.
  function scoreTerm(item, term) {
    if (item._name === term) return 120
    if (item._name.startsWith(term)) return 100
    if (item._name.split(' ').some((w) => w.startsWith(term))) return 75
    if (item._te.startsWith(term)) return 72
    if (item._te.split(' ').some((w) => w.startsWith(term))) return 66
    if (item._brands && item._brands.split(' ').some((w) => w.startsWith(term))) return 62
    if (item._aliases.split(' ').some((w) => w.startsWith(term))) return 55
    if (term.length >= 3 && (item._name.includes(term) || item._aliases.includes(term) || item._te.includes(term))) return 40
    if (item._all.split(' ').some((w) => w.startsWith(term))) return 18
    if (term.length >= 3 && item._all.includes(term)) return 12
    // Typos: "tumeric" → turmeric, "macroni" → macaroni (Latin letters only).
    if (term.length >= 4 && /^[a-z]+$/.test(term)) {
      const max = term.length >= 7 ? 2 : 1
      if (item._words.some((w) => lev(term, w.slice(0, term.length + 1), max) <= max || lev(term, w, max) <= max)) return 8
    }
    return 0
  }

  // All typed words must match. While typing, the last word is treated as a prefix (already the case above).
  function search(index, q, section = 'all') {
    const raw = base(q).split(' ').filter(Boolean)
    if (!raw.length) return []
    // Short words are matched exactly; longer ones in the loose (spelling-tolerant) form.
    const terms = raw.map((w) => (w.length <= 2 || loose(w).length < 3 ? { t: w, short: true } : { t: loose(w), short: false })).filter((x) => x.t)
    const pool = section === 'all' ? index : index.filter((i) => i.sec === section)
    const out = []
    for (const item of pool) {
      let total = 0
      let strong = true // every typed word matches the start of a word in the name (English or Telugu)
      for (const { t, short } of terms) {
        const s = short ? scoreShort(item, t) : scoreTerm(item, t)
        if (!s) { total = -1; break }
        // For a festival, its other names (diwali, dasara, pongal …) count as its name.
        if (s < 66 && !(item.f && s >= 55 && t.length >= 4)) strong = false
        total += s
      }
      if (total < 0) continue
      // Festivals and categories are only promoted when their own name matches, not via a side word.
      if (item.k === 'c' && !strong) continue
      if (strong && item.f) total += 40
      else if (strong && item.k === 'c') total += 15
      out.push({ item, total })
    }
    return out.sort((a, b) => b.total - a.total || a.item.n.length - b.item.n.length || a.item.n.localeCompare(b.item.n)).map((r) => r.item)
  }

  let indexPromise
  const loadIndex = () => (indexPromise ||= fetch(INDEX_URL).then((r) => r.json()).then((d) => d.map(prepare)))

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  // Bold the part of the name that matches what was typed.
  function highlight(text, q) {
    const words = base(q).split(' ').filter(Boolean).sort((a, b) => b.length - a.length)
    if (!words.length) return esc(text)
    const lower = text.toLowerCase()
    const marks = new Array(text.length).fill(false)
    for (const w of words) {
      let i = lower.indexOf(w)
      while (i !== -1) {
        const atStart = i === 0 || /[^a-z0-9ఀ-౿]/i.test(lower[i - 1])
        if (atStart) for (let k = i; k < i + w.length; k++) marks[k] = true
        i = lower.indexOf(w, i + 1)
      }
    }
    let out = '', open = false
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true }
      if (!marks[i] && open) { out += '</mark>'; open = false }
      out += esc(text[i])
    }
    return out + (open ? '</mark>' : '')
  }

  // The brand that matched what was typed (shown in suggestions), if the name itself did not match.
  function brandHit(x, q) {
    const words = base(q).split(' ').filter(Boolean)
    if (!x.b?.length || words.every((w) => base(x.n).split(' ').some((n) => n.startsWith(w)))) return ''
    return x.b.find((b) => words.some((w) => base(b).split(' ').some((bw) => bw.startsWith(w)))) || ''
  }

  // ───────── header: live suggestions on every page ─────────
  const MAX = 8
  let uid = 0
  function attachSuggest(form) {
    const input = form.querySelector('input[name="q"]')
    if (!input || form.closest('[data-search-root]')) return
    const id = `sugg-${++uid}`
    const list = document.createElement('div')
    list.className = 'suggest-box'
    list.id = id
    list.hidden = true
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', 'Search suggestions')
    form.classList.add('has-suggest')
    form.append(list)
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')
    input.setAttribute('aria-controls', id)
    let options = []
    let active = -1
    let lastQ = ''

    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1 }
    const setActive = (i) => {
      options.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)))
      active = i
      if (i >= 0) { input.setAttribute('aria-activedescendant', options[i].id); options[i].scrollIntoView({ block: 'nearest' }) }
      else input.removeAttribute('aria-activedescendant')
    }
    async function update() {
      const q = input.value.trim()
      lastQ = q
      if (!q) { close(); return }
      let index
      try { index = await loadIndex() } catch { close(); return }
      if (q !== lastQ) return // a newer keystroke is already being handled
      const all = search(index, q)
      // Best matches in ranked order: at most 1 festival and 2 categories, the rest products.
      const picked = []
      let nf = 0, nc = 0
      for (const x of all) {
        if (x.f && nf++ >= 1) continue
        if (x.k === 'c' && nc++ >= 2) continue
        picked.push(x)
        if (picked.length >= MAX) break
      }
      const nProducts = all.filter((x) => !x.f && x.k !== 'c').length
      const row = (x, kind, i) => `<a class="sg-row${kind ? ` sg-${kind}` : ''}" id="${id}-o${i}" role="option" aria-selected="false" href="${esc(x.u)}"${x.f && x.col ? ` style="--fa:${esc(x.col[0])}"` : ''}>
          ${x.i ? `<img src="${esc(x.i)}" alt="" width="44" height="44" loading="lazy" decoding="async">` : '<span class="sg-noimg"></span>'}
          <span class="sg-t"><span class="sg-n">${highlight(x.n, q)}</span><span class="sg-te" lang="te">${highlight(x.t, q)}</span></span>
          <span class="sg-k">${kind === 'fest' ? 'Festival' : kind === 'cat' ? `${esc(x.cnt)} items` : brandHit(x, q) ? `Brand: ${esc(brandHit(x, q))}` : esc(x.c)}</span></a>`
      let i = 0
      const parts = []
      for (const x of picked) parts.push(row(x, x.f ? 'fest' : x.k === 'c' ? 'cat' : '', i++))
      parts.push(nProducts
        ? `<a class="sg-all" id="${id}-o${i}" role="option" aria-selected="false" href="/search/?q=${encodeURIComponent(q)}">See all ${nProducts} item${nProducts === 1 ? '' : 's'} for “${esc(q)}” →</a>`
        : parts.length ? '' : `<p class="sg-none">No match for “${esc(q)}”. Try another spelling, or <a href="/search/">browse all items</a>.</p>`)
      list.innerHTML = parts.join('')
      options = [...list.querySelectorAll('[role="option"]')]
      active = -1
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
    }
    let t
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 60) })
    input.addEventListener('focus', () => { loadIndex().catch(() => {}); if (input.value.trim()) update() })
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(options.length - 1, active + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(-1, active - 1)) }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = options[active].href }
      else if (e.key === 'Escape') { e.preventDefault(); close() }
    })
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close() })
    form.addEventListener('focusout', (e) => { if (!form.contains(e.relatedTarget)) setTimeout(() => { if (!form.contains(document.activeElement)) close() }, 120) })
  }
  document.querySelectorAll('form.search-form').forEach(attachSuggest)

  // ───────── /search/ page ─────────
  const root = document.querySelector('[data-search-root]')
  if (!root) return
  const input = root.querySelector('input[name="q"]')
  const results = root.querySelector('[data-results]')
  const status = root.querySelector('[data-status]')
  const empty = root.querySelector('[data-empty]')
  const segButtons = [...root.querySelectorAll('[data-section-filter]')]
  const params = new URLSearchParams(location.search)
  let section = params.get('section') || 'all'
  let index = []

  function card(p, q) {
    if (p.f) {
      const col = (p.col || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      return `<li class="fest-result"><a class="fest-tile" href="${p.u}"${col.length === 2 ? ` style="--fa:${col[0]};--fb:${col[1]}"` : ''}>
        <span class="ft-copy"><span class="ft-kind">Festival</span><span class="ft-name">${esc(p.n)}</span><span class="ft-te" lang="te">${esc(p.t)}</span>
        <span class="ft-count">See the ${Number(p.cnt) || ''} items to buy →</span></span>
        ${p.i ? `<span class="ft-thumbs" aria-hidden="true"><img src="${p.i}" alt="" width="80" height="80" loading="lazy" decoding="async"></span>` : ''}
      </a></li>`
    }
    if (p.k === 'c') {
      return `<li class="cat-result"><a class="cat-chip-result" href="${p.u}">${p.i ? `<img src="${p.i}" alt="" width="44" height="44" loading="lazy" decoding="async">` : ''}
        <span><span class="crk">Category · ${esc(p.s)}</span><strong>${highlight(p.n, q)}</strong> <span lang="te">${esc(p.t)}</span></span><span class="crn">${Number(p.cnt) || ''} items →</span></a></li>`
    }
    return `<li><a class="card" data-theme="${p.sec === 'puja-samagri' ? 'puja' : 'kirana'}" href="${p.u}">
      <div class="ph"><img src="${p.i}" alt="${esc(p.n)}" width="320" height="320" loading="lazy" decoding="async"></div>
      <div class="body"><span class="cat">${esc(p.c)}</span><span class="en">${highlight(p.n, q)}</span><span class="te" lang="te">${esc(p.t)}</span></div>
    </a></li>`
  }

  function render() {
    const q = input.value.trim()
    const list = search(index, q, section)
    const nItems = list.filter((x) => !x.f && x.k !== 'c').length
    results.innerHTML = list.map((x) => card(x, q)).join('')
    empty.hidden = !(q && list.length === 0)
    status.textContent = q ? `${nItems} ${nItems === 1 ? 'item' : 'items'} found for “${q}”` : 'Type a product name in English or Telugu, for example “kandi pappu”, “agarbatti” or “పసుపు”.'
    const brands = document.querySelector('.brand-filter') // long brand list is for browsing; hide it while showing results
    if (brands) brands.hidden = !!q
    const url = new URL(location.href)
    q ? url.searchParams.set('q', q) : url.searchParams.delete('q')
    section === 'all' ? url.searchParams.delete('section') : url.searchParams.set('section', section)
    history.replaceState(null, '', url)
    document.title = q ? `“${q}” — Search | Janardhan General Stores` : 'Search the catalogue | Janardhan General Stores'
  }

  segButtons.forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sectionFilter === section))
    b.addEventListener('click', () => {
      section = b.dataset.sectionFilter
      segButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      render()
    })
  })

  let t
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 50) })
  root.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); render() })

  input.value = params.get('q') || ''
  loadIndex()
    .then((data) => {
      index = data
      root.querySelector('[data-search-tools]').hidden = false
      render()
    })
    .catch(() => { status.textContent = 'Search could not load. Please browse the categories instead.' })
})()
