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

  // 3. In-category filter.
  const filter = document.querySelector('[data-filter]')
  if (filter) {
    const form = filter.closest('form')
    const cards = [...document.querySelectorAll('[data-filter-item]')]
    const count = document.querySelector('[data-filter-count]')
    const empty = document.querySelector('[data-filter-empty]')
    const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/([a-z])\1+/g, '$1').replace(/([bcdgjkpt])h/g, '$1')
    form.hidden = false
    form.addEventListener('submit', (e) => e.preventDefault())
    const total = cards.length
    filter.addEventListener('input', () => {
      const terms = norm(filter.value).split(/\s+/).filter(Boolean)
      let shown = 0
      cards.forEach((li) => {
        const hay = norm(li.dataset.filterItem)
        const ok = terms.every((t) => hay.includes(t))
        li.hidden = !ok
        if (ok) shown++
      })
      count.textContent = terms.length ? `${shown} of ${total} items` : `${total} items`
      empty.hidden = shown !== 0
    })
  }
})()
