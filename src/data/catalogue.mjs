/**
 * Janardhan General Stores catalogue (edit it with the local editor: `npm run editor`).
 *
 *   Section › Category › TYPE › PRODUCT
 *   Kirana  › Household Cleaning › Detergent Powder › "Rin Detergent Powder · ½ kg"   (one product = one size on the shelf)
 *
 * catalogue.json   sections:   [{ slug, name, te, title, blurb, blurbTe, theme }]
 *                  categories: [{ section, slug, name, te, blurb, products: [type] }]      (kept as "products" for the editor)
 *                  type:       { slug, name, te, aliases[], desc, q?, price?, priceTe?, caution?, cautionTe?, photo? }
 *                    q – words used by scripts/fetch-images.mjs to find a stock photo      photo – reuse another type's photos
 *                    price – a price NOTE for the whole type ("₹30 – ₹45, depending on size")
 *                    alsoIn – other category slugs where the type is ALSO shown (e.g. Ghee also in Puja › Deepam & Oil).
 *                             It keeps one page (in its own category); it is listed and searchable in the others too.
 * brands.json      brands:     [{ id, name, te? }]
 * products.json    products:   [{ id, type, brand?, name, te?, size, loose?, unit?, quick?[], price?, desc?, aliases?[], photos?[], off? }]
 *                    size  – "½ kg packet", "₹10 sachet", "Small" …    loose – bought loose by weight (from 250 g)
 *                    unit  – count word when there is no size ("bar", "piece")    quick – quick-pick amounts (grams if loose)
 *                    photos – names of files in public/img/products/<name>.webp (first = main)    off – out of stock (shown, Add disabled)
 *                    hide – not on the website at all    tag – small label on the card ("New", "Popular" …)    star – shown on the home page
 *                    kit – a puja kit: [{ id: <product id>, a: amount (count, or grams when that product is loose) }]
 *   Products with the same type + brand + name are the SIZES of one product line (shown together on the product page).
 */
import { readFileSync } from 'node:fs'

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'))
const data = read('./catalogue.json')
export const brands = read('./brands.json').brands
export const brandById = new Map(brands.map((b) => [b.id, b]))
const allSkus = read('./products.json').products

export const sections = data.sections
export const allTypeSlugs = new Set(data.categories.flatMap((c) => c.products.map((p) => p.slug)))

/** Products on the website (out-of-stock ones too: their Add button is disabled), with their brand name. Hidden ones are left out. */
export const skus = allSkus
  .filter((p) => allTypeSlugs.has(p.type) && !p.hide)
  .map((p) => ({ ...p, brandName: p.brand ? brandById.get(p.brand)?.name || '' : '' }))
const byType = new Map()
for (const p of skus) { if (!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push(p) }
export const skuById = new Map(skus.map((p) => [p.id, p]))
/** Products of a type. */
export const skusOf = (typeSlug) => byType.get(typeSlug) || []

// Types without any in-stock product are left out of the website; so are empty categories.
export const categories = data.categories
  .map((c) => ({ ...c, products: c.products.filter((t) => skusOf(t.slug).length) }))
  .filter((c) => c.products.length)

/** Every visible TYPE (called "products" for historical reasons), with its category and section. */
export const products = categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.slug, section: c.section })))

/** Types from other categories that are also shown in this one (alsoIn). */
export function extrasOf(catSlug) {
  return products.filter((t) => t.category !== catSlug && (t.alsoIn || []).includes(catSlug))
}
/** Every section a type is shown in: its own, plus those of its alsoIn categories. */
export function sectionsOfType(t) {
  return [...new Set([t.section, ...(t.alsoIn || []).map((s) => categories.find((c) => c.slug === s)?.section).filter(Boolean)])]
}
export function sectionOf(slug) {
  return sections.find((s) => s.slug === slug)
}
export function categoriesOf(sectionSlug) {
  return categories.filter((c) => c.section === sectionSlug)
}
export function categoryOf(slug) {
  return categories.find((c) => c.slug === slug)
}
