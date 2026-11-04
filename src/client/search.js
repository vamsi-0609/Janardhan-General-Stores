// Client-side catalogue search over the static index (no server, no external requests).
;(() => {
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

  // Normalise: lower-case, strip Latin accents, keep Telugu, collapse punctuation.
  const base = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/[^a-z0-9ఀ-౿]+/g, ' ').trim()
  // Loose form for transliteration variants: kandhi ≈ kandi, pappu ≈ papu, agarbathi ≈ agarbatti, w ≈ v.
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
    const cat = loose(`${item.c} ${item.s}`) + ' ' + base(item.ct)
    const all = `${name} ${te} ${aliases} ${cat}`
    return { ...item, _name: name, _te: te, _aliases: aliases, _all: all, _words: [...new Set(all.split(' '))] }
  }

  function scoreTerm(item, term) {
    if (item._name.startsWith(term)) return 100
    if (item._name.split(' ').some((w) => w.startsWith(term))) return 70
    if (item._te.includes(term)) return 65
    if (item._aliases.split(' ').some((w) => w.startsWith(term))) return 55
    if (item._name.includes(term) || item._aliases.includes(term)) return 40
    if (item._all.includes(term)) return 15
    if (term.length >= 4 && /^[a-z]+$/.test(term)) {
      const max = term.length >= 7 ? 2 : 1
      if (item._words.some((w) => w.length >= 3 && lev(term, w.slice(0, term.length + 1), max) <= max)) return 8
    }
    return 0
  }

  function search(q) {
    const terms = loose(q).split(' ').filter(Boolean)
    const pool = section === 'all' ? index : index.filter((i) => i.sec === section)
    if (!terms.length) return []
    return pool
      .map((item) => {
        let total = 0
        for (const t of terms) {
          const s = scoreTerm(item, t)
          if (!s) return null
          total += s
        }
        return { item, total }
      })
      .filter(Boolean)
      .sort((a, b) => b.total - a.total || a.item.n.localeCompare(b.item.n))
      .map((r) => r.item)
  }

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  function card(p) {
    return `<li><a class="card" data-theme="${p.sec === 'puja-samagri' ? 'puja' : 'kirana'}" href="${p.u}">
      <div class="ph"><img src="${p.i}" alt="${esc(p.n)}" width="320" height="320" loading="lazy" decoding="async"></div>
      <div class="body"><span class="cat">${esc(p.c)}</span><span class="en">${esc(p.n)}</span><span class="te" lang="te">${esc(p.t)}</span></div>
    </a></li>`
  }

  function render() {
    const q = input.value.trim()
    const list = search(q)
    results.innerHTML = list.map(card).join('')
    empty.hidden = !(q && list.length === 0)
    status.textContent = q ? `${list.length} ${list.length === 1 ? 'item' : 'items'} found for “${q}”` : 'Type a product name in English or Telugu — for example “kandi pappu”, “agarbatti” or “పసుపు”.'
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
  input.addEventListener('input', () => {
    clearTimeout(t)
    t = setTimeout(render, 80)
  })
  root.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault()
    render()
  })

  input.value = params.get('q') || ''
  fetch(root.dataset.index)
    .then((r) => r.json())
    .then((data) => {
      index = data.map(prepare)
      root.querySelector('[data-search-tools]').hidden = false
      render()
    })
    .catch(() => {
      status.textContent = 'Search could not load. Please browse the categories instead.'
    })
})()
