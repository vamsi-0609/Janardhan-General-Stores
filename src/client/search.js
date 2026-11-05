// Client-side catalogue search over the static index (no server; voice uses the browser's own speech recognition).
//  • Every page: the header search boxes show live suggestions as you type (products, categories, festivals).
//  • Every search box has a mic button: say the item in Telugu or English (where the browser supports it).
//  • /search/: the full results page, also updated on every keystroke.
//  • Brands: searching a brand (e.g. "Cinthol") shows the photo of THAT brand when the shop marked one.
;(() => {
  const INDEX_URL = document.documentElement.dataset.searchIndex
  if (!INDEX_URL) return

  // ───────── matching ─────────
  // Normalise: lower-case, strip Latin accents, keep Telugu, collapse punctuation.
  const base = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').replace(/[^a-z0-9ఀ-౿]+/g, ' ').trim()
  // Loose form for transliteration variants: kandhi ≈ kandi, pappu ≈ papu, agarbathi ≈ agarbatti, w ≈ v, ee ≈ i, oo ≈ u.
  const loose = (s) => base(s).replace(/([a-z])\1+/g, '$1').replace(/([bcdgjkpt])h/g, '$1').replace(/w/g, 'v').replace(/ee/g, 'i').replace(/oo/g, 'u')
  // Sound skeleton (for voice and sound-alike spellings): cinthol ≈ sinthaal ≈ సింథాల్, candy ≈ kandi, rais ≈ rice.
  const skel = (w) => {
    const s = loose(w).replace(/ /g, '').replace(/sh/g, 's').replace(/c(?=[eiy])/g, 's').replace(/[cq]/g, 'k').replace(/g(?=[ei])/g, 'j').replace(/z/g, 'j').replace(/x/g, 'ks').replace(/f/g, 'p')
    if (!s) return ''
    return (/[aeiouy]/.test(s[0]) ? 'a' : s[0]) + s.slice(1).replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1')
  }

  // Telugu letters → English letters (so "సింథాల్ సోప్" can find Cinthol soap, "రైస్" finds rice).
  const TE_C = { 'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'n', 'చ': 'ch', 'ఛ': 'ch', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'n', 'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
    'త': 't', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n', 'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm', 'య': 'y', 'ర': 'r', 'ఱ': 'r', 'ల': 'l', 'ళ': 'l', 'వ': 'v',
    'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h' }
  const TE_V = { 'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo', 'ఋ': 'ru', 'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au' }
  const TE_M = { 'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru', 'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au' }
  const hasTe = (s) => /[ఀ-౿]/.test(s)
  function te2lat(s) {
    const ch = [...s]
    let out = ''
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], n = ch[i + 1]
      if (TE_C[c]) {
        out += TE_C[c]
        if (n === '్') i++
        else if (TE_M[n]) { out += TE_M[n]; i++ }
        else out += 'a'
      } else if (TE_V[c]) out += TE_V[c]
      else if (c === 'ం') out += n && /[పఫబభమ]/.test(n) ? 'm' : n && TE_C[n] ? 'n' : 'm'
      else if (c === 'ః') out += 'h'
      else if (!hasTe(c)) out += c
    }
    return out
  }

  // English words people say/write in Telugu letters.
  const TE_EN = Object.fromEntries(('రైస్ rice|ఆయిల్ oil|సోప్ soap|సోపు soap|షాంపూ shampoo|పేస్ట్ paste|టూత్ tooth|టూత్పేస్ట్ toothpaste|బ్రష్ brush|పౌడర్ powder|టీ tea|కాఫీ coffee|'
    + 'వాటర్ water|బాటిల్ bottle|షుగర్ sugar|సాల్ట్ salt|డిటర్జెంట్ detergent|సర్ఫ్ surf|క్యాండిల్ candle|క్యాండిల్స్ candles|కాండిల్స్ candles|ప్లేట్ plate|ప్లేట్స్ plates|'
    + 'కప్ cup|కప్స్ cups|కప్పులు cups|గ్లాస్ glass|పేపర్ paper|నూడుల్స్ noodles|మ్యాగీ maggi|ఘీ ghee|డాల్ dal|క్లీనర్ cleaner|స్ప్రే spray|కాయిల్ coil|'
    + 'మస్కిటో mosquito|ప్యాడ్స్ pads|శానిటరీ sanitary|డ్రింక్ drink|డ్రింక్స్ drinks|కూల్ cool|బాస్మతి basmati|ఆటా atta|ఫ్లోర్ flour|బిస్కెట్ biscuit').split('|').map((x) => x.split(' ')))
  const teToLatin = (q) => base(q).split(' ').map((w) => TE_EN[w] || (hasTe(w) ? te2lat(w) : w)).join(' ')

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

  // ───────── sizes in the search: "rin 1 kg", "tide 10 rs", "rice 25 kg", "అర కిలో కంది పప్పు", "oil 15 litre" ─────────
  // Quantities become tokens: w<grams>, v<ml>, p<rupees>. They pick the matching size; the other words find the product.
  const UNIT = { kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', 'కిలో': 'kg', 'కిలోలు': 'kg', 'కేజీ': 'kg', 'కేజీలు': 'kg',
    g: 'g', gm: 'g', gms: 'g', gr: 'g', grm: 'g', gram: 'g', grams: 'g', 'గ్రాములు': 'g', 'గ్రాము': 'g',
    l: 'l', lt: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l', 'లీటర్': 'l', 'లీటరు': 'l', 'లీటర్లు': 'l',
    ml: 'ml', rs: 'rs', rupee: 'rs', rupees: 'rs', 'రూపాయలు': 'rs', 'రూపాయి': 'rs', 'రూ': 'rs' }
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, fifty: 50, hundred: 100,
    'ఒక': 1, 'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5, 'పది': 10, 'ఇరవై': 20, 'యాభై': 50, 'వంద': 100,
    half: 0.5, ara: 0.5, 'అర': 0.5, quarter: 0.25, pav: 0.25, paav: 0.25, 'పావు': 0.25 }
  const qtyToken = (n, u) => (u === 'kg' ? `w${Math.round(n * 1000)}` : u === 'g' ? `w${Math.round(n)}` : u === 'l' ? `v${Math.round(n * 1000)}` : u === 'ml' ? `v${Math.round(n)}` : `p${n}`)
  function qtyParse(text) {
    const toks = String(text || '').toLowerCase().replace(/½/g, ' 0.5 ').replace(/¼/g, ' 0.25 ').replace(/₹/g, ' rs ')
      .replace(/(\d+)\s*\/\s*(\d+)/g, (m, a, b) => ` ${Number(a) / Number(b)} `)
      .replace(/(\d+(?:\.\d+)?)/g, ' $1 ').split(/[^a-z0-9.ఀ-౿]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean)
    const num = (t) => (/^\d+(\.\d+)?$/.test(t) ? Number(t) : t in NUMW ? NUMW[t] : null)
    const tokens = []
    const used = new Set()
    for (let i = 0; i < toks.length; i++) {
      const n = num(toks[i])
      if (n == null || used.has(i)) continue
      const next = UNIT[toks[i + 1]], prev = UNIT[toks[i - 1]]
      if (next) { tokens.push(qtyToken(n, next)); used.add(i).add(i + 1) }
      else if (prev === 'rs' && !used.has(i - 1)) { tokens.push(qtyToken(n, 'rs')); used.add(i).add(i - 1) }
    }
    return { tokens, rest: toks.filter((_, i) => !used.has(i)).join(' ') }
  }
  let qtyMatch = new Map() // item → { v: size id, g: grams wanted (loose items) }

  function prepare(item) {
    const name = loose(item.n)
    const te = base(item.t)
    const aliases = loose(item.a.join(' '))
    const brands = loose((item.b || []).join(' '))
    const cat = loose(`${item.c} ${item.s}`) + ' ' + base(item.ct)
    // Sizes: their words ("packet", "bag", "big") are searchable, and their quantities pick the size.
    const vs = (item.o && item.o.v) || []
    const vq = vs.map((v) => ({ id: v.id, w: !!v.w, m: v.m || 250, t: qtyParse(`${v.l} ${v.p || ''}`).tokens, words: loose(v.l).split(' ').filter((x) => x.length >= 2) }))
    const all = `${name} ${te} ${aliases} ${cat} ${loose(vs.map((v) => v.l).join(' '))}`.trim()
    // Exact (not loosened) word lists, for 1–2 letter typing.
    const bName = base(item.n).split(' ')
    const bOther = base(`${item.a.join(' ')} ${(item.b || []).join(' ')}`).split(' ')
    // Whole phrases without spaces: "kandipappu", "కందిపప్పు" (people and voice often join words).
    const joined = [item.n, item.t, ...item.a].map((x) => base(x).replace(/ /g, '')).filter((x) => x.length >= 4)
    const sk = new Set(`${item.n} ${item.a.join(' ')} ${te2lat(item.t)}`.split(/[^A-Za-z]+/).map(skel).filter((x) => x.length >= 3))
    return { ...item, _vq: vq, _name: name, _te: te, _aliases: aliases, _brands: brands, _all: all, _words: [...new Set(all.split(' '))].filter((w) => w.length >= 3), _bName: bName, _bOther: bOther, _joined: joined, _skel: sk }
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
    if (term.length >= 4 && item._joined.some((j) => j.startsWith(term))) return 50
    if (term.length >= 3 && (item._name.includes(term) || item._aliases.includes(term) || item._te.includes(term))) return 40
    if (item._all.split(' ').some((w) => w.startsWith(term))) return 18
    if (term.length >= 3 && item._all.includes(term)) return 12
    if (term.length >= 4 && /^[a-z]+$/.test(term)) {
      // Typos: "tumeric" → turmeric, "macroni" → macaroni (Latin letters only).
      const max = term.length >= 7 ? 2 : 1
      if (item._words.some((w) => lev(term, w.slice(0, term.length + 1), max) <= max || lev(term, w, max) <= max)) return 8
    }
    if (term.length >= 3 && /^[a-z]+$/.test(term)) {
      // Sounds the same: "sinthal" → Cinthol, "candy" → kandi.
      const k = skel(term)
      if (k.length >= 3 && (item._skel.has(k) || (k.length >= 4 && [...item._skel].some((s) => s.startsWith(k))))) return 7
    }
    return 0
  }

  // All typed words must match. While typing, the last word is treated as a prefix (already the case above).
  function rankRaw(index, q, section) {
    const qq = qtyParse(q)
    const raw = base(qq.rest).split(' ').filter(Boolean)
    if (!raw.length) return []
    // Short words are matched exactly; longer ones in the loose (spelling-tolerant) form.
    const terms = raw.map((w) => (w.length <= 2 || loose(w).length < 3 ? { t: w, short: true } : { t: loose(w), short: false })).filter((x) => x.t)
    const pool = section === 'all' ? index : index.filter((i) => i.sec === section || (i.secs && i.secs.includes(section)))
    const out = []
    for (const item of pool) {
      let total = 0
      let fuzzy = false // matched only by a spelling mistake or sound-alike
      let strong = true // every typed word matches the start of a word in the name (English or Telugu)
      for (const { t, short } of terms) {
        const s = short ? scoreShort(item, t) : scoreTerm(item, t)
        if (!s) { total = -1; break }
        if (s <= 8) fuzzy = true
        // For a festival, its other names (diwali, dasara, pongal …) count as its name.
        if (s < 66 && !(item.f && s >= 55 && t.length >= 4)) strong = false
        total += s
      }
      if (total < 0) continue
      // A size in the search ("1 kg", "₹10"): prefer products that have it, and pick that size.
      if (item._vq && item._vq.length) {
        const hit = qq.tokens.length && item._vq.find((v) => v.t.some((t) => qq.tokens.includes(t)))
        const looseV = item._vq.find((v) => v.w)
        const g = qq.tokens.filter((t) => t[0] === 'w').map((t) => Number(t.slice(1))).find((x) => x >= (looseV ? looseV.m : 250))
        // Size words: "coconut big", "maggi family pack", "rice bag" (not words of the product's own name)
        const nameWords = item._name.split(' ')
        const wordHits = item._vq.map((v) => terms.filter(({ t }) => t.length >= 2 && v.words.includes(t) && !nameWords.includes(t)).length)
        const best = Math.max(0, ...wordHits)
        const byWord = item._vq.length > 1 && best > 0 && wordHits.filter((x) => x === best).length === 1 && item._vq[wordHits.indexOf(best)]
        if (hit) { total += 45; qtyMatch.set(item, { v: hit.id }) }
        else if (looseV && g) { total += 15; qtyMatch.set(item, { v: looseV.id, g }) }
        else if (byWord) { total += 10; qtyMatch.set(item, { v: byWord.id }) }
      }
      // Festivals and categories are only promoted when their own name matches, not via a side word.
      if (item.k === 'c' && !strong) continue
      if (strong && item.f) total += 40
      else if (strong && item.k === 'c') total += 15
      out.push({ item, total, fuzzy })
    }
    // Sound-alike / misspelt matches are only a fallback: "santoor" must not also list sanitary pads.
    const sure = out.filter((r) => !r.fuzzy)
    return (sure.length ? sure : out).sort((a, b) => b.total - a.total || a.item.n.length - b.item.n.length || a.item.n.localeCompare(b.item.n))
  }
  // Telugu typed/spoken but written differently from our Telugu names? Try it in English letters too.
  function rank(index, q, section = 'all') {
    qtyMatch = new Map()
    const r = rankRaw(index, q, section)
    if (!hasTe(q)) return r
    const seen = new Set(r.map((x) => x.item))
    return [...r, ...rankRaw(index, teToLatin(q), section).filter((x) => !seen.has(x.item))]
  }
  const search = (index, q, section) => rank(index, q, section).map((r) => r.item)

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

  // ───────── brands ─────────
  // Does a typed/spoken word mean this brand word? (prefix, spelling-tolerant, or sounds the same)
  function wordIs(w, bw) {
    if (w.length >= 2 && bw.startsWith(w)) return true
    const lw = loose(w), lb = loose(bw)
    if (lw.length >= 3 && lb.startsWith(lw)) return true
    const kw = skel(w), kb = skel(bw)
    return w.length >= 4 && kw.length >= 3 && (kw === kb || (kw.length >= 4 && kb.startsWith(kw)))
  }
  const qWords = (q) => { const b = base(q); return (hasTe(b) ? `${b} ${teToLatin(b)}` : b).split(' ').filter(Boolean) }
  /** The brand that was typed (when the name itself did not match), e.g. "cinthol" → "Cinthol". */
  function brandHit(x, q) {
    if (!x.b?.length) return ''
    const nameWords = [...base(x.n).split(' '), ...base(x.t).split(' ')]
    const inName = (w) => nameWords.some((n) => n.startsWith(w)) || (hasTe(w) && nameWords.some((n) => n.startsWith(te2lat(w))))
    if (base(q).split(' ').filter(Boolean).every(inName)) return ''
    const words = qWords(q)
    return x.b.find((b) => words.some((w) => base(b).split(' ').some((bw) => wordIs(w, bw)))) || ''
  }
  /** Which photo to show: the searched brand's own photo; else a general photo; else a brand tile (never another brand's photo). */
  function pictureFor(x, q) {
    const brand = q ? brandHit(x, q) : ''
    if (!brand) return { src: x.i, n: 1, brand: '' }
    if (x.bp && x.bp[brand]) return { src: x.bp[brand][0], n: x.bp[brand][1], brand }
    if (x.g === undefined) return { src: x.i, n: 1, brand }
    if (x.g) return { src: x.g[0], n: x.g[1], brand }
    return { src: '', n: 1, brand }
  }
  const linkFor = (x, pic) => { const m = qtyMatch.get(x); const mv = m && x.o && x.o.v.find((v) => v.id === m.v); return mv && mv.u ? mv.u : m && x.o && x.o.v.length > 1 ? `${x.u}?v=${encodeURIComponent(m.v)}` : pic.n > 1 ? `${x.u}?photo=${pic.n}` : x.u }
  const matchLabel = (x) => { const m = qtyMatch.get(x); const v = m && x.o && x.o.v.find((y) => y.id === m.v); return v ? (v.w ? (m.g ? (m.g < 1000 ? `${m.g} g` : `${m.g / 1000} kg`) + ' loose' : 'Loose') : v.l) : '' }
  const MONO = ['#355b45', '#a34b32', '#70413b', '#4f6d4a', '#8d3f2b', '#2f5d62', '#6a4c93', '#b58a38']
  const monoColor = (s) => MONO[[...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % MONO.length]

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
        if ((x.k === 'c' || x.k === 't') && nc++ >= 2) continue
        picked.push(x)
        if (picked.length >= MAX) break
      }
      const nProducts = all.filter((x) => !x.f && x.k !== 'c' && x.k !== 't').length
      const row = (x, kind, i) => {
        const pic = kind ? { src: x.i, n: 1, brand: '' } : pictureFor(x, q)
        const ph = pic.src ? `<img src="${esc(pic.src)}" alt="" width="44" height="44" loading="lazy" decoding="async">`
          : `<span class="sg-mono" style="--mc:${monoColor(pic.brand)}">${esc(pic.brand.slice(0, 2).toUpperCase())}</span>`
        return `<a class="sg-row${kind ? ` sg-${kind}` : ''}" id="${id}-o${i}" role="option" aria-selected="false" href="${esc(kind ? x.u : linkFor(x, pic))}"${x.f && x.col ? ` style="--fa:${esc(x.col[0])}"` : ''}>
          ${ph}
          <span class="sg-t"><span class="sg-n">${highlight(x.n, q)}${x.z ? ` <span class="sg-z">· ${esc(x.z)}</span>` : ''}</span><span class="sg-te" lang="te">${highlight(x.t, q)}</span></span>
          <span class="sg-k">${!kind && matchLabel(x) ? `<b>${esc(matchLabel(x))}</b>` : ''}${kind === 'fest' ? 'Festival' : kind === 'cat' ? `${esc(x.cnt)} ${x.k === 't' ? 'brands' : 'items'}` : pic.brand ? `Brand: ${esc(pic.brand)}` : esc(x.c)}</span></a>`
      }
      let i = 0
      const parts = []
      for (const x of picked) parts.push(row(x, x.f ? 'fest' : x.k === 'c' || x.k === 't' ? 'cat' : '', i++))
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

  // ───────── voice search (Telugu or English) ─────────
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  // Words people add around the item name: "కంది పప్పు కావాలి", "do you have Cinthol soap".
  const FILLERS = new Set(('కావాలి కావాలండి ఉందా ఉన్నాయా ఉందండి ఇవ్వండి ఇవ్వు ఒక ఒకటి రెండు కిలో కేజీ కేజి ప్యాకెట్ ప్యాకెట్లు అండి అన్నా అక్కా మీ దగ్గర ఏమైనా '
    + 'కొంచెం చూపించు చూపించండి వెతుకు వెతకండి కోసం ఉంది లేదా ప్లీజ్ నాకు మాకు '
    + 'please i want need do you have give me show the a an some kg kilo kilos packet packets one two buy search for is there available any get find').split(' '))
  const stripFillers = (s) => base(s).split(' ').filter((w) => w && !FILLERS.has(w) && !/^\d+$/.test(w)).join(' ')
  /** From what the browser heard (several guesses), pick the words that find items best. */
  function bestQuery(index, alts) {
    let best = null
    alts.forEach((said, ai) => {
      const cleaned = stripFillers(said)
      if (!cleaned) return
      const cands = [cleaned]
      if (hasTe(cleaned)) cands.push(teToLatin(cleaned))
      for (const c of cands) {
        let q = c
        let r = rank(index, q, 'all')
        let factor = 1
        if (!r.length) {
          // Drop words that match nothing ("ఇంకా", "brand", …) and try again.
          const words = q.split(' ')
          const kept = words.filter((w) => rank(index, w, 'all').some((x) => !x.fuzzy))
          if (!kept.length || kept.length === words.length) continue
          q = kept.join(' ')
          r = rank(index, q, 'all')
          factor = 0.6 * (kept.length / words.length)
        }
        if (!r.length) continue
        // Prefer the person's own words (Telugu stays Telugu in the box) whenever they find something.
        const score = (r[0].total / q.split(' ').length) * factor - ai * 3 + (c === cleaned ? 30 : 0)
        if (!best || score > best.score) best = { q, said: said.trim(), score }
      }
    })
    return best
  }

  function voiceUI() {
    const mic = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/></svg>'
    const el = document.createElement('div')
    el.className = 'voice-overlay'
    el.hidden = true
    el.innerHTML = `<div class="voice-card" role="dialog" aria-modal="true" aria-labelledby="vc-title">
      <button type="button" class="vc-close" data-vc-close aria-label="Close voice search">×</button>
      <h2 id="vc-title" class="visually-hidden">Voice search</h2>
      <div class="vc-langs" role="group" aria-label="Language you will speak">
        <button type="button" data-lang="te-IN">తెలుగు</button><button type="button" data-lang="en-IN">English</button>
      </div>
      <button type="button" class="vc-mic" data-vc-mic aria-label="Tap and speak">${mic}</button>
      <p class="vc-state" data-vc-state></p>
      <p class="vc-heard" data-vc-heard aria-live="polite"></p>
      <p class="vc-eg" data-vc-eg></p>
    </div>`
    document.body.append(el)
    return el
  }

  let overlay, rec, vLang = localStorage.getItem('voice-lang') || 'te-IN', onVoiceResult = null, listening = false, gotResult = false
  const T = {
    'te-IN': { listen: 'చెప్పండి… ఉదా: “కంది పప్పు”', tap: 'మైక్ నొక్కి మళ్ళీ చెప్పండి', eg: 'Say the item name in Telugu, e.g. “కొబ్బరి నూనె”, “అగరబత్తి”, “సింథాల్ సబ్బు”' },
    'en-IN': { listen: 'Listening… say e.g. “toor dal”', tap: 'Tap the mic and try again', eg: 'Say the item name, e.g. “coconut oil”, “agarbatti”, “Cinthol soap”, “kandi pappu”' },
  }
  function vSet(state, heard) {
    overlay.querySelector('[data-vc-state]').textContent = state
    if (heard !== undefined) overlay.querySelector('[data-vc-heard]').textContent = heard
    overlay.querySelector('[data-vc-eg]').textContent = T[vLang].eg
    overlay.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === vLang)))
    overlay.classList.toggle('is-listening', listening)
  }
  function stopVoice() { if (rec) { rec.onend = rec.onresult = rec.onerror = null; try { rec.abort() } catch {} } rec = null; listening = false }
  function closeVoice() { stopVoice(); if (overlay) overlay.hidden = true; document.removeEventListener('keydown', escClose) }
  const escClose = (e) => { if (e.key === 'Escape') closeVoice() }
  function startVoice() {
    stopVoice()
    loadIndex().catch(() => {})
    rec = new Recognition()
    rec.lang = vLang
    rec.interimResults = true
    rec.maxAlternatives = 5
    rec.continuous = false
    gotResult = false
    rec.onresult = async (e) => {
      const res = e.results[e.results.length - 1]
      const heard = [...e.results].map((r) => r[0].transcript).join(' ')
      vSet(T[vLang].listen, heard)
      if (!res.isFinal) return
      gotResult = true
      const alts = [...res].map((a) => a.transcript)
      vSet('Finding items… / వెతుకుతున్నాం…', heard)
      let index
      try { index = await loadIndex() } catch { vSet('Search could not load. Please check the internet.'); return }
      const best = bestQuery(index, alts)
      if (!best) { listening = false; vSet(`No item found for “${heard}”. ${T[vLang].tap}`, heard); return }
      closeVoice()
      onVoiceResult(best)
    }
    rec.onerror = (e) => {
      listening = false
      const msg = {
        'not-allowed': 'Please allow the microphone for this website (tap the lock icon near the address), then try again.',
        'service-not-allowed': 'Voice search is turned off in this browser. Please type instead.',
        'no-speech': `Didn't hear anything. ${T[vLang].tap}`,
        'audio-capture': 'No microphone found on this device.',
        network: 'Voice search needs internet. Please check the connection and try again.',
        'language-not-supported': 'This browser cannot listen in this language. Try the other language button.',
      }[e.error]
      if (e.error !== 'aborted') vSet(msg || `Voice search stopped. ${T[vLang].tap}`)
    }
    rec.onend = () => { if (listening && !gotResult) { listening = false; vSet(T[vLang].tap) } listening = false; overlay.classList.remove('is-listening') }
    try { rec.start(); listening = true; vSet(T[vLang].listen, '') } catch { listening = false; vSet(T[vLang].tap) }
  }
  function openVoice(done) {
    overlay ||= voiceUI()
    if (!overlay.dataset.ready) {
      overlay.dataset.ready = '1'
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-vc-close]')) closeVoice() })
      overlay.querySelector('[data-vc-mic]').addEventListener('click', () => (listening ? stopVoice() || vSet(T[vLang].tap) : startVoice()))
      overlay.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
        vLang = b.dataset.lang
        localStorage.setItem('voice-lang', vLang)
        startVoice()
      }))
    }
    onVoiceResult = done
    overlay.hidden = false
    document.addEventListener('keydown', escClose)
    overlay.querySelector('[data-vc-mic]').focus()
    startVoice()
  }
  if (Recognition) {
    document.querySelectorAll('form.search-form [data-voice]').forEach((btn) => {
      btn.hidden = false
      btn.closest('form').classList.add('has-mic')
      btn.addEventListener('click', () => openVoice(({ q, said }) => {
        const root = btn.closest('[data-search-root]')
        if (root && root.voiceSearch) root.voiceSearch(q, said)
        else location.href = `/search/?q=${encodeURIComponent(q)}&said=${encodeURIComponent(said)}`
      }))
    })
    document.querySelectorAll('[data-voice-tip]').forEach((t) => (t.hidden = false))
  }

  // ───────── /search/ page ─────────
  const root = document.querySelector('[data-search-root]')
  if (!root) return
  const input = root.querySelector('input[name="q"]')
  const results = root.querySelector('[data-results]')
  const status = root.querySelector('[data-status]')
  const empty = root.querySelector('[data-empty]')
  const browse = root.querySelector('[data-browse]')
  const banner = root.querySelector('[data-brand-banner]')
  const segButtons = [...root.querySelectorAll('[data-section-filter]')]
  const params = new URLSearchParams(location.search)
  let section = params.get('section') || 'all'
  let index = []
  let said = params.get('said') || ''

  function card(p, q) {
    if (p.f) {
      const col = (p.col || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c))
      return `<li class="fest-result"><a class="fest-tile" href="${esc(p.u)}"${col.length === 2 ? ` style="--fa:${col[0]};--fb:${col[1]}"` : ''}>
        <span class="ft-copy"><span class="ft-kind">Festival</span><span class="ft-name">${esc(p.n)}</span><span class="ft-te" lang="te">${esc(p.t)}</span>
        <span class="ft-count">See the ${Number(p.cnt) || ''} items to buy →</span></span>
        ${p.i ? `<span class="ft-thumbs" aria-hidden="true"><img src="${esc(p.i)}" alt="" width="80" height="80" loading="lazy" decoding="async"></span>` : ''}
      </a></li>`
    }
    if (p.k === 'c' || p.k === 't') {
      // categories, and types with several brands ("Detergent Powder · 3 brands")
      return `<li class="cat-result"><a class="cat-chip-result" href="${esc(p.u)}">${p.i ? `<img src="${esc(p.i)}" alt="" width="44" height="44" loading="lazy" decoding="async">` : ''}
        <span><span class="crk">${p.k === 't' ? 'All brands' : 'Category'} · ${esc(p.s)}</span><strong>${highlight(p.n, q)}</strong> <span lang="te">${esc(p.t)}</span></span><span class="crn">${Number(p.cnt) || ''} ${p.k === 't' ? 'brands' : 'items'} →</span></a></li>`
    }
    const mv = qtyMatch.get(p) && p.o && p.o.v.find((v) => v.id === qtyMatch.get(p).v)
    const pic = mv && mv.i ? { src: mv.i, n: 1, brand: '' } : pictureFor(p, q)
    const tileName = pic.brand || (p.b && p.b[0]) || p.n.replace(/\s*\(.*\)\s*$/, '')
    const ph = pic.src
      ? `<img src="${esc(pic.src)}" alt="${esc(pic.brand ? `${pic.brand} ${p.n}` : p.n)}" width="320" height="320" loading="lazy" decoding="async" data-card-img>`
      : `<span class="brand-tile" style="--mc:${monoColor(tileName)}"><strong>${esc(tileName)}</strong><small>Photo coming soon</small></span>`
    // Size picker + Add / − n + (same as the catalogue cards; list.js does the rest)
    let buy = ''
    if (p.o && p.o.v && p.o.v.length) {
      const vs = p.o.v
      const m = qtyMatch.get(p)
      const vName = (v) => (v.w ? 'Loose (by weight)' : v.l || (v.un ? `Per ${v.un}` : 'Each'))
      const id = `sv-${++cardSeq}`
      const pick = vs.length > 1
        ? `<label class="visually-hidden" for="${id}">Size</label><select class="v-sel" id="${id}" data-vsel>${vs.map((v) => `<option value="${esc(v.id)}"${m && m.v === v.id ? ' selected' : ''}>${esc(vName(v))}${v.p ? ` · ${esc(v.p)}` : ''}</option>`).join('')}</select>`
        : ''
      buy = `<div class="buy" data-buy="${esc(JSON.stringify(p.o))}"${m && m.g ? ` data-want-g="${m.g}"` : ''}>${pick}<p class="b-price" data-price>${esc((mv || vs[0]).p || '')}</p>
        <button class="add-btn" type="button" data-add aria-label="Add ${esc(p.n)} to my list"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg><span>Add</span></button></div>`
    }
    return `<li class="pc"><a class="card" data-theme="${p.sec === 'puja-samagri' ? 'puja' : 'kirana'}" href="${esc(linkFor(p, pic))}">
      <div class="ph">${ph}${pic.brand ? `<span class="brand-pill">${esc(pic.brand)}</span>` : ''}</div>
      <div class="body"><span class="cat">${esc(p.c)}</span>${p.b && p.b[0] ? `<span class="brand-k${p.bl ? ' has-logo' : ''}">${p.bl ? `<img class="bk-logo" src="${esc(p.bl)}" alt="">` : ''}<span>${esc(p.b[0])}</span></span>` : ''}<span class="en">${highlight(p.n, q)}</span><span class="te" lang="te">${esc(p.t)}</span>${mv ? `<span class="size match">${esc(mv.w ? 'Loose' : mv.l)}</span>` : p.z ? `<span class="size">${highlight(p.z, q)}</span>` : ''}</div>
    </a>${buy}</li>`
  }
  let cardSeq = 0

  function render() {
    const q = input.value.trim()
    const list = search(index, q, section)
    const products = list.filter((x) => !x.f && x.k !== 'c' && x.k !== 't')
    const nItems = products.length
    results.innerHTML = list.map((x) => card(x, q)).join('')
    document.dispatchEvent(new Event('jgs:cards'))
    empty.hidden = !(q && list.length === 0)
    browse.hidden = !!q
    const tip = root.querySelector('[data-voice-tip]')
    if (tip && Recognition) tip.hidden = !!q
    // Searching only a brand ("Cinthol"): say plainly which items the shop keeps from it.
    const brands = [...new Set(products.map((x) => brandHit(x, q)).filter(Boolean))]
    if (q && brands.length === 1 && products.every((x) => brandHit(x, q) === brands[0])) {
      banner.innerHTML = `<strong>${esc(brands[0])}</strong> — available at the shop in: ${products.map((x) => esc(x.n.replace(/\s*\(.*\)\s*$/, ''))).join(', ')}.`
      banner.hidden = false
    } else banner.hidden = true
    const youSaid = said && said !== q ? `🎤 You said “${said}”. ` : said ? '🎤 ' : ''
    status.textContent = q ? `${youSaid}${nItems} ${nItems === 1 ? 'item' : 'items'} found for “${q}”` : ''
    status.hidden = !q
    const url = new URL(location.href)
    q ? url.searchParams.set('q', q) : url.searchParams.delete('q')
    url.searchParams.delete('said')
    section === 'all' ? url.searchParams.delete('section') : url.searchParams.set('section', section)
    history.replaceState(null, '', url)
    document.title = q ? `“${q}” — Search | Janardhan General Stores` : 'Search the catalogue | Janardhan General Stores'
  }
  root.voiceSearch = (q, heard) => { input.value = q; said = heard; render(); results.scrollIntoView({ block: 'nearest' }) }

  segButtons.forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sectionFilter === section))
    b.addEventListener('click', () => {
      section = b.dataset.sectionFilter
      segButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      render()
    })
  })

  let t
  input.addEventListener('input', () => { said = ''; clearTimeout(t); t = setTimeout(render, 50) })
  root.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); render() })

  input.value = params.get('q') || ''
  status.hidden = !input.value
  loadIndex()
    .then((data) => {
      index = data
      root.querySelector('[data-search-tools]').hidden = false
      render()
    })
    .catch(() => { status.hidden = false; status.textContent = 'Search could not load. Please browse the categories instead.' })
})()
