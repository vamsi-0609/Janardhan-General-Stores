/**
 * Janardhan General Stores catalogue. The data lives in catalogue.json. Edit it with the local editor
 * (`npm run admin`) or by hand.
 *
 * catalogue.json:
 *   sections:   [{ slug, name, te, title, blurb, blurbTe, theme }]
 *   categories: [{ section, slug, name, te, blurb, products: [product] }]
 *   product:    { slug, name, te, aliases[], desc, q?, brands?[], sizes?, price?, priceTe?, caution?, cautionTe?, photo?, photoBrands?[] }
 *     q      – search words used only by scripts/fetch-images.mjs to find a Wikimedia Commons photo
 *     photo  – reuse another product's photos (slug), e.g. the same item listed in two sections
 *     photoBrands – which brand each photo shows, in photo order (null = general photo). Set in the editor;
 *              a brand search shows that brand's photo, never another brand's.
 */
import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('./catalogue.json', import.meta.url), 'utf8'))

export const sections = data.sections
// Empty categories (e.g. just created in the editor) are not shown on the website until they have a product.
export const categories = data.categories.filter((c) => c.products.length)

// Derived helpers ---------------------------------------------------------------------------------
export const products = categories.flatMap((c) => c.products.map((p) => ({ ...p, category: c.slug, section: c.section })))

export function sectionOf(slug) {
  return sections.find((s) => s.slug === slug)
}
export function categoriesOf(sectionSlug) {
  return categories.filter((c) => c.section === sectionSlug)
}
export function categoryOf(slug) {
  return categories.find((c) => c.slug === slug)
}
