/**
 * Use photos supplied by the shop instead of stock photos. (The local editor, `npm run admin`, does this for you.)
 *
 *   1. Save the photo as  static-site/shop-photos/<product-slug>.jpg  (also .jpeg / .png / .webp). The slug is the
 *      last part of the product's URL, e.g. /kirana/personal-care/bath-soap/  →  shop-photos/bath-soap.jpg
 *      Extra photos for the same product: bath-soap-2.jpg, bath-soap-3.jpg …
 *   2. Run:  npm run shop-photos   then   npm run build
 *
 * shop-photos/ itself is NOT deployed — only the processed files in public/img/products/ are.
 */
import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { products } from '../src/data/catalogue.mjs'
import { readFileSync } from 'node:fs'
import { shop } from '../src/data/shop.mjs'
import { srcDir as inDir, outDir, thumbDir, creditsFile, IMAGE_EXT, processPhoto, ownCredit, readCrops, validCrop } from './lib/photos.mjs'

await mkdir(inDir, { recursive: true })
await mkdir(thumbDir, { recursive: true })

const raw = JSON.parse(readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'))
const types = raw.categories.flatMap((c) => c.products)
const slugs = new Set([...products.map((p) => p.slug), ...types.map((p) => p.slug)])
// Product photos added in the editor (named "p--<product>--<code>")
const itemPhotos = new Set(JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8')).products.flatMap((p) => p.photos || []).filter((n) => n.includes('--')))
const credits = JSON.parse(await readFile(creditsFile, 'utf8'))
const crops = await readCrops() // crops chosen in the editor
let n = 0
const extrasWanted = new Set() // "<slug>-<n>" names that have a source photo
for (const f of await readdir(inDir)) {
  if (!IMAGE_EXT.test(f)) continue
  const name = basename(f, extname(f)).toLowerCase()
  if (itemPhotos.has(name)) { await processPhoto(join(inDir, f), name, validCrop(crops[name])); console.log(`✓ ${name}  (product photo)`); n++; continue }
  // Extra photos: <slug>-2.jpg, <slug>-3.jpg … (shown in the product page gallery after the main photo).
  const extra = name.match(/^(.+)-(\d{1,2})$/)
  const slug = slugs.has(name) ? name : extra && slugs.has(extra[1]) ? extra[1] : null
  if (!slug) { console.log(`✗ ${f}: no product with slug "${name}"${extra ? ` or "${extra[1]}"` : ''}`); continue }
  const isExtra = name !== slug
  if (isExtra && Number(extra[2]) < 2) { console.log(`✗ ${f}: extra photos start at -2 (the main photo is ${slug}.jpg)`); continue }
  await processPhoto(join(inDir, f), name, validCrop(crops[name]))
  if (isExtra) extrasWanted.add(name)
  else credits[slug] = ownCredit(f, shop.fullName)
  console.log(`✓ ${name}${isExtra ? '  (extra photo)' : ''}${crops[name] ? '  (custom crop)' : ''}`)
  n++
}
// Remove processed extra photos whose source photo was deleted from shop-photos/.
for (const dir of [outDir, thumbDir]) {
  for (const f of await readdir(dir)) {
    const m = f.match(/^(.+)-(\d{1,2})\.webp$/)
    if (m && slugs.has(m[1]) && !extrasWanted.has(`${m[1]}-${m[2]}`)) { await unlink(join(dir, f)); console.log(`– removed old extra photo ${f}`) }
  }
}
// Drop credits for products that no longer exist.
for (const k of Object.keys(credits)) if (!slugs.has(k)) delete credits[k]
await writeFile(creditsFile, JSON.stringify(credits, null, 2) + '\n')
console.log(n ? `\n${n} shop photo(s) imported. Now run: npm run build` : `No photos found in ${inDir}`)
