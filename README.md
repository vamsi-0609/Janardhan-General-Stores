# Janardhan General Stores and Puja Samagri — static public catalogue

A fully static Kirana & Puja Samagri catalogue for **Janardhan General Stores and Puja Samagri, Rajampet**, built for Cloudflare Pages (free plan).

It is **independent** of the main ManaStore online-ordering application (`../frontend`, `../backend`). It has no backend, database, API, login, cart or checkout. It keeps working when the Spring Boot app and MySQL are stopped.

## Quick start

```bash
cd static-site
npm install          # dev tools only (sharp for images, playwright-core for verification)
npm run build        # → dist/
npm run preview      # http://localhost:4173 (mimics Cloudflare Pages routing)
npm run verify       # browser checks at 390/768/1024/1366 px (needs Chrome or Edge installed)
```

The build uses only Node's standard library. It needs no network access and no environment variables.

## Where things live

| Path | What |
| --- | --- |
| `src/data/shop.mjs` | Name, address (EN/TE), phone, WhatsApp, email, hours, Maps link — edit contact details here |
| `src/data/catalogue.mjs` | Sections, categories and products (EN name, Telugu name, aliases, description) |
| `src/data/image-credits.json` | Internal record of where each product photo came from (not shown on the site) |
| `src/styles.css`, `src/client/*.js` | Styling, small progressive enhancements, client-side search |
| `scripts/build.mjs` | Static site generator → `dist/` |
| `public/` | Copied as-is: product photos, logo, fonts, `_headers`, `_redirects` |
| `scripts/fetch-images.mjs`, `image-candidates.mjs`, `image-overrides.mjs`, `make-thumbs.mjs` | Photo sourcing pipeline (maintenance only) |

### Catalogue editor (local only)

Double-click **`Open Editor.cmd`** (or run `npm run editor`). It opens http://localhost:4300, where you can add and edit products (names, Telugu names, also-known-as names, brands, sizes, price, notes, multiple photos), categories and festivals (items, messages, dates). Every save rebuilds the site, and **View in browser** opens the preview at http://localhost:4173. The editor only runs on this computer and is never deployed. Data is stored in `src/data/catalogue.json` and `src/data/festivals.json`. Nothing goes live until the changes are committed and pushed.

### Festival recommendations (home page)

The top of the home page shows the next festival automatically, using today's date in India: items to buy for a few days before it, then a greeting on the festival day. Festivals, dates, greetings and items are in `src/data/festivals.mjs`. **Add next year's dates there once a year** (the build warns when fewer than 120 days of dates are left). Preview any day with `/?fest-date=YYYY-MM-DD`.

### Using your own shop photos (recommended)

Save a photo as `shop-photos/<product-slug>.jpg` (the slug is the last part of the product URL, e.g. `/kirana/personal-care/bath-soap/` → `bath-soap.jpg`), then run `npm run shop-photos && npm run build`. **More than one photo for a product:** name the extra photos `<slug>-2.jpg`, `<slug>-3.jpg` and so on (e.g. `bath-soap-2.jpg`). The product page then shows a swipeable gallery with arrows and thumbnails. Cards and lists keep using the main photo. Deleting an extra photo from `shop-photos/` removes it from the site at the next `npm run shop-photos`.

Photos are trimmed, fitted to a square without cutting labels, optimised to WebP and never overwritten by the stock-photo scripts. `shop-photos/` is not deployed. Only the processed images in `public/img/products/` are. `shop-photos/SOURCES.txt` lists the original file names.

### Adding or changing a product

1. Add or edit the `P(...)` entry in `src/data/catalogue.mjs`. Slugs must be unique.
2. Get a photo: `node scripts/image-candidates.mjs <slug>` → open `.verify/resheet-0.html`, choose a candidate number, add `'<slug>': { c: <n> }` to `scripts/image-overrides.mjs`.
3. `node scripts/fetch-images.mjs <slug> && node scripts/make-thumbs.mjs`, then `npm run build`.

The build fails if any product is missing a photo.

A product may carry an owner-confirmed price via `price` / `priceTe` (currently only Coconut). Do not add prices, brands, offers or stock claims the shop has not confirmed.

## Cloudflare Pages configuration

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Root directory | *(leave empty: this folder is the repository root)* |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | none required. Optional: `SITE_URL` (default `https://shop.myconnect.sbs`, used for canonical URLs, sitemap, Open Graph). Node version comes from `.nvmrc` (22). |

* **Routing:** every page is pre-rendered as `path/index.html`, so no SPA fallback is needed (and none should be added). Unknown URLs are served `404.html` with HTTP 404 automatically.
* **`public/_headers`:** CSP (`script-src 'self'`, no third-party origins), `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer and Permissions policies, long-term caching for hashed `/assets/*` and `/fonts/*`, and `X-Robots-Tag: noindex` on `*.pages.dev` hosts.
* **`public/_redirects`:** only friendly short links (`/pooja`, `/puja`, `/directions`, `/map`, `/home`).

### Deploy steps (when approved)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → choose this repository (production branch `main`).
2. Leave **Root directory** empty, set **Build command** `npm run build` and **Output** `dist`. Save and deploy.
3. Check the `*.pages.dev` URL. It is intentionally `noindex`.

   *Alternative without Git:* `npm run build && npx wrangler pages deploy dist --project-name janardhan-stores`.

### Updating the live site

Every push to `main` rebuilds and publishes automatically (about 1–2 minutes):

```
npm run build          # check it builds locally
git add -A && git commit -m "Update catalogue" && git push
```

### Custom domain `shop.myconnect.sbs`

1. Pages project → **Custom domains** → *Set up a custom domain* → `shop.myconnect.sbs`.
2. If `myconnect.sbs` is on Cloudflare DNS, Cloudflare creates the `CNAME shop → <project>.pages.dev` record for you. Otherwise, add that CNAME at your DNS provider.
3. Wait for the certificate to become *Active*, then open `https://shop.myconnect.sbs`.
4. Submit `https://shop.myconnect.sbs/sitemap.xml` in Google Search Console (optional).

## Content rules

* Items are **representative** of what the shop carries — not a live stock list. No cart, ordering, accounts or payments.
* Puja section reflects owner guidance: clay pramidas / neyyi deepam only (no metal plates, vessels, bells or brass lamps); no sacred threads or malas.
* Most product photos were supplied by the shop (`shop-photos/`). The rest are Wikimedia Commons photos (CC0 / Public Domain / CC BY / CC BY-SA). Credits for the Commons photos (author, licence, source) are listed on one overall page, `/credits/`, linked from the footer. Product pages carry no credit lines. Keep that page while any Commons photo is in use. Fonts are OFL (licenses in `public/fonts/`). The logo is the shop's own (`public/brand/`, source in `brand-source/`).
