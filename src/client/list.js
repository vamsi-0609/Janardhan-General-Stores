// "My list": customers pick products and sizes (like a mart app), then send the list to the shop on WhatsApp.
// Everything stays in this browser (localStorage). No server, no payment. Pickup at the shop only.
//
//  • [data-buy] blocks (product cards, the product page, the "All sizes" row, search results) carry the product as JSON:
//      { k: key, n: name, t: Telugu name, u: url, i: photo, b: brand,
//        s: "k" kirana / "p" puja, v: [{ id, l: label, p: price, d: description, i: photo, g: gallery index, w: loose by weight, un: count word, q: quick picks, kit: contents }] }
//    Inside: optional size picker (select[data-vsel] or [data-v] chips), [data-price], [data-vdesc], and the [data-add] button,
//    which turns into a − n + stepper once that size is in the list. data-fixed="<size id>" = one size only.
//  • [data-list-count] shows the number of lines; a floating "My list" bar appears on phones once the list has items.
//  • [data-list-page] (/list/) shows the list (grouped: Kirana, Puja Samagri, Puja kits), the customer's name + pickup time, and the WhatsApp button.
//  • [data-kit-panel] (puja kit pages): "What's inside" — tick / untick, size and amount of each item.
;(() => {
  const KEY = 'jgs-list-v2'
  const MAX = 80
  const MIN_G = 250 // loose items start here unless the product says otherwise (v.m, e.g. 25 g for cardamom)

  // ───────── storage ─────────
  const blank = () => ({ items: [], name: '', phone: '', day: '', slot: '', askPrice: true })
  /** Indian mobile number: 10 digits starting 6–9 (a leading +91 / 91 / 0 is removed). '' if not valid. */
  const mobile = (s) => { const d = String(s || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''); return /^[6-9]\d{9}$/.test(d) ? d : '' }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY))
      if (d && Array.isArray(d.items)) return { ...blank(), ...d, items: d.items.filter((e) => e && e.c && e.c.k && Array.isArray(e.c.v)) }
    } catch {}
    return blank()
  }
  let state = load()
  const kitPanels = new Map() // "What's inside" lists on kit pages, by "<line key>|<kit size id>"
  const page = document.querySelector('[data-list-page]')
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
    refresh()
  }
  addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); refresh(); if (page) drawPage() } })

  // ───────── sizes & amounts ─────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const fmtW = (g) => (g < 1000 ? `${g} g` : `${+(g / 1000).toFixed(2)} kg`)
  const plural = (u, n) => (n === 1 ? u : u === 'leaf' ? 'leaves' : /(x|ch|sh|s)$/.test(u) ? `${u}es` : `${u}s`)
  // Loose items: start at v.m grams and go up in fixed steps of v.s grams (e.g. 25, 50, 75 … or 250, 500, 750 …).
  const minOf = (v) => (v.m > 0 ? v.m : MIN_G)
  const stepOf = (v) => (v.s > 0 ? v.s : minOf(v) < 250 ? 25 : 250)
  const quickOf = (v) => [...new Set([minOf(v), ...(stepOf(v) < 250 ? [50, 100, 250, 500] : [500, 1000, 2000, 5000])])]
    .filter((g) => g >= minOf(v) && (g - minOf(v)) % stepOf(v) === 0).slice(0, 5)
  const vOf = (c, id) => c.v.find((v) => v.id === id) || c.v[0]
  const vName = (v) => (v.w ? 'Loose (by weight)' : v.l || (v.un ? `Per ${v.un}` : 'Each'))
  const shortName = (n) => n.replace(/\s*\(.*\)\s*$/, '')
  function defaultAmt(v) {
    const q = (v.q || []).filter((x) => x > 0)
    if (v.w) { const qq = quickOf(v); if (minOf(v) < 25) return minOf(v); return stepOf(v) < 250 ? qq[1] || minOf(v) : Math.max(minOf(v), qq.includes(1000) ? 1000 : qq[0]) }
    return q.length ? q[0] : 1
  }
  const amtText = (v, amt) => (v.w ? fmtW(amt) : v.l ? `${amt}` : `${amt} ${plural(v.un || 'item', amt)}`)
  /** "1 kg × 2", "Loose · 1.5 kg", "3 bars" */
  function qtyText(e) {
    const v = vOf(e.c, e.v)
    if (v.w) return (e.c.v.length > 1 ? 'Loose · ' : '') + fmtW(e.amt)
    if (v.l) return `${v.l} × ${e.amt}`
    return `${e.amt} ${plural(v.un || 'item', e.amt)}`
  }
  // ───────── puja kits: one list line that holds several products ─────────
  // A kit size has v.kit = [{ c: product line, v: size id, a: amount }]. In the list a kit is one entry with
  // kit: [{ i: index in v.kit, c, v, amt }] (only the items the customer kept) and amt = how many kits.
  const isKit = (v) => !!(v && v.kit && v.kit.length)
  const kitDefault = (v) => v.kit.map((k, i) => ({ i, c: k.c, v: k.v, amt: k.a })).filter((x) => !vOf(x.c, x.v).off)
  const kitItemText = (x) => qtyText({ c: x.c, v: x.v, amt: x.amt })
  const idOf = (c, vid) => `${c.k}|${vid}`
  const entryOf = (c, vid) => state.items.find((e) => e.id === idOf(c, vid))
  /** Set the amount of one size (0 = remove). Returns the entry. */
  function setAmt(c, vid, amt, note) {
    const id = idOf(c, vid)
    const i = state.items.findIndex((e) => e.id === id)
    if (amt <= 0) { if (i >= 0) state.items.splice(i, 1); save(); return null }
    if (i >= 0) { state.items[i] = { ...state.items[i], c, amt, ...(note !== undefined ? { note } : {}) }; save(); return state.items[i] }
    if (state.items.length >= MAX) { toast(`Your list is full (${MAX} lines). Send it first.`); return null }
    const e = { id, c, v: vid, amt, note: note || '' }
    state.items.push(e)
    save()
    return e
  }
  function addKit(c, vid, items) {
    if (!items.length) { toast('Tick at least one item of the kit.'); return null }
    const e = entryOf(c, vid)
    if (e) { e.kit = items; save(); return e }
    if (state.items.length >= MAX) { toast(`Your list is full (${MAX} lines). Send it first.`); return null }
    const ne = { id: idOf(c, vid), c, v: vid, amt: 1, note: '', kit: items }
    state.items.push(ne)
    save()
    return ne
  }
  const step = (v, amt, up) => (v.w ? (up ? Math.min(100000, amt + stepOf(v)) : amt - stepOf(v)) : Math.min(999, amt + (up ? 1 : -1)))
  const belowMin = (v, amt) => (v.w ? amt < minOf(v) : amt < 1)

  // ───────── buy blocks (cards, product page, sizes row, search results) ─────────
  const cfgCache = new WeakMap()
  function cfgOf(el) {
    if (!cfgCache.has(el)) { try { cfgCache.set(el, JSON.parse(el.dataset.buy)) } catch { cfgCache.set(el, null) } }
    return cfgCache.get(el)
  }
  function currentV(block, c) {
    if (block.dataset.fixed) return vOf(c, block.dataset.fixed)
    const sel = block.querySelector('[data-vsel]')
    if (sel) return vOf(c, sel.value)
    const chip = block.querySelector('[data-v][aria-pressed="true"]')
    return vOf(c, chip ? chip.dataset.v : c.v[0].id)
  }
  function drawBlock(block) {
    const c = cfgOf(block)
    if (!c) return
    const v = currentV(block, c)
    const e = entryOf(c, v.id)
    const add = block.querySelector('[data-add]')
    if (!add) return
    let qty = block.querySelector('[data-qty]')
    if (!qty) {
      qty = document.createElement('div')
      qty.className = 'qty' + ('big' in block.dataset ? ' big' : '')
      qty.dataset.qty = ''
      qty.innerHTML = '<button type="button" data-dec aria-label="Less">−</button><span aria-live="polite"></span><button type="button" data-inc aria-label="More">+</button>'
      add.after(qty)
    }
    const big = 'big' in block.dataset
    if (!add.dataset.label) add.dataset.label = add.querySelector('span')?.textContent || 'Add'
    add.disabled = !!v.off
    const lbl = add.querySelector('span')
    if (lbl) lbl.textContent = v.off ? 'Out of stock' : add.dataset.label
    add.querySelector('svg')?.toggleAttribute('hidden', !!v.off)
    add.classList.toggle('oos', !!v.off)
    block.classList.toggle('is-off', !!v.off)
    if (big) block.closest('.pdp')?.classList.toggle('is-off', !!v.off)
    add.hidden = !!e
    qty.hidden = !e
    if (e) qty.querySelector('span').textContent = amtText(v, e.amt)
    const price = block.querySelector('[data-price]')
    if (price) price.textContent = v.p || ''
    const vd = block.querySelector('[data-vdesc]')
    if (vd) vd.textContent = v.d || ''
    block.classList.toggle('in-list', !!e)
  }
  function onVariantChange(block) {
    const c = cfgOf(block)
    const v = currentV(block, c)
    // Card photo follows the size (when that size has its own photo).
    const li = block.closest('li')
    const im = li && li.querySelector('[data-card-img]')
    if (im) {
      if (!im.dataset.orig) im.dataset.orig = im.getAttribute('src')
      im.setAttribute('src', v.i || im.dataset.orig)
      im.removeAttribute('srcset')
    }
    const link = li && li.querySelector('a.card')
    if (link && v.u && !('big' in block.dataset)) link.setAttribute('href', v.u)
    // Product page: jump the gallery to this size's photo and remember the size in the address.
    if ('big' in block.dataset) {
      if (Number.isInteger(v.g) && v.g >= 0) document.querySelector(`[data-g-thumb="${v.g}"]`)?.click()
      const u = new URL(location.href)
      if (v.id === c.v[0].id) u.searchParams.delete('v'); else u.searchParams.set('v', v.id)
      history.replaceState(null, '', u)
    }
    drawBlock(block)
  }
  function refresh() {
    const n = state.items.length
    document.querySelectorAll('[data-list-count]').forEach((el) => { el.textContent = n; el.hidden = !n })
    document.querySelectorAll('[data-buy]').forEach(drawBlock)
    kitPanels.forEach((p) => p.draw())
    if (!page && !document.querySelector('[data-reply-page]')) drawBar(n) // not on the shop's reply page
  }

  document.addEventListener('change', (ev) => {
    const sel = ev.target.closest('[data-vsel]')
    if (sel) onVariantChange(sel.closest('[data-buy]'))
  })
  document.addEventListener('click', (ev) => {
    const t = ev.target
    const chip = t.closest('[data-v]')
    if (chip && chip.closest('[data-buy]')) {
      const block = chip.closest('[data-buy]')
      block.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)))
      onVariantChange(block)
      return
    }
    const block = t.closest('[data-buy]')
    if (!block) return
    const c = cfgOf(block)
    if (!c) return
    const v = currentV(block, c)
    if (t.closest('[data-add]')) {
      ev.preventDefault()
      if (v.w) return sheet(c, { v: v.id, g: Number(block.dataset.wantG) || 0 }) // loose: choose the weight first (search may have said how much)
      if (isKit(v)) {
        // On the kit's own page: what the customer ticked in "What's inside"; elsewhere: the full kit.
        const panel = kitPanels.get(`${c.k}|${v.id}`)
        const ke = addKit(c, v.id, panel ? panel.selected() : kitDefault(v))
        if (ke) toast(`✓ Added kit: <strong>${esc(shortName(c.n))}</strong> · ${ke.kit.length} items`)
        return
      }
      const e = setAmt(c, v.id, defaultAmt(v))
      if (e) toast(`✓ Added: <strong>${esc(shortName(c.n))}</strong> · ${esc(qtyText(e))}`)
      block.querySelector('[data-inc]')?.focus({ preventScroll: true })
      return
    }
    const inc = t.closest('[data-inc]'), dec = t.closest('[data-dec]')
    if (inc || dec) {
      const e = entryOf(c, v.id)
      if (!e) return
      const amt = step(v, e.amt, !!inc)
      setAmt(c, v.id, belowMin(v, amt) ? 0 : amt)
      if (!entryOf(c, v.id)) block.querySelector('[data-add]')?.focus({ preventScroll: true })
    }
  })

  // Product page: open with the size from the address (?v=1-kg).
  document.querySelectorAll('[data-buy][data-big]').forEach((block) => {
    const want = new URLSearchParams(location.search).get('v')
    const chip = want && block.querySelector(`[data-v="${CSS.escape(want)}"]`)
    if (chip) { block.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip))); onVariantChange(block) }
  })

  // ───────── kit page: "What's inside" (tick / untick, size, amount) ─────────
  // Before the kit is in the list, changes are kept here and used by "Add kit to my list".
  // Once it is in the list, every change is saved to the list straight away.
  document.querySelectorAll('[data-kit-panel]').forEach((panel) => {
    const block = document.querySelector('.buy-box[data-big]')
    const c = block && cfgOf(block)
    const kv = c && c.v.find((v) => v.id === panel.dataset.kitPanel)
    if (!isKit(kv)) return
    const rows = [...panel.querySelectorAll('.kit-row')]
    const fresh = () => kv.kit.map((k, i) => ({ i, c: k.c, v: k.v, amt: k.a, on: !vOf(k.c, k.v).off }))
    let local = fresh()
    const cur = () => {
      const e = entryOf(c, kv.id)
      if (!e) return local
      return kv.kit.map((k, i) => {
        const x = (e.kit || []).find((y) => y.i === i)
        return x ? { ...x, on: true } : { ...local[i], on: false }
      })
    }
    const pick = (list) => list.filter((x) => x.on && !vOf(x.c, x.v).off).map(({ on, ...x }) => x)
    const selected = () => pick(cur())
    const commit = (list) => {
      local = list.map((x) => ({ ...x }))
      const e = entryOf(c, kv.id)
      if (e) {
        const sel = pick(list)
        if (sel.length) { e.kit = sel; save() } else { setAmt(c, kv.id, 0); toast('Kit removed from your list.') }
      } else draw()
    }
    function draw() {
      const list = cur()
      const e = entryOf(c, kv.id)
      list.forEach((x, i) => {
        const row = rows[i]
        if (!row) return
        const v = vOf(x.c, x.v)
        const on = x.on && !v.off
        row.querySelector('[data-kit-on]').checked = on
        row.classList.toggle('is-out', !on)
        row.querySelector('output').textContent = amtText(v, x.amt)
        row.querySelectorAll('[data-kit-step]').forEach((b) => (b.disabled = !on))
        const sel = row.querySelector('[data-kit-size]')
        if (sel) sel.value = x.v
      })
      const n = list.filter((x) => x.on).length
      panel.querySelector('[data-kit-count]').textContent = n === list.length ? `${n} items` : `${n} of ${list.length} items ticked`
      panel.querySelector('[data-kit-state]').textContent = e ? '✓ In your list. Changes here are saved to it.' : ''
    }
    panel.addEventListener('change', (ev) => {
      const row = ev.target.closest('.kit-row')
      if (!row) return
      const i = Number(row.dataset.i), list = cur()
      if (ev.target.matches('[data-kit-on]')) {
        list[i].on = ev.target.checked
        const v = vOf(list[i].c, list[i].v)
        if (list[i].on && belowMin(v, list[i].amt)) list[i].amt = defaultAmt(v)
      } else if (ev.target.matches('[data-kit-size]')) {
        const was = vOf(list[i].c, list[i].v)
        list[i].v = ev.target.value
        const v = vOf(list[i].c, list[i].v)
        if (!!v.w !== !!was.w || belowMin(v, list[i].amt)) list[i].amt = defaultAmt(v)
        list[i].on = true
      } else return
      commit(list)
    })
    panel.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-kit-step]')
      if (b) {
        const i = Number(b.closest('.kit-row').dataset.i), list = cur(), x = list[i], v = vOf(x.c, x.v)
        const amt = step(v, x.amt, b.dataset.kitStep === '1')
        if (belowMin(v, amt)) x.on = false
        else x.amt = amt
        commit(list)
        b.focus({ preventScroll: true })
      }
      if (ev.target.closest('[data-kit-reset]')) commit(fresh())
    })
    kitPanels.set(`${c.k}|${kv.id}`, { draw, selected })
    draw()
  })

  // ───────── floating bar + toast ─────────
  let bar, toastEl, toastTimer
  const CLIP = '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></svg>'
  function drawBar(n) {
    if (!bar && n) {
      bar = document.createElement('a')
      bar.className = 'list-bar'
      bar.href = '/list/'
      document.body.append(bar)
    }
    if (!bar) return
    bar.hidden = !n
    bar.innerHTML = `<span class="lb-ic" aria-hidden="true">${CLIP}</span>
      <span class="lb-t"><strong>My list · ${n} item${n === 1 ? '' : 's'}</strong><span lang="te">నా జాబితా</span></span>
      <span class="lb-go">View &amp; send <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`
    document.documentElement.classList.toggle('has-list-bar', n > 0)
  }
  function toast(html) {
    if (!toastEl) {
      toastEl = document.createElement('div')
      toastEl.className = 'list-toast'
      toastEl.setAttribute('role', 'status')
      toastEl.setAttribute('aria-live', 'polite')
      document.body.append(toastEl)
    }
    toastEl.innerHTML = html
    toastEl.hidden = false
    toastEl.classList.remove('show')
    void toastEl.offsetWidth
    toastEl.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => (toastEl.hidden = true), 250) }, 2600)
  }

  // ───────── panel: weight for loose items; "Change" on the list page ─────────
  let dlg
  function sheet(c, { v: vid, entry, g } = {}) {
    if (!dlg) {
      dlg = document.createElement('dialog')
      dlg.className = 'sheet'
      dlg.setAttribute('aria-labelledby', 'sheet-title')
      document.body.append(dlg)
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close() })
      dlg.addEventListener('close', () => document.documentElement.classList.remove('sheet-open'))
    }
    const st = { v: entry ? entry.v : vid || c.v[0].id, amt: 0, note: entry ? entry.note || '' : '', by: 0, info: '' }
    const cur = () => vOf(c, st.v)
    st.amt = entry ? entry.amt : g >= minOf(vOf(c, st.v)) ? Math.min(100000, minOf(vOf(c, st.v)) + Math.round((g - minOf(vOf(c, st.v))) / stepOf(vOf(c, st.v))) * stepOf(vOf(c, st.v))) : (entryOf(c, st.v)?.amt || defaultAmt(cur()))
    function draw() {
      const v = cur()
      const w = !!v.w
      const quick = w ? quickOf(v) : v.q || []
      const pic = v.i || c.i
      dlg.innerHTML = `<div class="sh-in">
        <div class="sh-head">
          ${pic ? `<img src="${esc(pic)}" alt="" width="56" height="56">` : ''}
          <div class="sh-title"><h2 id="sheet-title">${esc(c.n)}</h2>${c.t ? `<p lang="te">${esc(c.t)}</p>` : ''}</div>
          <button class="sh-x" type="button" data-close aria-label="Close">✕</button>
        </div>
        <div class="sh-body">
          ${c.v.length > 1 ? `<fieldset class="sh-group"><legend>Size <span lang="te">సైజు</span></legend><div class="opts">
            ${c.v.map((o) => `<label class="opt"><input type="radio" name="sh-v" value="${esc(o.id)}"${o.id === st.v ? ' checked' : ''}><span>${esc(vName(o))}${o.p ? ` <small>${esc(o.p)}</small>` : ''}</span></label>`).join('')}
          </div></fieldset>` : ''}
          <fieldset class="sh-group"><legend>${w ? 'How much? <span lang="te">ఎంత కావాలి?</span>' : 'How many? <span lang="te">ఎన్ని కావాలి?</span>'}</legend>
            ${quick.length ? `<div class="opts quick">${quick.map((x) => `<button type="button" class="opt-b" data-quick="${x}" aria-pressed="${x === st.amt}">${w ? fmtW(x) : x}</button>`).join('')}</div>` : ''}
            ${w ? `<div class="amt-in"><label for="sh-amt">Type the amount</label><input id="sh-amt" type="text" inputmode="decimal" autocomplete="off" value="${st.amt >= 1000 ? +(st.amt / 1000).toFixed(3) : st.amt}" data-amt><select data-unit aria-label="Unit"><option value="g"${st.amt < 1000 ? ' selected' : ''}>g</option><option value="kg"${st.amt >= 1000 ? ' selected' : ''}>kg</option></select></div>${st.info ? `<p class="sh-info">${esc(st.info)}</p>` : ''}` : ''}
            <div class="stepper" role="group" aria-label="Quantity">
              <button type="button" data-step="-1" aria-label="Less"${(w ? st.amt <= minOf(v) : st.amt <= 1) ? ' disabled' : ''}>−</button>
              <output aria-live="polite">${esc(amtText(v, st.amt))}</output>
              <button type="button" data-step="1" aria-label="More">+</button>
            </div>
            ${w ? `<p class="sh-hint">From ${fmtW(minOf(v))} · each + / − changes ${fmtW(st.by || stepOf(v))}. Tap an amount above to change by that much. <span lang="te">${minOf(v)} గ్రాముల నుండి</span></p>` : ''}
          </fieldset>
          <label class="sh-note"><span>Note for the shop <small>(optional)</small></span>
            <input type="text" maxlength="80" value="${esc(st.note)}" placeholder="e.g. fresh stock, big ones" autocomplete="off"></label>
        </div>
        <div class="sh-foot">
          <p class="sh-sum"><span>${esc(shortName(c.n))}</span> <strong>${esc(qtyText({ c, v: st.v, amt: st.amt }))}</strong></p>
          <div class="sh-acts">
            ${entry ? '<button type="button" class="btn btn-light sh-remove" data-remove>Remove</button>' : ''}
            <button type="button" class="btn btn-primary sh-add" data-save>${entry ? 'Save changes' : 'Add to list'}</button>
          </div>
        </div>
      </div>`
      const focus = (sel) => dlg.querySelector(sel)?.focus({ preventScroll: true })
      dlg.querySelectorAll('input[name="sh-v"]').forEach((r) => r.addEventListener('change', () => {
        const wasW = !!cur().w
        st.v = r.value
        if (!!cur().w !== wasW) st.amt = defaultAmt(cur())
        draw(); focus(`input[name="sh-v"][value="${CSS.escape(r.value)}"]`)
      }))
      dlg.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => { st.amt = Number(b.dataset.quick); if (cur().w) st.by = st.amt; st.info = ''; draw(); focus(`[data-quick="${b.dataset.quick}"]`) }))
      const amtIn = dlg.querySelector('[data-amt]'), unitIn = dlg.querySelector('[data-unit]')
      const applyTyped = () => {
        const n = parseFloat(String(amtIn.value).replace(',', '.'))
        if (!(n > 0)) return
        const v = cur(), want = Math.round(unitIn.value === 'kg' ? n * 1000 : n)
        const ok = Math.min(100000, Math.max(minOf(v), minOf(v) + Math.round((want - minOf(v)) / stepOf(v)) * stepOf(v)))
        st.info = ok !== want ? `Rounded to ${fmtW(ok)} (sold in steps of ${fmtW(stepOf(v))}, from ${fmtW(minOf(v))}).` : ''
        st.amt = ok
        draw(); focus('[data-amt]')
      }
      // redraw after the event has finished (the box is replaced by the redraw)
      amtIn?.addEventListener('change', () => setTimeout(applyTyped, 0))
      amtIn?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); amtIn.blur() } })
      unitIn?.addEventListener('change', () => setTimeout(applyTyped, 0))
      dlg.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const by = cur().w && st.by ? st.by : 0
        const amt = by ? (b.dataset.step === '1' ? Math.min(100000, st.amt + by) : st.amt - by) : step(cur(), st.amt, b.dataset.step === '1')
        st.info = ''
        if (!belowMin(cur(), amt)) st.amt = amt
        draw(); focus(`[data-step="${b.dataset.step}"]`)
      }))
      dlg.querySelector('.sh-note input').addEventListener('input', (e) => (st.note = e.target.value))
      dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close())
      dlg.querySelector('[data-save]').addEventListener('click', () => {
        const note = st.note.trim().slice(0, 80)
        let e
        if (entry) {
          // Keep the line where it was (also when the size was changed).
          const newId = idOf(c, st.v)
          state.items = state.items.filter((x) => x.id !== newId || x.id === entry.id)
          const at = state.items.findIndex((x) => x.id === entry.id)
          if (at >= 0) { state.items[at] = { ...state.items[at], id: newId, v: st.v, c, amt: st.amt, note }; e = state.items[at]; save() }
          else e = setAmt(c, st.v, st.amt, note)
        } else e = setAmt(c, st.v, st.amt, note)
        dlg.close()
        if (page) drawPage()
        else if (e) toast(`✓ Added: <strong>${esc(shortName(c.n))}</strong> · ${esc(qtyText(e))}`)
      })
      dlg.querySelector('[data-remove]')?.addEventListener('click', () => { state.items = state.items.filter((x) => x.id !== entry.id); save(); dlg.close(); if (page) drawPage() })
    }
    draw()
    document.documentElement.classList.add('sheet-open')
    dlg.showModal()
    dlg.querySelector('.sh-add')?.focus({ preventScroll: true })
  }

  // ───────── /list/ page ─────────
  function istNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    return Number(parts.find((p) => p.type === 'hour').value)
  }
  const SLOTS = [['morning', 'Morning', '6 AM – 12 PM', 12], ['afternoon', 'Afternoon', '12 – 4 PM', 16], ['evening', 'Evening', '4 – 10 PM', 22]]
  const slotOk = (day, slot) => day !== 'today' || istNow() < SLOTS.find((s) => s[0] === slot)[3]
  const pickupText = () => {
    const s = SLOTS.find((x) => x[0] === state.slot)
    return s && state.day ? `${state.day === 'today' ? 'Today' : 'Tomorrow'} ${s[1].toLowerCase()} (${s[2]})` : ''
  }
  // The list is shown (and sent) in groups: Kirana, Puja Samagri, Puja kits.
  const GROUPS = [['kirana', 'Kirana', 'కిరాణా'], ['puja', 'Puja Samagri', 'పూజా సామగ్రి'], ['kit', 'Puja kits', 'పూజా కిట్లు'], ['other', 'Other items', '']]
  const groupOf = (e) => (e.kit ? 'kit' : e.c.s === 'p' ? 'puja' : e.c.s === 'k' ? 'kirana' : 'other')
  /** [[group, [[entry, index in state.items], …]], …] in the order above, only groups that have items. */
  const grouped = () => GROUPS.map((g) => [g, state.items.map((e, i) => [e, i]).filter(([e]) => groupOf(e) === g[0])]).filter(([, l]) => l.length)
  function message() {
    const n = state.items.length
    const lines = ['Namaste Janardhan General Stores 🙏', `My list (${n} item${n === 1 ? '' : 's'}):`]
    const groups = grouped()
    let k = 0
    for (const [[, en], list] of groups) {
      lines.push('')
      if (groups.length > 1) lines.push(`*${en}*`)
      for (const [e] of list) {
        k++
        if (e.kit) {
          lines.push(`${k}. ${e.c.n}${e.c.t ? ` / ${e.c.t}` : ''}${e.amt > 1 ? ` × ${e.amt}` : ''} (${e.kit.length} items${e.amt > 1 ? ' in each kit' : ''}):`)
          e.kit.forEach((x) => lines.push(`    - ${x.c.n} – ${kitItemText(x)}`))
          if (e.note) lines.push(`    Note: ${e.note}`)
        } else lines.push(`${k}. ${e.c.n}${e.c.t ? ` / ${e.c.t}` : ''} – ${qtyText(e)}${e.note ? ` – Note: ${e.note}` : ''}`)
      }
    }
    lines.push('', `Name: ${state.name.trim()}`, `Phone: ${mobile(state.phone) || state.phone.trim()}`, `Pickup at the shop: ${pickupText()}`, '', 'Please confirm which items are available.')
    if (state.askPrice) lines.push('Please also tell me the estimated total price for these items.')
    // The shop taps this link. The reply page is only ever on shop.myconnect.sbs (the shop checks the address).
    lines.push('', '— For the shop (tap to reply) —', `${location.origin}/reply/#${replyCode()}`)
    return lines.join('\n')
  }
  // The shop pastes the message into its reply page (/reply/) to mark ✓ Have / ✗ No and send a bill. The list travels in the code.
  //   { n: name, d: day, s: slot, a: asked for total, t: minutes since 1970, i: [[size id, amount, note] | [kit size id, kits, [[size id, amount]…], note]] }
  // Compressed when the browser can (about half as long); the plain form is always correct as a fallback.
  const b64u = (bytes) => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
  function replyJson(t) {
    const i = state.items.map((e) => {
      const x = e.kit ? [e.v, e.amt, e.kit.map((k) => [k.v, k.amt])] : [e.v, e.amt]
      if (e.note) x.push(e.note)
      return x
    })
    return JSON.stringify({ n: state.name.trim().slice(0, 40), p: mobile(state.phone), d: state.day, s: state.slot, a: state.askPrice ? 1 : 0, t, i })
  }
  let zLink = { key: '', url: '' }
  async function packLink() {
    const t = Math.round(Date.now() / 60000)
    const key = replyJson(0)
    if (key === zLink.key || !('CompressionStream' in window)) return
    try {
      const stream = new Blob([replyJson(t)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      zLink = { key, url: `z${b64u(bytes)}` }
      const pv = page && page.querySelector('[data-preview]')
      if (pv) pv.textContent = message()
    } catch {}
  }
  function replyCode() {
    if (zLink.key === replyJson(0)) return zLink.url
    packLink()
    return b64u(new TextEncoder().encode(replyJson(Math.round(Date.now() / 60000))))
  }
  // "Repeat my last list": the list is remembered when it is sent on WhatsApp.
  const LAST = 'jgs-last-v1'
  function loadLast() {
    try {
      const d = JSON.parse(localStorage.getItem(LAST))
      if (d && Array.isArray(d.items) && d.items.length) return { at: Number(d.at) || 0, items: d.items.filter((e) => e && e.c && e.c.k && Array.isArray(e.c.v)) }
    } catch {}
    return null
  }
  function lastCard() {
    const last = loadLast()
    if (!last || !last.items.length) return ''
    const when = last.at ? new Date(last.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : ''
    const names = last.items.map((e) => shortName(e.c.n))
    return `<div class="last-list">
      <h3>Your last list${when ? ` <small>· sent ${esc(when)}</small>` : ''}</h3>
      <p>${last.items.length} item${last.items.length === 1 ? '' : 's'}: ${esc(names.slice(0, 6).join(', '))}${names.length > 6 ? ' …' : ''}</p>
      <button type="button" class="btn btn-primary" data-repeat>Add the same items again <span lang="te">మళ్ళీ అదే జాబితా</span></button>
    </div>`
  }
  let sentNotice = false
  function itemRow(e, i) {
    const v = vOf(e.c, e.v)
    const pic = v.i || e.c.i
    const href = e.c.u + (v.id !== e.c.v[0].id ? `?v=${encodeURIComponent(v.id)}` : '')
    const ph = `<a class="li-ph" href="${esc(href)}" tabindex="-1" aria-hidden="true">${pic ? `<img src="${esc(pic)}" alt="" width="64" height="64" loading="lazy">` : `<span class="li-noph">${esc((e.c.b || e.c.n).slice(0, 2).toUpperCase())}</span>`}</a>`
    const stepper = `<div class="stepper small" role="group" aria-label="${e.kit ? 'Number of kits' : 'Quantity'} of ${esc(e.c.n)}">
        <button type="button" data-row-step="-1" data-i="${i}" aria-label="Less">−</button>
        <output>${esc(amtText(v, e.amt))}</output>
        <button type="button" data-row-step="1" data-i="${i}" aria-label="More">+</button>
      </div>`
    if (e.kit) {
      return `<li class="li-row li-kit">${ph}
        <div class="li-t">
          <a class="li-n" href="${esc(href)}">${esc(e.c.n)}</a>${e.c.t ? `<span lang="te">${esc(e.c.t)}</span>` : ''}
          <span class="li-q">Puja kit · ${e.kit.length} item${e.kit.length === 1 ? '' : 's'}${e.amt > 1 ? ` · ${e.amt} kits` : ''}</span>
        </div>
        <div class="li-ctl">${stepper}
          <div class="li-acts"><a class="link-btn" href="${esc(href)}">Change items</a><button type="button" class="link-btn danger" data-del="${i}" aria-label="Remove ${esc(e.c.n)}">Remove</button></div>
        </div>
        <ul class="li-kit-items" aria-label="Items in ${esc(e.c.n)}">${e.kit.map((x, j) => {
          const xv = vOf(x.c, x.v)
          return `<li${xv.off ? ' class="is-off"' : ''}><span class="lk-n">${esc(shortName(x.c.n))} <small>${esc(kitItemText(x))}</small>${xv.off ? ' <em class="li-oos">Out of stock now</em>' : ''}</span>
            <div class="stepper mini" role="group" aria-label="Amount of ${esc(x.c.n)}"><button type="button" data-kit-row="-1" data-i="${i}" data-j="${j}" aria-label="Less">−</button><output>${esc(amtText(xv, x.amt))}</output><button type="button" data-kit-row="1" data-i="${i}" data-j="${j}" aria-label="More">+</button></div>
            <button type="button" class="lk-x" data-kit-del="${j}" data-i="${i}" aria-label="Remove ${esc(x.c.n)} from the kit">✕</button></li>`
        }).join('')}</ul>
      </li>`
    }
    return `<li class="li-row">${ph}
      <div class="li-t">
        <a class="li-n" href="${esc(href)}">${esc(e.c.n)}</a>${e.c.t ? `<span lang="te">${esc(e.c.t)}</span>` : ''}
        ${v.off ? '<span class="li-oos">Out of stock now — remove it or ask the shop</span>' : ''}<span class="li-q">${esc(qtyText(e))}${v.p ? ` <span class="li-p">· ${esc(v.p)}</span>` : ''}</span>
        ${e.note ? `<span class="li-note">Note: ${esc(e.note)}</span>` : ''}
      </div>
      <div class="li-ctl">${stepper}
        <div class="li-acts"><button type="button" class="link-btn" data-edit="${i}">Change</button><button type="button" class="link-btn danger" data-del="${i}" aria-label="Remove ${esc(e.c.n)}">Remove</button></div>
      </div>
    </li>`
  }
  function drawPage() {
    const n = state.items.length
    if (!n) {
      page.innerHTML = `<div class="list-empty">
        <div class="le-ic" aria-hidden="true">${CLIP}</div>
        <h2>Your list is empty</h2><p lang="te">మీ జాబితా ఖాళీగా ఉంది</p>
        <ol class="le-steps">
          <li><strong>Choose the size</strong> on any item</li>
          <li><strong>Tap “Add”</strong>, then + / − for how many</li>
          <li><strong>Send</strong> the list to the shop on WhatsApp</li>
        </ol>
        <div class="actions"><a class="btn btn-primary" href="/kirana/">Browse Kirana</a><a class="btn btn-light" href="/puja-samagri/">Browse Puja Samagri</a></div>
        ${lastCard()}
      </div>`
      page.querySelector('[data-repeat]')?.addEventListener('click', () => {
        const last = loadLast()
        if (!last) return
        state.items = last.items.slice(0, MAX)
        save(); drawPage()
        page.querySelector('#li-h')?.focus()
      })
      return
    }
    const today = SLOTS.some((s) => slotOk('today', s[0]))
    if (state.day === 'today' && !today) state.day = ''
    if (state.day && state.slot && !slotOk(state.day, state.slot)) state.slot = ''
    page.innerHTML = `<div class="list-layout">
      <section class="list-items" aria-labelledby="li-h">
        <div class="li-head"><h2 id="li-h">${n} item${n === 1 ? '' : 's'} <span lang="te">వస్తువులు</span></h2>
          <button type="button" class="link-btn" data-clear>Clear list</button></div>
        ${(() => {
          const groups = grouped()
          return groups.map(([[g, en, tel], list]) => `${groups.length > 1 ? `<h3 class="li-grp">${esc(en)}${tel ? ` <span lang="te">${esc(tel)}</span>` : ''} <small>${list.length}</small></h3>` : ''}
        <ul class="li-list" data-group="${g}">${list.map(([e, i]) => itemRow(e, i)).join('')}</ul>`).join('')
        })()}
        <a class="li-more" href="/search/">+ Add more items</a>
      </section>
      <section class="send-panel" aria-labelledby="sp-h">
        <h2 id="sp-h">Send to the shop <span lang="te">షాప్‌కు పంపండి</span></h2>
        <label class="sp-field"><span>Your name <span lang="te">మీ పేరు</span></span>
          <input type="text" data-name maxlength="40" autocomplete="name" value="${esc(state.name)}" placeholder="e.g. Ravi Kumar" aria-describedby="err-name">
          <small class="sp-err" id="err-name" hidden>Please enter your name.</small></label>
        <label class="sp-field"><span>Your WhatsApp number <span lang="te">మీ వాట్సాప్ నంబర్</span></span>
          <input type="tel" data-phone inputmode="numeric" maxlength="17" autocomplete="tel-national" value="${esc(state.phone || '')}" placeholder="10-digit mobile number" aria-describedby="err-phone">
          <small class="sp-err" id="err-phone" hidden>Please enter your 10-digit mobile number.</small></label>
        <fieldset class="sp-field"><legend>Pickup time <span lang="te">ఎప్పుడు తీసుకెళ్తారు?</span></legend>
          <div class="opts">
            ${[['today', 'Today', 'ఈరోజు'], ['tomorrow', 'Tomorrow', 'రేపు']].map(([v, en, t]) => `<label class="opt"><input type="radio" name="sp-day" value="${v}"${state.day === v ? ' checked' : ''}${v === 'today' && !today ? ' disabled' : ''}><span>${en} <small lang="te">${t}</small></span></label>`).join('')}
          </div>
          <div class="opts slots">
            ${SLOTS.map(([v, en, time]) => `<label class="opt"><input type="radio" name="sp-slot" value="${v}"${state.slot === v ? ' checked' : ''}${state.day && !slotOk(state.day, v) ? ' disabled' : ''}><span>${en} <small>${time}</small></span></label>`).join('')}
          </div>
          <small class="sp-info">Pickup at the shop only, Main Road, Rajampet. We don’t do home delivery. <span lang="te">హోమ్ డెలివరీ లేదు.</span></small>
          <small class="sp-err" id="err-pick" hidden>Please choose the day and the time.</small>
        </fieldset>
        <label class="sp-check"><input type="checkbox" data-ask${state.askPrice ? ' checked' : ''}>
          <span><strong>Ask the shop for the estimated total price</strong><span lang="te">మొత్తం అంచనా ధర చెప్పమని అడగండి</span></span></label>
        <button type="button" class="btn btn-wa sp-send" data-send><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path class="icon-fill" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3ZM12 2a10 10 0 0 0-8.6 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>Send list on WhatsApp</button>
        ${sentNotice ? `<div class="sp-sent" role="status"><p><strong>Did you send the message?</strong> The shop will reply on WhatsApp to confirm.</p>
          <div class="actions"><button type="button" class="btn btn-light" data-clear-sent>Yes, clear my list</button><button type="button" class="link-btn" data-keep>Keep the list</button></div></div>` : ''}
        <details class="sp-preview"><summary>See the message</summary><pre data-preview>${esc(message())}</pre></details>
        <p class="sp-small">WhatsApp opens with your list typed in. Just press send. No payment is taken here. Pay at the shop when you pick up.</p>
      </section>
    </div>`
    const pv = page.querySelector('[data-preview]')
    const updatePreview = () => (pv.textContent = message())
    page.querySelector('[data-name]').addEventListener('input', (e) => { state.name = e.target.value; save(); updatePreview(); page.querySelector('#err-name').hidden = true })
    page.querySelector('[data-phone]').addEventListener('input', (e) => { state.phone = e.target.value.replace(/[^\d+ ]/g, ''); if (state.phone !== e.target.value) e.target.value = state.phone; save(); updatePreview(); if (mobile(state.phone)) page.querySelector('#err-phone').hidden = true })
    page.querySelectorAll('input[name="sp-day"]').forEach((r) => r.addEventListener('change', () => { state.day = r.value; if (state.slot && !slotOk(state.day, state.slot)) state.slot = ''; save(); drawPage(); page.querySelector(`input[name="sp-day"][value="${r.value}"]`).focus() }))
    page.querySelectorAll('input[name="sp-slot"]').forEach((r) => r.addEventListener('change', () => { state.slot = r.value; save(); updatePreview(); page.querySelector('#err-pick').hidden = true }))
    page.querySelector('[data-ask]').addEventListener('change', (e) => { state.askPrice = e.target.checked; save(); updatePreview() })
    page.querySelector('[data-clear]').addEventListener('click', () => { if (confirm('Remove all items from your list?')) { state.items = []; save(); drawPage() } })
    page.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { state.items.splice(Number(b.dataset.del), 1); save(); drawPage() }))
    page.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { const e = state.items[Number(b.dataset.edit)]; sheet(e.c, { entry: e }) }))
    page.querySelectorAll('[data-row-step]').forEach((b) => b.addEventListener('click', () => {
      const e = state.items[Number(b.dataset.i)]
      const v = vOf(e.c, e.v)
      const amt = step(v, e.amt, b.dataset.rowStep === '1')
      if (belowMin(v, amt)) { if (!confirm(`Remove ${e.c.n} from your list?`)) return; state.items.splice(Number(b.dataset.i), 1) }
      else e.amt = amt
      save(); drawPage()
      page.querySelector(`[data-row-step="${b.dataset.rowStep}"][data-i="${b.dataset.i}"]`)?.focus()
    }))
    // items inside a kit: − / + and ✕
    const kitChange = (i, j, fn) => {
      const e = state.items[i]
      if (!e || !e.kit || !e.kit[j]) return
      fn(e)
      if (!e.kit.length) state.items.splice(i, 1)
      save(); drawPage()
    }
    page.querySelectorAll('[data-kit-row]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i), j = Number(b.dataset.j)
      kitChange(i, j, (e) => {
        const x = e.kit[j], v = vOf(x.c, x.v)
        const amt = step(v, x.amt, b.dataset.kitRow === '1')
        if (belowMin(v, amt)) e.kit.splice(j, 1)
        else x.amt = amt
      })
      page.querySelector(`[data-kit-row="${b.dataset.kitRow}"][data-i="${i}"][data-j="${j}"]`)?.focus()
    }))
    page.querySelectorAll('[data-kit-del]').forEach((b) => b.addEventListener('click', () => kitChange(Number(b.dataset.i), Number(b.dataset.kitDel), (e) => e.kit.splice(Number(b.dataset.kitDel), 1))))
    page.querySelector('[data-send]').addEventListener('click', () => {
      const nameOk = state.name.trim().length > 0
      const phoneOk = !!mobile(state.phone)
      const pickOk = !!(state.day && state.slot && slotOk(state.day, state.slot))
      page.querySelector('#err-name').hidden = nameOk
      page.querySelector('#err-phone').hidden = phoneOk
      page.querySelector('#err-pick').hidden = pickOk
      if (!nameOk) return page.querySelector('[data-name]').focus()
      if (!phoneOk) return page.querySelector('[data-phone]').focus()
      if (!pickOk) return page.querySelector('input[name="sp-day"]:not(:disabled)').focus()
      open(`https://wa.me/${page.dataset.wa}?text=${encodeURIComponent(message())}`, '_blank', 'noopener')
      try { localStorage.setItem(LAST, JSON.stringify({ at: Date.now(), items: state.items })) } catch {}
      sentNotice = true
      drawPage()
    })
    page.querySelector('[data-clear-sent]')?.addEventListener('click', () => { state.items = []; sentNotice = false; save(); drawPage() })
    page.querySelector('[data-keep]')?.addEventListener('click', () => { sentNotice = false; drawPage() })
  }

  document.addEventListener('jgs:cards', refresh) // search results were (re)drawn
  refresh()
  if (page) drawPage()
})()
