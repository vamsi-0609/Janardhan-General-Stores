// Shop reply page (/reply/#<list>): the shop taps the link at the bottom of a customer's WhatsApp list and sees it
// as a simple bill: No. · item (brand, name, size) · quantity · ✓ Have / ✗ No · price. The total adds itself up.
// Tapping an item shows its photo, size, quantity and description in a box (no other page opens).
// "Send bill on WhatsApp" makes a PDF bill, keeps a copy on the phone and shares it (with the bill as text) to WhatsApp.
// The list travels inside the link (#…); nothing goes to a server. Marks and prices are kept on this phone, so the same
// link opens with them and they can be changed at any time (after sending: "Change bill", fix, send again).
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
  const phoneText = (p) => (p ? `${p.slice(0, 5)} ${p.slice(5)}` : '')
  const shop = { name: root.dataset.shopName || 'Janardhan General Stores', address: root.dataset.shopAddress || '', phone: root.dataset.shopPhone || '' }

  // ── saved marks and prices on this phone ──
  function loadStore() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return d } catch {} return {} }
  let store = loadStore()
  function saveStore() {
    const keys = Object.keys(store).sort((a, b) => (store[b].seen || 0) - (store[a].seen || 0))
    for (const k of keys.slice(MAX_KEEP)) delete store[k]
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {}
  }

  // ── the list inside the link: "#z…" = compressed, "#…" = plain ──
  /** Accept only what a real list can contain: product codes, whole numbers, short text, a 10-digit mobile number.
   *  Everything is shown as plain text, so a changed link can only show a wrong list, never run anything. */
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  function clean(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.i) || !d.i.length || d.i.length > 100) return null
    const str = (x, n) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '')
    const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 100000 ? Math.round(x) : 0)
    const id = (x) => (typeof x === 'string' && /^[a-z0-9-]{1,90}$/.test(x) ? x : '')
    const i = d.i.map((x) => {
      if (!Array.isArray(x) || !id(x[0]) || !num(x[1])) return null
      if (Array.isArray(x[2])) {
        const kit = x[2].slice(0, 60).filter((k) => Array.isArray(k) && id(k[0]) && num(k[1])).map((k) => [k[0], num(k[1])])
        return kit.length ? [x[0], num(x[1]), kit, str(x[3], 80)] : null
      }
      return [x[0], num(x[1]), str(x[2], 80)]
    }).filter(Boolean)
    if (!i.length) return null
    return { n: str(d.n, 40), p: typeof d.p === 'string' && /^[6-9]\d{9}$/.test(d.p) ? d.p : '', d: d.d === 'today' || d.d === 'tomorrow' ? d.d : '',
      s: typeof d.s === 'string' && own(SLOTS, d.s) ? d.s : '', a: d.a ? 1 : 0, t: Number.isFinite(d.t) && d.t > 0 && d.t < 1e9 ? Math.round(d.t) : 0, i }
  }
  async function decode(code) {
    try {
      const z = code.startsWith('z')
      const b64 = (z ? code.slice(1) : code).replace(/-/g, '+').replace(/_/g, '/')
      const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
      let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      if (z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
      return clean(JSON.parse(new TextDecoder().decode(bytes)))
    } catch { return null }
  }

  // ── product details from the website's own search index ──
  let M = null // size id → { n: name, t: Telugu, s: section, v: size, i: photo, b: brand, de: description }
  const pretty = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  const look = (id) => M[id] || { n: pretty(id), t: '', s: '', v: { id }, i: '', b: '', de: '' }
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
    if (root.dataset.view === 'bill') {
      const b = code ? await decodeBill(code) : null
      if (!b) return drawCustomerBill(true)
      data = b.d
      rec = { marks: b.marks, prices: b.prices, sent: b.at }
      return drawCustomerBill(false)
    }
    data = code ? await decode(code) : null
    if (!data) return drawHome(!!code)
    rec = store[code] || (store[code] = { marks: {}, prices: {}, sent: 0, first: Date.now() })
    rec.prices = rec.prices || {}
    rec.seen = Date.now()
    rec.name = data.n || ''
    rec.phone = data.p || ''
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
  const pickupText = () => { const slot = SLOTS[data.s]; return slot && data.d ? `${data.d === 'today' ? 'Today' : 'Tomorrow'} ${slot[0].toLowerCase()} (${slot[1]})` : '' }

  /** What the customer should know: ready / not available / when to come / call if not possible. */
  function noteLines() {
    const all = priced(lines(data))
    const miss = missing()
    const ready = all.length - miss.length
    const out = []
    if (ready) out.push(['ok', `Ready: ${ready} item${ready === 1 ? ' is' : 's are'} ready for you.`])
    if (miss.length) out.push(['no', `Not available: ${miss.map((x) => itemName(x.id)).join(', ')}.`])
    out.push(['', pickupText() ? `Please come to the shop ${pickupText().replace(/^Today/, 'today').replace(/^Tomorrow/, 'tomorrow')}.` : 'Please come to the shop to pick up your items.'])
    out.push(['', `If you cannot come at that time, please call or WhatsApp us: ${shop.phone}.`])
    out.push(['te', 'మీరు ఆ సమయానికి రాలేకపోతే, దయచేసి మాకు ఫోన్ చేసి చెప్పండి.'])
    return out
  }
  function replyText() {
    const ls = lines(data)
    const name = (data.n || '').trim()
    const out = [`Namaste${name ? ' ' + name : ''} 🙏`, 'Janardhan General Stores – your bill:', '']
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
    out.push('')
    for (const [k, t] of noteLines()) if (k !== 'ok' && k !== 'no') out.push(t)
    out.push('', 'Thank you! 🙏')
    return out.join('\n')
  }

  /** One bill line: name (tap for details) · qty / Have-No / price box (only when Have). */
  function billRow(x, num, kitChild) {
    const no = isNo(x.key)
    const lock = rec.sent ? ' disabled' : ''
    return `<li class="bl-row${no ? ' is-no' : ''}${kitChild ? ' bl-child' : ''}" data-key="${x.key}">
      <span class="bl-n">${num}</span>
      <button type="button" class="bl-item" data-info="${esc(x.id)}" data-amt="${x.amt}" data-k="${x.key}" data-note="${esc(x.note || '')}"><strong>${esc(itemName(x.id))}</strong>${look(x.id).t && !kitChild ? `<small lang="te">${esc(look(x.id).t)}</small>` : ''}${x.note ? `<small class="bl-note">Note: ${esc(x.note)}</small>` : ''}</button>
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
    root.innerHTML = `<p class="rp-back"><a href="#" data-home>← All lists on this phone</a></p>
      ${rec.sent ? `<div class="rp-sent" role="status"><strong>✓ Bill sent · ${esc(when(rec.sent))}</strong><span>To fix a mistake, tap “Change bill”, correct it and send again.</span><button type="button" class="btn btn-light" data-unlock>Change bill</button></div>` : ''}
      <article class="bill">
        <header class="bill-head">
          <p class="bill-shop">Janardhan General Stores</p>
          <div class="bill-meta"><span>Customer: <strong>${esc(data.n || '—')}</strong></span>${data.p ? `<span>Phone: <a href="tel:+91${esc(data.p)}"><strong>${esc(phoneText(data.p))}</strong></a></span>` : ''}${data.t ? `<span>${esc(when(data.t * 60000))}</span>` : ''}
            ${pickupText() ? `<span>Pickup: <strong>${esc(pickupText().replace(/ \(.*\)$/, ''))}</strong></span>` : ''}</div>
          ${data.a ? '<p class="rp-ask">Customer asked for the total price.</p>' : ''}
        </header>
        ${rec.sent ? '' : '<p class="bill-help">All items start as <strong>✓ Have</strong>. Tap <strong>✗ No</strong> if not in the shop (tap ✓ Have again to undo). Type the price of each item. Tap an item’s name to see its photo and details.</p>'}
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
        <div class="rp-two"${rec.sent ? ' hidden' : ''}>
          <button type="button" class="btn btn-wa" data-send>📄 Send bill</button>
          <button type="button" class="btn btn-wa-light" data-text>💬 Send text</button>
        </div>
        <p class="rp-send-help"${rec.sent ? ' hidden' : ''}><strong>Send bill</strong>: opens ${esc(data.n || 'the customer')}’s WhatsApp chat with the bill and a link to the PDF, and saves the PDF on this phone. <strong>Send text</strong>: the bill as a message only. Then just press send in WhatsApp.</p>
        <div class="rp-more">
          <button type="button" class="link-btn" data-pdf>⬇ Save PDF on this phone</button>
          <button type="button" class="link-btn" data-share>Share PDF file…</button>
        </div>
        <details class="sp-preview"><summary>See the message</summary><pre data-preview></pre></details>
        <p class="rp-remind" data-remind hidden>Remember: mark the “No” items as out of stock in the editor later, so customers see it on the website.</p>
      </div>
      <dialog class="rp-dlg" data-dlg aria-labelledby="dlg-h"></dialog>`
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
      root.querySelector(`[data-mark="${b.dataset.mark}"][data-val="${b.dataset.val}"]`)?.focus({ preventScroll: true })
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
    root.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => info(b)))
    root.querySelector('[data-unlock]')?.addEventListener('click', () => { rec.sent = 0; saveStore(); drawBill() })
    const toChat = (text) => {
      // straight into the customer's WhatsApp chat with the message typed in (no "which app?" question)
      const url = `https://wa.me/${data.p ? '91' + data.p : ''}?text=${encodeURIComponent(text)}`
      if (!open(url, '_blank', 'noopener')) location.href = url
    }
    const done = () => { rec.sent = Date.now(); saveStore(); drawBill() }
    root.querySelector('[data-pdf]').addEventListener('click', async () => { savePdf(await makePdf()) })
    root.querySelector('[data-text]')?.addEventListener('click', () => { toChat(replyText()); done() })
    root.querySelector('[data-send]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true
      if (!rec.sent) rec.sent = Date.now() // the bill date
      const [link, file] = await Promise.all([billLink(), makePdf()])
      toChat(`${replyText()}\n\n📄 Your bill (PDF): ${link}`)
      savePdf(file) // a copy stays on this phone (Downloads)
      done()
    })
    root.querySelector('[data-share]').addEventListener('click', async () => {
      const file = await makePdf()
      if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: file.name }).catch(() => {})
      else { savePdf(file); alert('This phone cannot share files from a website. The PDF is saved in Downloads.') }
    })
  }

  const b64u = (bytes) => { let bin = ''; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
  async function billLink() {
    const json = JSON.stringify({ d: data, no: Object.keys(rec.marks).filter((k) => rec.marks[k] === 'no'), pr: rec.prices, at: rec.sent || Date.now() })
    try {
      const z = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      return `${location.origin}/bill/#z${b64u(z)}`
    } catch { return `${location.origin}/bill/#${b64u(new TextEncoder().encode(json))}` }
  }
  /** The customer's view of a bill link: checked like a list link (plus marks and prices). */
  async function decodeBill(code) {
    try {
      const z = code.startsWith('z')
      const b64 = (z ? code.slice(1) : code).replace(/-/g, '+').replace(/_/g, '/')
      let bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
      if (z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
      const o = JSON.parse(new TextDecoder().decode(bytes))
      const d = clean(o && o.d)
      if (!d) return null
      const KEYRE = /^\d{1,3}(\.\d{1,3})?$/
      const marks = {}, prices = {}
      for (const k of Array.isArray(o.no) ? o.no.slice(0, 300) : []) if (typeof k === 'string' && KEYRE.test(k)) marks[k] = 'no'
      if (o.pr && typeof o.pr === 'object') for (const [k, v] of Object.entries(o.pr).slice(0, 300)) if (KEYRE.test(k) && typeof v === 'string' && /^\d{1,6}$/.test(v)) prices[k] = v
      return { d, marks, prices, at: Number.isFinite(o.at) && o.at > 0 ? o.at : Date.now() }
    } catch { return null }
  }
  function drawCustomerBill(bad) {
    if (bad) { root.innerHTML = '<p class="rp-bad">This bill link is not complete. Please ask the shop to send it again.</p>'; return }
    const ls = lines(data)
    const cell = (x) => (isNo(x.key) ? '<td class="bp-na">Not available</td>' : `<td class="bp-r">${Number(rec.prices[x.key]) > 0 ? esc(rupees(rec.prices[x.key])) : '—'}</td>`)
    const name = (id) => `${esc(itemName(id))}${look(id).t ? `<br><small lang="te">${esc(look(id).t)}</small>` : ''}`
    const rows = ls.map((l, k) => l.kit
      ? `<tr class="bp-kit"><td>${k + 1}</td><td colspan="3"><strong>${esc(shortName(look(l.id).n))}</strong>${l.amt > 1 ? ` × ${l.amt}` : ''}</td></tr>` +
        l.kit.map((x) => `<tr class="${isNo(x.key) ? 'bp-no' : ''}"><td></td><td class="bp-sub">${name(x.id)}</td><td>${esc(qtyOf(x.id, x.amt))}</td>${cell(x)}</tr>`).join('')
      : `<tr class="${isNo(l.key) ? 'bp-no' : ''}"><td>${k + 1}</td><td>${name(l.id)}${l.note ? `<br><small>Note: ${esc(l.note)}</small>` : ''}</td><td>${esc(qtyOf(l.id, l.amt))}</td>${cell(l)}</tr>`).join('')
    const miss = missing().length
    root.innerHTML = `<div class="bp bp-screen">
      <header class="bp-head"><img src="/brand/logo-mark.webp" alt="" width="72" height="72"><h1>${esc(shop.name)}</h1><p>${esc(shop.address)}</p><p>Phone / WhatsApp: ${esc(shop.phone)}</p></header>
      <h2 class="bp-title">Bill</h2>
      <table class="bp-info"><tr><td>Customer: <strong>${esc(data.n || '—')}</strong></td><td>Date: <strong>${esc(when(rec.sent))}</strong></td></tr>
        <tr><td>Phone: <strong>${esc(phoneText(data.p) || '—')}</strong></td><td>${pickupText() ? `Pickup: <strong>${esc(pickupText().replace(/ \(.*\)$/, ''))}</strong>` : ''}</td></tr></table>
      <table class="bp-items"><thead><tr><th>No.</th><th>Item</th><th>Qty</th><th class="bp-r">Price</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3">Total${miss ? ` <small>(${miss} item${miss === 1 ? '' : 's'} not available)</small>` : ''}</td><td class="bp-r">${esc(rupees(total()))}</td></tr></tfoot></table>
      <div class="bp-note">${noteLines().map(([k, t]) => `<p class="${k}"${k === 'te' ? ' lang="te"' : ''}>${esc(t)}</p>`).join('')}</div>
      <p class="bp-thanks">Thank you! · ధన్యవాదాలు!</p></div>
      <div class="rp-actions"><button type="button" class="btn btn-primary" data-pdf>⬇ Download PDF bill</button>
        <p class="hint">Questions about the bill? Call or WhatsApp the shop: ${esc(shop.phone)}.</p></div>`
    root.querySelector('[data-pdf]').addEventListener('click', async () => savePdf(await makePdf()))
  }

  // ── item details box (no other page opens) ──
  function info(b) {
    const id = b.dataset.info, amt = Number(b.dataset.amt), key = b.dataset.k
    const it = look(id)
    const dlg = root.querySelector('[data-dlg]')
    const price = isNo(key) ? 'Not available' : Number(rec.prices[key]) > 0 ? rupees(rec.prices[key]) : 'Not typed yet'
    dlg.innerHTML = `<div class="dlg-in">
      <button type="button" class="dlg-x" data-close aria-label="Close">✕</button>
      ${it.i ? `<img src="${esc(it.i)}" alt="" width="320" height="320">` : ''}
      <h3 id="dlg-h">${esc(shortName(it.n))}</h3>${it.t ? `<p class="dlg-te" lang="te">${esc(it.t)}</p>` : ''}
      <dl>
        ${it.b ? `<dt>Brand</dt><dd>${esc(it.b)}</dd>` : ''}
        <dt>Size</dt><dd>${esc(it.v.w ? 'Loose (by weight)' : it.v.l || (it.v.un ? `per ${it.v.un}` : '—'))}</dd>
        <dt>Quantity</dt><dd><strong>${esc(qtyOf(id, amt))}</strong></dd>
        ${it.v.p ? `<dt>Website price</dt><dd>${esc(it.v.p)}</dd>` : ''}
        <dt>Your price</dt><dd>${esc(price)}</dd>
      </dl>
      ${b.dataset.note ? `<p class="dlg-note">Customer’s note: ${esc(b.dataset.note)}</p>` : ''}
      ${it.de ? `<p class="dlg-de">${esc(it.de)}</p>` : ''}
      <button type="button" class="btn btn-primary" data-close>Close</button>
    </div>`
    dlg.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => dlg.close()))
    dlg.onclick = (e) => { if (e.target === dlg) dlg.close() }
    dlg.showModal()
  }

  // ── PDF bill: A5 pages drawn on a canvas (logo, Telugu names, more pages when the list is long) ──
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })
  async function makePdf() {
    await document.fonts?.ready
    const logo = await loadImg('/brand/logo-mark.webp').catch(() => null)
    const W = 1240, H = 1754, P = 70, S = 1.5 // A5 (148 × 210 mm) at about 210 dpi, drawn 1.5× as sharp
    const body = getComputedStyle(document.body).fontFamily || 'sans-serif'
    const head = getComputedStyle(document.querySelector('h1') || document.body).fontFamily || body
    const scratch = document.createElement('canvas').getContext('2d')
    const font = (c, w, px, fam = body, italic = '') => (c.font = `${italic}${w} ${px}px ${fam}`)
    const wrap = (c, text, max) => {
      const out = []; let line = ''
      for (const word of String(text).split(' ')) {
        const t = line ? `${line} ${word}` : word
        if (c.measureText(t).width > max && line) { out.push(line); line = word } else line = t
      }
      if (line) out.push(line)
      return out
    }
    const cName = P + 66, cQty = 800, cPrice = W - P, FOOT = 90
    const priceCell = (x) => (isNo(x.key) ? 'Not available' : Number(rec.prices[x.key]) > 0 ? rupees(rec.prices[x.key]) : '—')
    const date = when(rec.sent || Date.now())

    // every bill line becomes a block with a height; blocks are then laid out on pages
    const blocks = []
    const rowBlock = (num, id, amt, key, note, opts = {}) => {
      const x0 = opts.indent ? cName + 26 : cName
      font(scratch, opts.bold ? 700 : 600, 27)
      const name = opts.title || itemName(id)
      const nameLines = wrap(scratch, name, cQty - x0 - 24)
      const teText = opts.title ? look(id).t : look(id).t
      font(scratch, 400, 23)
      const teLines = teText ? wrap(scratch, teText, cQty - x0 - 24).slice(0, 2) : []
      const noteLines = note ? wrap(scratch, `Note: ${note}`, cQty - x0 - 24).slice(0, 2) : []
      const h = 22 + nameLines.length * 34 + teLines.length * 30 + noteLines.length * 28 + 14
      blocks.push({ h, rule: !opts.noRule, keepNext: !!opts.title, paint: (c, y) => {
        const grey = !opts.title && isNo(key)
        let yy = y + 22 + 26
        if (opts.title) { c.fillStyle = '#fff8ea'; rr(c, P, y + 6, W - 2 * P, h - 6, 12); c.fill() }
        font(c, 600, 26); c.fillStyle = '#555'; c.textAlign = 'left'; c.fillText(num, P + 14, yy)
        font(c, opts.bold ? 700 : 600, 27); c.fillStyle = grey ? '#888' : '#111'
        nameLines.forEach((t, k) => c.fillText(t, x0, yy + k * 34))
        if (!opts.title) {
          font(c, 400, 26); c.fillStyle = grey ? '#888' : '#111'; c.fillText(qtyOf(id, amt), cQty, yy)
          const pc = priceCell({ key })
          font(c, isNo(key) ? 400 : 700, isNo(key) ? 23 : 27, body, isNo(key) ? 'italic ' : ''); c.fillStyle = isNo(key) ? '#888' : '#111'; c.textAlign = 'right'; c.fillText(pc, cPrice - 14, yy); c.textAlign = 'left'
        } else if (amt > 1) { font(c, 400, 26); c.fillStyle = '#111'; c.fillText(`× ${amt}`, cQty, yy) }
        yy += (nameLines.length - 1) * 34
        font(c, 400, 23); c.fillStyle = '#666'
        teLines.forEach((t) => { yy += 30; c.fillText(t, x0, yy) })
        font(c, 400, 22, body, 'italic '); c.fillStyle = '#7a3b2e'
        noteLines.forEach((t) => { yy += 28; c.fillText(t, x0, yy) })
      } })
    }
    lines(data).forEach((l, k) => {
      if (l.kit) {
        rowBlock(String(k + 1), l.id, l.amt, null, l.note, { title: shortName(look(l.id).n), bold: true, noRule: true })
        l.kit.forEach((x) => rowBlock('', x.id, x.amt, x.key, '', { indent: true }))
      } else rowBlock(String(k + 1), l.id, l.amt, l.key, l.note)
    })
    const miss = missing().length
    // the note box under the total
    font(scratch, 400, 25)
    const notes = noteLines().map(([k, t]) => ({ k, rows: wrap(scratch, t, W - 2 * P - 48) }))
    const noteH = 40 + notes.reduce((a, n) => a + n.rows.length * 34 + 8, 0)
    const totalH = 144 + noteH + 80

    // headers
    // colours of the website's bill page
    const INK = '#1d211e', MUTED = '#5f655f', MAROON = '#70413b', GOLD = '#c8962e', FOREST = '#1f6b41', LINE = '#e3ddd0'
    const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h) }
    /** "Customer: Ravi" with the label in grey and the value in bold. */
    const kv = (c, label, value, x, y, align) => {
      font(c, 400, 25); const lw = c.measureText(label + ' ').width
      font(c, 700, 25); const vw = c.measureText(value).width
      const x0 = align === 'right' ? x - lw - vw : x
      c.textAlign = 'left'
      font(c, 400, 25); c.fillStyle = MUTED; c.fillText(label + ' ', x0, y)
      font(c, 700, 25); c.fillStyle = INK; c.fillText(value, x0 + lw, y)
    }
    const firstHead = (c, paint) => {
      let y = P
      if (logo) {
        if (paint) {
          // round logo with a thin gold ring
          c.save(); c.beginPath(); c.arc(W / 2, y + 68, 68, 0, Math.PI * 2); c.fillStyle = GOLD; c.fill()
          c.beginPath(); c.arc(W / 2, y + 68, 63, 0, Math.PI * 2); c.clip(); c.drawImage(logo, W / 2 - 63, y + 5, 126, 126); c.restore()
        }
        y += 150
      }
      font(c, 700, 44, head); y += 44; if (paint) { c.fillStyle = MAROON; c.textAlign = 'center'; c.fillText(shop.name, W / 2, y) }
      font(c, 400, 24); y += 38; if (paint) { c.fillStyle = MUTED; c.fillText(shop.address, W / 2, y) }
      y += 32; if (paint) c.fillText(`Phone / WhatsApp: ${shop.phone}`, W / 2, y)
      y += 30; if (paint) { c.fillStyle = INK; c.fillRect(P, y, W - 2 * P, 3) }
      y += 26
      if (paint) {
        // "BILL" in a small pill
        font(c, 800, 24); const t = 'B I L L', tw = c.measureText(t).width
        rr(c, W / 2 - tw / 2 - 26, y, tw + 52, 44, 22); c.fillStyle = '#f4efe4'; c.fill()
        c.fillStyle = MAROON; c.textAlign = 'center'; c.fillText(t, W / 2, y + 31)
      }
      y += 44 + 50
      if (paint) { kv(c, 'Customer:', data.n || '—', P, y); kv(c, 'Date:', date, W - P, y, 'right') }
      y += 40
      if (paint) { kv(c, 'Phone:', phoneText(data.p) || '—', P, y); if (pickupText()) kv(c, 'Pickup:', pickupText().replace(/ \(.*\)$/, ''), W - P, y, 'right') }
      return y + 26
    }
    const nextHead = (c, paint) => {
      let y = P
      font(c, 700, 30, head); y += 30
      if (paint) { c.fillStyle = MAROON; c.textAlign = 'left'; c.fillText(shop.name, P, y); font(c, 400, 23); c.textAlign = 'right'; c.fillStyle = MUTED; c.fillText(`Bill for ${data.n || 'customer'} · ${date}`, W - P, y); c.textAlign = 'left' }
      return y + 24
    }
    const tableHead = (c, y, paint) => {
      if (paint) {
        rr(c, P, y, W - 2 * P, 56, 12); c.fillStyle = '#f4efe4'; c.fill()
        font(c, 800, 21); c.fillStyle = '#5a4a32'; c.textAlign = 'left'
        c.fillText('NO.', P + 14, y + 36); c.fillText('ITEM', cName, y + 36); c.fillText('QTY', cQty, y + 36); c.textAlign = 'right'; c.fillText('PRICE', cPrice - 14, y + 36); c.textAlign = 'left'
      }
      return y + 60
    }

    // lay out pages
    const pages = []
    let page = { blocks: [] }, y = tableHead(scratch, firstHead(scratch, false), false)
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi]
      // a kit heading stays on the same page as its first item
      const need = b.h + (b.keepNext && blocks[bi + 1] ? blocks[bi + 1].h : 0)
      if (y + need > H - P - FOOT && page.blocks.length) { pages.push(page); page = { blocks: [] }; y = tableHead(scratch, nextHead(scratch, false), false) }
      page.blocks.push(b); y += b.h
    }
    if (y + totalH > H - P - FOOT) { pages.push(page); page = { blocks: [] } }
    page.total = true
    pages.push(page)

    // draw pages
    const jpegs = []
    for (let i = 0; i < pages.length; i++) {
      const cv = document.createElement('canvas')
      cv.width = W * S; cv.height = H * S
      const c = cv.getContext('2d')
      c.scale(S, S)
      c.fillStyle = '#fff'; c.fillRect(0, 0, W, H)
      // slim maroon band with a gold line at the top of every page
      c.fillStyle = MAROON; c.fillRect(0, 0, W, 16); c.fillStyle = GOLD; c.fillRect(0, 16, W, 4)
      let yy = tableHead(c, i === 0 ? firstHead(c, true) : nextHead(c, true), true)
      for (const b of pages[i].blocks) { b.paint(c, yy); yy += b.h; if (b.rule) { c.fillStyle = LINE; c.fillRect(P, yy - 1, W - 2 * P, 2) } }
      if (pages[i].total) {
        // total in a green rounded box
        rr(c, P, yy + 14, W - 2 * P, 84, 18); c.fillStyle = '#e7f6ec'; c.fill(); c.lineWidth = 3; c.strokeStyle = FOREST; c.stroke()
        font(c, 800, 34); c.fillStyle = FOREST; c.textAlign = 'left'; c.fillText('Total', P + 28, yy + 68); c.textAlign = 'right'; c.fillText(rupees(total()), cPrice - 28, yy + 68); c.textAlign = 'left'
        if (miss) { font(c, 400, 22); c.fillStyle = MUTED; c.fillText(`${miss} item${miss === 1 ? '' : 's'} not available`, P + 4, yy + 128) }
        // note box
        let ny = yy + 144
        rr(c, P, ny, W - 2 * P, noteH, 16); c.fillStyle = '#f7f2e6'; c.fill()
        c.save(); rr(c, P, ny, W - 2 * P, noteH, 16); c.clip(); c.fillStyle = GOLD; c.fillRect(P, ny, 8, noteH); c.restore()
        ny += 20
        for (const n of notes) {
          font(c, n.k === 'ok' || n.k === 'no' ? 700 : 400, 25)
          c.fillStyle = n.k === 'no' ? '#a3321f' : n.k === 'ok' ? '#1f6b41' : '#222'
          for (const r of n.rows) { ny += 34; c.fillText(r, P + 30, ny - 8) }
          ny += 8
        }
        font(c, 400, 24); c.fillStyle = '#333'; c.textAlign = 'center'; c.fillText('Thank you! · ధన్యవాదాలు!', W / 2, yy + 144 + noteH + 52); c.textAlign = 'left'
      }
      // footer
      c.fillStyle = LINE; c.fillRect(P, H - P - 24, W - 2 * P, 2)
      font(c, 400, 21); c.fillStyle = MUTED; c.textAlign = 'left'; c.fillText(location.host || 'shop.myconnect.sbs', P, H - P + 10)
      c.textAlign = 'center'; c.fillText(`Page ${i + 1} of ${pages.length}`, W / 2, H - P + 10)
      c.textAlign = 'right'; c.fillText(shop.phone, W - P, H - P + 10); c.textAlign = 'left'
      jpegs.push(new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()))
    }
    const pdf = jpegsToPdf(jpegs, W * S, H * S, 419.53, 595.28)
    const day = new Date(rec.sent || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).replace(/\s/g, '-')
    return new File([pdf], `Bill-${(data.n || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer'}-${day}.pdf`, { type: 'application/pdf' })
  }
  /** A PDF with one JPEG image per page (all pages the same size, in points). */
  function jpegsToPdf(jpegs, w, h, pw, ph) {
    const enc = new TextEncoder()
    const parts = [], offsets = []
    let len = 0
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length }
    const obj = (n, body, stream) => { offsets[n] = len; add(`${n} 0 obj\n${body}\n`); if (stream) { add('stream\n'); add(stream); add('\nendstream\n') } add('endobj\n') }
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    const n = jpegs.length
    const pageId = (i) => 3 + i * 3 // page, image, contents = 3 objects per page
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    obj(2, `<< /Type /Pages /Kids [${jpegs.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${n} >>`)
    const content = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`)
    jpegs.forEach((jpeg, i) => {
      const p = pageId(i)
      obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`)
      obj(p + 1, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
      obj(p + 2, `<< /Length ${content.length} >>`, content)
    })
    const total = 3 + n * 3
    const xref = len
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`
    for (let k = 1; k < total; k++) table += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`
    add(`${table}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
    return new Blob(parts, { type: 'application/pdf' })
  }
  function savePdf(file) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = file.name
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  function drawHome(bad) {
    const list = Object.entries(store).filter(([, r]) => r.count).sort(([, a], [, b]) => (b.seen || 0) - (a.seen || 0))
    root.innerHTML = `${bad ? '<p class="rp-bad">This link is not complete. Open it again from the customer’s WhatsApp message.</p>' : ''}
      ${shopPhone() ? '' : `<div class="rp-pin"><p><strong>Shop’s own phone?</strong> Add <strong>🧾 Shop reply</strong> to this phone’s ☰ menu. Customers’ phones never show it.</p><button type="button" class="btn btn-primary" data-pin="on">📌 Show Shop reply in this phone’s menu</button></div>`}
      <div class="rp-head">
        <h2>Open a customer’s list</h2>
        <ol class="rp-steps"><li>In the customer’s WhatsApp message, <strong>tap the link</strong> under “For the shop”. The bill opens here.</li><li>The address at the top must show <strong>shop.myconnect.sbs</strong>. If it shows anything else, or asks for a password, OTP, payment or a download: <strong>close it</strong>.</li></ol>
      </div>
      ${shopPhone() ? '<div class="rp-pin on"><p>✓ This phone shows <strong>🧾 Shop reply</strong> at the bottom of the ☰ menu.</p><button type="button" class="link-btn" data-pin="off">Remove it from this phone</button></div>' : ''}
      <h3 class="rp-recent-h">Lists opened on this phone</h3>
      ${list.length ? `<ul class="rp-recent">${list.map(([c, r]) => `<li><a href="#${esc(c)}"><strong>${esc(r.name || 'Customer')}</strong><span>${r.phone ? `${esc(phoneText(r.phone))} · ` : ''}${r.count} item${r.count === 1 ? '' : 's'}${r.at ? ` · ${esc(when(r.at))}` : ''}</span>
        <em class="${r.sent ? 'ok' : 'wait'}">${r.sent ? '✓ Bill sent' : 'Not replied yet'}</em></a></li>`).join('')}</ul>` : '<p class="rp-empty">No lists yet.</p>'}`
  }

  // "Shop reply" in the ☰ menu: only on phones where the shop switched it on here (site.js reads this).
  const PIN = 'jgs-shop-phone'
  function shopPhone() { try { return localStorage.getItem(PIN) === '1' } catch { return false } }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pin]')
    if (!b) return
    try { if (b.dataset.pin === 'on') localStorage.setItem(PIN, '1'); else localStorage.removeItem(PIN) } catch {}
    location.reload()
  })
  addEventListener('hashchange', show)
  root.innerHTML = '<p class="list-loading">Loading the list…</p>'
  fetch(document.documentElement.dataset.searchIndex)
    .then((r) => r.json())
    .then((index) => {
      M = {}
      for (const e of index) if (e.o) for (const v of e.o.v) M[v.id] = { n: e.o.n, t: e.o.t, s: e.o.s, v, i: v.i || e.o.i || e.i || '', b: e.o.b || '', de: e.de || '' }
      show()
    })
    .catch(() => { M = {}; show() })
})()
