// Janardhan General Stores static site — small progressive enhancements. Everything works without this file.
;(() => {
  // 1. "Open now" badge, computed from the published hours in India Standard Time.
  const badges = document.querySelectorAll('[data-open-badge]')
  if (badges.length) {
    const open = Number(document.documentElement.dataset.open || 6)
    const close = Number(document.documentElement.dataset.close || 22)
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === 'hour').value)
    const m = Number(parts.find((p) => p.type === 'minute').value)
    const now = h + m / 60
    const isOpen = now >= open && now < close
    const fmt = (x) => `${((x + 11) % 12) + 1} ${x < 12 ? 'AM' : 'PM'}`
    badges.forEach((b) => {
      b.textContent = isOpen ? `Open now · closes ${fmt(close)}` : `Closed now · opens ${fmt(open)}`
      b.classList.add(isOpen ? 'is-open' : 'is-closed')
      b.hidden = false
    })
  }

  // 2. Mobile menu (<details>): close on Escape and on outside click.
  const menu = document.querySelector('details.menu')
  if (menu) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false
        menu.querySelector('summary').focus()
      }
    })
    document.addEventListener('click', (e) => {
      if (menu.open && !menu.contains(e.target)) menu.open = false
    })
  }

  // 3. Festival recommendations (home page): show the festival that matches today's date in IST.
  //    Preview another day with ?fest-date=YYYY-MM-DD.
  const fests = [...document.querySelectorAll('[data-fest]')]
  if (fests.length) {
    const iso = /^\d{4}-\d{2}-\d{2}$/
    const q = new URLSearchParams(location.search).get('fest-date')
    const today = q && iso.test(q) ? q : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
    // Home page: only during the lead-in / festival days. A festival's own page: always its next date.
    const onFestPage = !!document.querySelector('[data-fest-page]')
    const active = onFestPage
      ? fests.filter((el) => today <= el.dataset.end).sort((a, b) => a.dataset.start.localeCompare(b.dataset.start))[0]
      : fests
        .filter((el) => el.dataset.from <= today && today <= el.dataset.end)
        .sort((a, b) => a.dataset.end.localeCompare(b.dataset.end))[0]
    const fallback = document.querySelector('[data-fest-fallback]')
    if (fallback) fallback.hidden = !!active
    if (active) {
      const { start, end } = active.dataset
      const isDay = today >= start
      const days = JSON.parse(active.dataset.days || '[]')
      const when = active.querySelector('[data-fest-when]')
      active.querySelector('[data-phase="before"]').hidden = isDay
      active.querySelector('[data-phase="day"]').hidden = !isDay
      if (!isDay) {
        const n = dayDiff(today, start)
        when.textContent = n === 1 ? 'Tomorrow' : n <= 60 ? `In ${n} days` : 'Coming up'
      } else {
        const i = days.findIndex((d) => d.d === today)
        const d = days[i]
        const repeats = d && days.filter((x) => x.en === d.en).length > 1
        if (d) when.textContent = `Today · ${d.en}${repeats ? ` · day ${i + 1}` : ''}`
        else when.textContent = 'season' in active.dataset ?`This month · until ${new Date(end + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'Today'
        if (d && d.title) active.querySelector('[data-fest-title]').textContent = d.title
        active.classList.add('is-today')
      }
      active.hidden = false
    }
    // Make preview mode obvious so it is never mistaken for today's real view.
    if (q && iso.test(q)) {
      const note = document.createElement('p')
      note.className = 'fest-preview'
      note.textContent = `Preview mode: showing the page as on ${new Date(q + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}. Remove “?fest-date=…” from the address to see today.`
      ;(active || fests[0]).before(note)
    }
  }

  // 4. Product photo gallery: swipe (native scroll-snap) + arrows, dots/thumbnails and keyboard.
  document.querySelectorAll('[data-gallery]').forEach((g) => {
    const track = g.querySelector('.g-track')
    const slides = [...track.children]
    const thumbs = [...g.querySelectorAll('[data-g-thumb]')]
    const count = g.querySelector('[data-g-count]')
    const prev = g.querySelector('[data-g-prev]')
    const next = g.querySelector('[data-g-next]')
    let current = 0
    const go = (i) => {
      i = Math.max(0, Math.min(slides.length - 1, i))
      track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    const update = () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
      if (i === current && count.dataset.ready) return
      current = i
      count.dataset.ready = '1'
      count.textContent = `${i + 1} / ${slides.length}`
      thumbs.forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')))
      prev.disabled = i === 0
      next.disabled = i === slides.length - 1
    }
    prev.hidden = next.hidden = false
    prev.addEventListener('click', () => go(current - 1))
    next.addEventListener('click', () => go(current + 1))
    thumbs.forEach((t, k) => t.addEventListener('click', (e) => { e.preventDefault(); go(k) }))
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1) }
    })
    let raf = 0
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }, { passive: true })
    addEventListener('resize', () => go(current))
    // Opened from a brand search (?photo=3): start on that brand's photo.
    const want = Number(new URLSearchParams(location.search).get('photo')) - 1
    if (want > 0 && want < slides.length) track.scrollLeft = want * track.clientWidth
    update()
    // Brand buttons on the product page ("Brands at the shop") show that brand's photo.
    document.querySelectorAll('[data-g-go]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault()
      go(Number(a.dataset.gGo))
      if (g.getBoundingClientRect().top < 0) g.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }))
  })

  // 5. Filters on category and type pages: typed text + Type chips + Brand chips, all together.
  const filter = document.querySelector('[data-filter]')
  const typeBox = document.querySelector('[data-type-chips]')
  const brandBox = document.querySelector('[data-brand-chips]')
  if (filter || typeBox || brandBox) {
    const cards = [...document.querySelectorAll('.product-grid [data-filter-item]')]
    const count = document.querySelector('[data-filter-count]')
    const empty = document.querySelector('[data-filter-empty]')
    const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/([a-z])\1+/g, '$1').replace(/([bcdgjkpt])h/g, '$1')
    if (filter) {
      const form = filter.closest('form')
      form.hidden = false
      form.addEventListener('submit', (e) => e.preventDefault())
    }
    const total = cards.length
    let type = '', brand = ''
    const apply = () => {
      const terms = filter ? norm(filter.value).split(/\s+/).filter(Boolean) : []
      let shown = 0
      cards.forEach((li) => {
        const hay = norm(li.dataset.filterItem)
        const ok = terms.every((t) => hay.includes(t)) && (!type || li.dataset.type === type) && (!brand || li.dataset.brand === brand)
        li.hidden = !ok
        if (ok) shown++
      })
      if (count) count.textContent = terms.length || type || brand ? `${shown} of ${total} items` : `${total} items`
      if (empty) empty.hidden = shown !== 0
    }
    filter?.addEventListener('input', apply)
    const chipGroup = (box, attr, set) => {
      if (!box) return
      box.hidden = false
      const chips = [...box.querySelectorAll(`[${attr}]`)]
      chips.forEach((b) => b.addEventListener('click', () => {
        set(b.getAttribute(attr))
        chips.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
        apply()
      }))
    }
    chipGroup(typeBox, 'data-type-chip', (v) => (type = v))
    chipGroup(brandBox, 'data-brand-chip', (v) => (brand = v))
  }

  // 5b. Product page on phones: show the sticky Add bar once the main Add box has scrolled out of view.
  const stickyBuy = document.querySelector('[data-sticky]')
  const mainBuy = document.querySelector('.buy-box[data-big]')
  if (stickyBuy && mainBuy && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting && e.boundingClientRect.top < 0
      stickyBuy.classList.toggle('show', show)
      stickyBuy.setAttribute('aria-hidden', String(!show))
      stickyBuy.inert = !show
      document.documentElement.classList.toggle('sticky-buy-on', show)
    }).observe(mainBuy)
  }

  // 6. App (PWA): offline support + "Install the app" button.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installBtns = document.querySelectorAll('[data-install]')
  const help = document.querySelector('[data-install-help]')
  let deferred = null
  const showHelp = () => {
    if (!help) return
    help.hidden = false
    help.querySelector(`[data-help="${ios ? 'ios' : 'other'}"]`).hidden = false
  }
  if (standalone) {
    document.querySelectorAll('[data-installed]').forEach((el) => (el.hidden = false))
  } else {
    installBtns.forEach((b) => {
      b.hidden = false
      b.addEventListener('click', async () => {
        if (!deferred) return showHelp()
        deferred.prompt()
        const choice = await deferred.userChoice.catch(() => null)
        deferred = null
        if (choice && choice.outcome === 'accepted') installBtns.forEach((x) => (x.hidden = true))
      })
    })
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e })
    addEventListener('appinstalled', () => {
      installBtns.forEach((x) => (x.hidden = true))
      if (help) help.hidden = true
      document.querySelectorAll('[data-installed]').forEach((el) => { el.hidden = false; el.textContent = '✓ Installed. Open it from your home screen or apps list.' })
    })
  }
  if (standalone) document.querySelectorAll('[data-app-link]').forEach((a) => a.closest('li').remove())

  // 7. Shop QR poster: print only the poster.
  const printBtn = document.querySelector('[data-print-poster]')
  if (printBtn) {
    printBtn.hidden = false
    printBtn.addEventListener('click', () => {
      document.documentElement.classList.add('print-poster')
      addEventListener('afterprint', () => document.documentElement.classList.remove('print-poster'), { once: true })
      print()
    })
  }
})()
