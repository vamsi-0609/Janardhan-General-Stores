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
| `src/data/catalogue.json` | Sections, categories and **types** of products (e.g. Detergent Powder): name, Telugu name, other names, description, photo |
| `src/data/brands.json` | **Brands** (Tide, Rin, Colgate …). `logo: true` = has an optional logo in `public/img/brands/<id>.webp` (added in the editor) |
| `src/data/products.json` | **Products**: one product = one item in one size, e.g. “Rin Detergent Powder · ½ kg”. Type, brand, name, size, price, photos, other names, in stock. Loose items have `loose`, `min` (starts from, grams) and `step` (each + adds, grams). Optional: `tag` (label on the card), `star` (home page “Popular at the shop”), `hide` (not on the website), `kit` (puja kit contents: `[{ id, a }]`, amount = count or grams). |
| `src/data/catalogue.mjs` | Reads the three files above for the build |
| `src/data/image-credits.json` | Internal record of where each product photo came from (not shown on the site) |
| `src/styles.css`, `src/client/*.js` | Styling, small progressive enhancements, client-side search |
| `scripts/build.mjs` | Static site generator → `dist/` |
| `public/` | Copied as-is: product photos, logo, fonts, `_headers`, `_redirects` |
| `scripts/fetch-images.mjs`, `image-candidates.mjs`, `image-overrides.mjs`, `make-thumbs.mjs` | Photo sourcing pipeline (maintenance only) |

### Catalogue editor (local only)

Double-click **`Open Editor.cmd`** (or run `npm run editor`). It opens http://localhost:4300, where you can add and edit products (names, Telugu names, also-known-as names, brands, sizes, price, notes, multiple photos), categories and festivals (items, messages, dates). Every save rebuilds the site, and **View in browser** opens the preview at http://localhost:4173. The editor only runs on this computer and is never deployed. Data is stored in `src/data/catalogue.json` and `src/data/festivals.json`. Nothing goes live until the changes are committed and pushed.

### Festival recommendations (home page)

The top of the home page shows the next festival automatically, using today's date in India: items to buy for a few days before it, then a greeting on the festival day. Festivals, dates, greetings and items are in `src/data/festivals.mjs`. **Add next year's dates there once a year** (the build warns when fewer than 120 days of dates are left). Preview any day with `/?fest-date=YYYY-MM-DD`.

### My list (WhatsApp list)

Every product card has **Add**, then **− n +**. Loose items open a weight panel (from the product's “starts from”, in fixed steps). The list (`/list/`) asks for the customer's name and pickup time (pickup only, no delivery), can ask for an estimated total, and opens WhatsApp with the whole list typed in. The list is stored only in the customer's browser, grouped as Kirana, Puja Samagri and Puja kits. When it is sent, a copy is kept so the customer can repeat the last list. Search understands sizes: “rin 1 kg”, “tide ₹10”, “అర కిలో కంది పప్పు”.

### Shop reply (bill)

The customer's WhatsApp list ends with a plain **Shop code** (no link, so the shop never has to tap links in customer messages). The shop copies the message and pastes it on `/reply/` (also a shortcut on the installed app's icon). The list opens as a bill: ✓ Have / ✗ No per item, a price box (number keypad) for each available item, an automatic total, **Send reply on WhatsApp** (straight to the customer's number) and **Print / Save as PDF**. Marks and prices are kept on that phone, so a list can be reopened and corrected. The code is checked strictly and everything is shown as plain text.

### Puja kits

A kit is a product with a `kit` list of other products and amounts (edit it in the editor: product → More ▾ → Contents of this kit). Its page shows **What's inside**: customers untick items, change sizes and amounts, then add the kit in one tap. In My list and on WhatsApp the items are listed under the kit's name. The home page and the Puja Samagri page show a “Ready puja kits” row.

### Shop QR poster and app (PWA)

* **About page → Shop QR code:** a printable poster (one A4 page via *Print poster*) and a *Download QR image* button. The QR (logo in the middle, error correction H) is `public/brand/qr-site.svg` / `.png`. App icons are in `public/icons/`. Both are made by `npm run brand-assets` and committed. Re-run it only if the logo or web address changes (`QR_URL=… npm run brand-assets`).
* **App:** the site can be installed on Android, iPhone and Windows/Mac. See *About → Janardhan Stores app*, the footer link *Get the app*, or the browser's own install option. The build writes `dist/site.webmanifest` and `dist/sw.js`. Pages are network first, so customers always see the latest catalogue when online and saved copies when offline. Photos, CSS and JS are cache first. A page never opened before shows `/offline/` when there's no internet. Each publish creates a new service worker version, so installed apps update automatically.

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
