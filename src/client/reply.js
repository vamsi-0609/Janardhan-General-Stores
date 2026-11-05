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
    if (pickupText()) out.push(`Pickup: ${pickupText()}`)
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
        <button type="button" class="btn btn-wa rp-send" data-send${rec.sent ? ' hidden' : ''}>📄 Send bill on WhatsApp</button>
        <p class="rp-send-help"${rec.sent ? ' hidden' : ''}>Makes the PDF bill, saves a copy on this phone, then choose <strong>WhatsApp</strong> → <strong>${esc(data.n || 'the customer')}</strong>.</p>
        <div class="rp-more">
          <button type="button" class="btn btn-light" data-pdf>⬇ Save PDF bill</button>
          <button type="button" class="btn btn-light" data-text>💬 Send as text only</button>
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
    root.querySelector('[data-pdf]').addEventListener('click', async () => { savePdf(await makePdf()) })
    root.querySelector('[data-text]').addEventListener('click', () => {
      open(`https://wa.me/${data.p ? '91' + data.p : ''}?text=${encodeURIComponent(replyText())}`, '_blank', 'noopener')
      rec.sent = Date.now(); saveStore(); drawBill()
    })
    root.querySelector('[data-send]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget
      btn.disabled = true
      const file = await makePdf()
      savePdf(file) // a copy stays on this phone (Downloads)
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: file.name, text: replyText() })
        } else {
          // phone cannot share files from a website: send the text; the PDF is in Downloads to attach if wanted
          open(`https://wa.me/${data.p ? '91' + data.p : ''}?text=${encodeURIComponent(replyText())}`, '_blank', 'noopener')
          alert('The PDF bill is saved in Downloads. WhatsApp opens with the bill as text; you can also attach the PDF there.')
        }
        rec.sent = Date.now(); saveStore(); drawBill()
      } catch (err) {
        btn.disabled = false // share was cancelled: nothing is marked as sent
      }
    })
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

  // ── PDF bill: drawn on a canvas, saved as a one-page PDF (no library, nothing leaves the phone) ──
  async function makePdf() {
    await document.fonts?.ready
    const W = 1240, P = 64, S = 2 // 1240 px wide ≈ A5 at 210 dpi
    const body = getComputedStyle(document.body).fontFamily || 'sans-serif'
    const head = getComputedStyle(document.querySelector('h1') || document.body).fontFamily || body
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')
    const font = (w, px, fam = body, italic = '') => (ctx.font = `${italic}${w} ${px}px ${fam}`)
    const wrap = (text, max) => {
      const out = []; let line = ''
      for (const word of String(text).split(' ')) {
        const t = line ? `${line} ${word}` : word
        if (ctx.measureText(t).width > max && line) { out.push(line); line = word } else line = t
      }
      if (line) out.push(line)
      return out
    }
    const ls = lines(data)
    const miss = missing().length
    const cName = 130, cQty = 820, cPrice = W - P
    function draw(paint) {
      let y = P
      const text = (s, x, yy, align = 'left', color = '#111') => { if (paint) { ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, yy) } }
      const rule = (yy, w = 2, color = '#222') => { if (paint) { ctx.fillStyle = color; ctx.fillRect(P, yy, W - 2 * P, w) } }
      font(700, 46, head); y += 46; text(shop.name, W / 2, y, 'center')
      font(400, 26); y += 40; text(shop.address, W / 2, y, 'center', '#333')
      y += 36; text(`Phone / WhatsApp: ${shop.phone}`, W / 2, y, 'center', '#333')
      y += 26; rule(y, 4)
      font(800, 32); y += 58; text('B I L L', W / 2, y, 'center')
      font(400, 27); y += 54
      text(`Customer: ${data.n || '—'}`, P, y); text(`Date: ${when(rec.sent || Date.now())}`, W - P, y, 'right')
      y += 40; text(`Phone: ${phoneText(data.p) || '—'}`, P, y); if (pickupText()) text(`Pickup: ${pickupText().replace(/ \(.*\)$/, '')}`, W - P, y, 'right')
      y += 30; rule(y, 4)
      font(800, 23); y += 40; text('NO.', P, y); text('ITEM', cName, y); text('QTY', cQty, y); text('PRICE', cPrice, y, 'right')
      y += 18; rule(y, 3)
      const row = (num, name, qty, price, opts = {}) => {
        font(opts.bold ? 700 : 400, 27)
        const nameLines = wrap(name, cQty - (opts.indent ? cName + 24 : cName) - 20)
        y += 42
        text(num, P, y, 'left', '#444')
        nameLines.forEach((t, k) => text(t, (opts.indent ? cName + 24 : cName), y + k * 36, 'left', opts.grey ? '#777' : '#111'))
        font(400, 27); if (qty) text(qty, cQty, y, 'left', opts.grey ? '#777' : '#111')
        if (price) { font(opts.na ? 400 : 700, opts.na ? 24 : 27, body, opts.na ? 'italic ' : ''); text(price, cPrice, y, 'right', opts.na ? '#777' : '#111') }
        y += (nameLines.length - 1) * 36 + 16
        if (!opts.noRule) rule(y, 1, '#bbb')
      }
      const priceCell = (x) => (isNo(x.key) ? 'Not available' : Number(rec.prices[x.key]) > 0 ? rupees(rec.prices[x.key]) : '—')
      ls.forEach((l, k) => {
        if (l.kit) {
          row(String(k + 1), shortName(look(l.id).n) + (l.amt > 1 ? ` × ${l.amt}` : ''), '', '', { bold: true, noRule: true })
          l.kit.forEach((x) => row('', itemName(x.id), qtyOf(x.id, x.amt), priceCell(x), { indent: true, grey: isNo(x.key), na: isNo(x.key) }))
        } else row(String(k + 1), itemName(l.id) + (l.note ? ` (Note: ${l.note})` : ''), qtyOf(l.id, l.amt), priceCell(l), { grey: isNo(l.key), na: isNo(l.key) })
      })
      y += 6; rule(y, 4)
      font(800, 36); y += 58; text('Total', P, y); text(rupees(total()), cPrice, y, 'right')
      if (miss) { font(400, 24); y += 38; text(`${miss} item${miss === 1 ? '' : 's'} not available`, P, y, 'left', '#555') }
      font(400, 25); y += 70; text('Thank you! Please pick up your items at the shop. · ధన్యవాదాలు!', W / 2, y, 'center', '#333')
      return y + P
    }
    const H = Math.ceil(draw(false))
    cv.width = W * S; cv.height = H * S
    ctx.scale(S, S)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    draw(true)
    const jpeg = new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer())
    const pdf = jpegToPdf(jpeg, cv.width, cv.height, 420, 420 * (H / W))
    const day = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).replace(/\s/g, '-')
    return new File([pdf], `Bill-${(data.n || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer'}-${day}.pdf`, { type: 'application/pdf' })
  }
  /** A one-page PDF that shows one JPEG image (page size in points). */
  function jpegToPdf(jpeg, w, h, pw, ph) {
    const enc = new TextEncoder()
    const parts = [], offsets = []
    let len = 0
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length }
    const obj = (n, body, stream) => { offsets[n] = len; add(`${n} 0 obj\n${body}\n`); if (stream) { add('stream\n'); add(stream); add('\nendstream\n') } add('endobj\n') }
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
    obj(5, `<< /Length ${content.length} >>`, enc.encode(content))
    const xref = len
    add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
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
