// Shop reply page (/reply/#<list>): the shop opens the link at the bottom of a customer's WhatsApp list and sees it
// as a simple bill: No. · item (brand, name, size) · quantity · ✓ Have / ✗ No · price. The total adds itself up.
// "Send reply" opens WhatsApp with the bill typed in. The list travels inside the link (#…); nothing goes to a server.
// The shop's marks and prices are kept on this phone (localStorage): the same link opens with them, and they can be
// changed at any time (after sending: "Change reply", fix, send again).
;(() => {
  const root = document.querySelector('[data-reply-page]')
  if (!root) return
  const KEY = 'jgs-replies-v1'
  const MAX_KEEP = 40
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const fmtW = (g) => (g < 1000 ? `${g} g` : `${+(g / 1000).toFixed(2)} kg`)
  const plural = (u, n) => (n === 1 ? u : u === 'leaf' ? 'leaves' : /(x|ch|sh|s)$/.test(u) ? `${u}es` : `${u}s`)
  const shortName = (n) => n.replace(/\s*\(.*\)\s*$/, '')
  const SLOTS = { morning: ['Morning', '6 AM – 12 PM'], afternoon: ['Afternoon', '12 – 4 PM'], evening: ['Evening', '4 – 10 PM'] }
  const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`

  // ── saved marks and prices on this phone ──
  function loadStore() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return d } catch {} return {} }
  let store = loadStore()
  function saveStore() {
    const keys = Object.keys(store).sort((a, b) => (store[b].seen || 0) - (store[a].seen || 0))
    for (const k of keys.slice(MAX_KEEP)) delete store[k]
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {}
  }

  // ── the list inside the link: "#z…" = compressed, "#…" = plain ──
  async function decode(code) {
    try {
      const z = code.startsWith('z')
      const b64 = (z ? code.slice(1) : code).replace(/-/g, '+').replace(/_/g, '/')
      const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
      let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      if (z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
      const d = JSON.parse(new TextDecoder().decode(bytes))
      return d && Array.isArray(d.i) ? d : null
    } catch { return null }
  }

  // ── product names and sizes from the website's own search index ──
  let M = null // size id → { n: name (with brand), t: Telugu, s: section, v: size }
  const pretty = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  const look = (id) => M[id] || { n: pretty(id), t: '', s: '', v: { id } }
  /** "Rin Detergent Powder · 1 kg", "Toor Dal (loose)" */
  const itemName = (id) => { const { n, v } = look(id); return shortName(n) + (v.l ? ` · ${v.l}` : v.w ? ' (loose)' : '') }
  /** "× 2", "1.5 kg", "3 pieces" */
  const qtyOf = (id, amt) => { const { v } = look(id); return v.w ? fmtW(amt) : v.l ? `× ${amt}` : `${amt} ${plural(v.un || 'item', amt)}` }

  /** Bill lines in the same order and numbering as the customer's message (Kirana, Puja Samagri, Puja kits). */
  function lines(d) {
    return d.i.map((x, i) => {
      const isKit = Array.isArray(x[2])
      const info = look(x[0])
      return { i, id: x[0], amt: x[1], note: (isKit ? x[3] : x[2]) || '', kit: isKit ? x[2].map(([id, amt], j) => ({ j, id, amt, key: `${i}.${j}` })) : null, key: String(i), g: isKit ? 2 : info.s === 'p' ? 1 : info.s === 'k' ? 0 : 3 }
    }).sort((a, b) => a.g - b.g || a.i - b.i)
  }
  /** Every line that gets Have / No and a price: normal items, and each item inside a kit. */
  const priced = (ls) => ls.flatMap((l) => (l.kit ? l.kit : [l]))

  let code = '', data = null, rec = null
  async function show() {
    code = location.hash.slice(1)
    data = code ? await decode(code) : null
    if (!data) return drawHome(!!code)
    rec = store[code] || (store[code] = { marks: {}, prices: {}, sent: 0, first: Date.now() })
    rec.prices = rec.prices || {}
    rec.seen = Date.now()
    rec.name = data.n || ''
    rec.at = (data.t || 0) * 60000
    rec.count = data.i.length
    saveStore()
    drawBill()
  }

  const isNo = (key) => rec.marks[key] === 'no'
  const priceOf = (key) => (isNo(key) ? 0 : Number(rec.prices[key]) || 0)
  const total = () => priced(lines(data)).reduce((a, x) => a + priceOf(x.key), 0)
  const missing = () => priced(lines(data)).filter((x) => isNo(x.key))
  const unpriced = () => priced(lines(data)).filter((x) => !isNo(x.key) && !(Number(rec.prices[x.key]) > 0))

  function replyText() {
    const ls = lines(data)
    const name = (data.n || '').trim()
    const out = [`Namaste${name ? ' ' + name : ''} 🙏`, 'Janardhan General Stores – your list:', '']
    const row = (x, prefix) => `${prefix}${itemName(x.id)} ${qtyOf(x.id, x.amt)} – ${isNo(x.key) ? '✗ Not available' : Number(rec.prices[x.key]) > 0 ? rupees(rec.prices[x.key]) : '✓'}`
    ls.forEach((l, k) => {
      if (l.kit) { out.push(`${k + 1}. ${shortName(look(l.id).n)}${l.amt > 1 ? ` × ${l.amt}` : ''}:`); l.kit.forEach((x) => out.push(row(x, '    - '))) }
      else out.push(row(l, `${k + 1}. `))
    })
    const miss = missing(), t = total()
    out.push('')
    if (t > 0) out.push(`Total: ${rupees(t)}${miss.length ? ' (available items)' : ''}`)
    if (!miss.length) out.push('✓ All items are available. అన్నీ ఉన్నాయి.')
    else if (miss.length === priced(ls).length) out.push('Sorry, these items are not available right now.')
    else out.push(`✗ ${miss.length} item${miss.length === 1 ? '' : 's'} not available now. మిగతావి సిద్ధంగా ఉన్నాయి.`)
    const slot = SLOTS[data.s]
    if (slot && data.d) out.push(`Pickup: ${data.d === 'today' ? 'Today' : 'Tomorrow'} ${slot[0].toLowerCase()} (${slot[1]})`)
    out.push('', 'Thank you! 🙏')
    return out.join('\n')
  }

  /** One bill line: name · qty / Have-No / price box (only when Have). */
  function billRow(x, num, kitChild) {
    const no = isNo(x.key)
    const lock = rec.sent ? ' disabled' : ''
    return `<li class="bl-row${no ? ' is-no' : ''}${kitChild ? ' bl-child' : ''}" data-key="${x.key}">
      <span class="bl-n">${num}</span>
      <div class="bl-item"><strong>${esc(itemName(x.id))}</strong>${look(x.id).t && !kitChild ? `<small lang="te">${esc(look(x.id).t)}</small>` : ''}${x.note ? `<small class="bl-note">Note: ${esc(x.note)}</small>` : ''}</div>
      <span class="bl-qty">${esc(qtyOf(x.id, x.amt))}</span>
      <div class="bl-ctl">
        <div class="bl-tg" role="group" aria-label="${esc(itemName(x.id))}">
          <button type="button" data-mark="${x.key}" data-val="have" aria-pressed="${!no}"${lock}>✓ Have</button>
          <button type="button" data-mark="${x.key}" data-val="no" aria-pressed="${no}"${lock}>✗ No</button>
        </div>
        ${no ? '<span class="bl-na">Not available</span>' : `<label class="bl-price"><span>₹</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" enterkeyhint="next" data-price="${x.key}" value="${esc(rec.prices[x.key] || '')}" placeholder="Price" aria-label="Price of ${esc(itemName(x.id))}"${lock}></label>`}
      </div>
    </li>`
  }

  function drawBill() {
    const ls = lines(data)
    const slot = SLOTS[data.s]
    root.innerHTML = `<p class="rp-back"><a href="#" data-home>← All lists on this phone</a></p>
      ${rec.sent ? `<div class="rp-sent" role="status"><strong>✓ Reply sent · ${esc(when(rec.sent))}</strong><span>To fix a mistake, tap “Change reply”, correct it and send again.</span><button type="button" class="btn btn-light" data-unlock>Change reply</button></div>` : ''}
      <article class="bill">
        <header class="bill-head">
          <p class="bill-shop">Janardhan General Stores</p>
          <div class="bill-meta"><span>Customer: <strong>${esc(data.n || '—')}</strong></span>${data.t ? `<span>${esc(when(data.t * 60000))}</span>` : ''}
            ${slot && data.d ? `<span>Pickup: <strong>${data.d === 'today' ? 'Today' : 'Tomorrow'} ${esc(slot[0].toLowerCase())}</strong></span>` : ''}</div>
          ${data.a ? '<p class="rp-ask">Customer asked for the total price.</p>' : ''}
        </header>
        ${rec.sent ? '' : '<p class="bill-help">All items start as <strong>✓ Have</strong>. Tap <strong>✗ No</strong> if not in the shop (tap ✓ Have again to undo). Type the price of each item.</p>'}
        <div class="bill-cols" aria-hidden="true"><span>No.</span><span>Item</span><span>Qty</span></div>
        <ol class="bill-list">${ls.map((l, k) => l.kit
          ? `<li class="bl-kit"><div class="bl-kit-h"><span class="bl-n">${k + 1}</span><strong>${esc(shortName(look(l.id).n))}</strong><span class="bl-qty">${l.amt > 1 ? `${l.amt} kits` : 'Puja kit'}</span></div>
              <ol class="bill-list">${l.kit.map((x) => billRow(x, '•', true)).join('')}</ol></li>`
          : billRow(l, k + 1, false)).join('')}</ol>
        <footer class="bill-foot">
          <div class="bill-total"><span>Total</span><strong data-total>${rupees(total())}</strong></div>
          <p class="bill-sum" data-sum></p>
        </footer>
      </article>
      <div class="rp-actions">
        <button type="button" class="btn btn-wa rp-send" data-send${rec.sent ? ' hidden' : ''}>Send reply on WhatsApp</button>
        <details class="sp-preview"><summary>See the reply</summary><pre data-preview></pre></details>
        <p class="rp-remind" data-remind hidden>Remember: mark the “No” items as out of stock in the editor later, so customers see it on the website.</p>
      </div>`
    const refreshFoot = () => {
      root.querySelector('[data-total]').textContent = rupees(total())
      const miss = missing().length, up = unpriced().length
      root.querySelector('[data-sum]').textContent = [miss ? `${miss} not available` : 'All items available', up ? `${up} price${up === 1 ? '' : 's'} not typed` : ''].filter(Boolean).join(' · ')
      root.querySelector('[data-preview]').textContent = replyText()
      root.querySelector('[data-remind]').hidden = !miss
    }
    refreshFoot()
    root.querySelector('[data-home]').addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', location.pathname); show() })
    root.querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.val === 'no') rec.marks[b.dataset.mark] = 'no'
      else delete rec.marks[b.dataset.mark]
      saveStore()
      const y = scrollY
      drawBill()
      scrollTo(0, y)
      const again = root.querySelector(`[data-mark="${b.dataset.mark}"][data-val="${b.dataset.val}"]`)
      again?.focus({ preventScroll: true })
      // just marked Have: go straight to its price box
      if (b.dataset.val === 'have' && !rec.prices[b.dataset.mark]) root.querySelector(`[data-price="${b.dataset.mark}"]`)?.focus({ preventScroll: true })
    }))
    const boxes = [...root.querySelectorAll('[data-price]')]
    boxes.forEach((inp, k) => {
      inp.addEventListener('input', () => {
        const clean = inp.value.replace(/\D/g, '').slice(0, 6) // numbers only
        if (clean !== inp.value) inp.value = clean
        if (clean) rec.prices[inp.dataset.price] = clean
        else delete rec.prices[inp.dataset.price]
        saveStore(); refreshFoot()
      })
      // "Next" on the keypad jumps to the next price
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (boxes[k + 1] || inp).focus(); if (!boxes[k + 1]) inp.blur() } })
    })
    root.querySelector('[data-unlock]')?.addEventListener('click', () => { rec.sent = 0; saveStore(); drawBill() })
    root.querySelector('[data-send]')?.addEventListener('click', () => {
      // WhatsApp asks which chat: the customer's chat is at the top (they just sent the list).
      open(`https://wa.me/?text=${encodeURIComponent(replyText())}`, '_blank', 'noopener')
      rec.sent = Date.now(); saveStore(); drawBill()
    })
  }

  function drawHome(bad) {
    const list = Object.entries(store).filter(([, r]) => r.count).sort(([, a], [, b]) => (b.seen || 0) - (a.seen || 0))
    root.innerHTML = `${bad ? '<p class="rp-bad">This reply link is not complete. Open it again from the customer’s WhatsApp message.</p>' : ''}
      <div class="rp-head"><h2>Lists opened on this phone</h2><p>Open a customer’s list from the link at the bottom of their WhatsApp message. It is kept here, so you can come back to it.</p></div>
      ${list.length ? `<ul class="rp-recent">${list.map(([c, r]) => `<li><a href="#${esc(c)}"><strong>${esc(r.name || 'Customer')}</strong><span>${r.count} item${r.count === 1 ? '' : 's'}${r.at ? ` · ${esc(when(r.at))}` : ''}</span>
        <em class="${r.sent ? 'ok' : 'wait'}">${r.sent ? '✓ Replied' : 'Not replied yet'}</em></a></li>`).join('')}</ul>` : '<p class="rp-empty">No lists yet.</p>'}`
  }

  addEventListener('hashchange', show)
  root.innerHTML = '<p class="list-loading">Loading the list…</p>'
  fetch(document.documentElement.dataset.searchIndex)
    .then((r) => r.json())
    .then((index) => {
      M = {}
      for (const e of index) if (e.o) for (const v of e.o.v) M[v.id] = { n: e.o.n, t: e.o.t, s: e.o.s, v }
      show()
    })
    .catch(() => { M = {}; show() })
})()
