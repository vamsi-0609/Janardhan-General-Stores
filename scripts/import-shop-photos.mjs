/**
 * Use photos supplied by the shop instead of stock photos.
 *
 *   1. Save the photo as  static-site/shop-photos/<product-slug>.jpg  (also .jpeg / .png / .webp). The slug is the
 *      last part of the product's URL, e.g. /kirana/personal-care/bath-soap/  →  shop-photos/bath-soap.jpg
 *   2. Run:  npm run shop-photos   then   npm run build
 *
 * Plain borders are trimmed. Near-square photos are cropped to a square; tall or wide pack shots are fitted
 * whole onto a matching background so labels are never cut off. Output is WebP (640px + 320px thumb).
 * shop-photos/ itself is NOT deployed — only the processed files in public/img/products/ are.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { products } from '../src/data/catalogue.mjs'
import { shop } from '../src/data/shop.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const inDir = join(root, 'shop-photos')
const outDir = join(root, 'public', 'img', 'products')
const creditsFile = join(root, 'src', 'data', 'image-credits.json')
await mkdir(inDir, { recursive: true })
await mkdir(join(outDir, 'thumb'), { recursive: true })

async function squareOf(file, size) {
  let buf = await sharp(file).rotate().flatten({ background: "#ffffff" }).png().toBuffer()
  // Is the photo on a plain white/near-white background? Sample a thin frame around the edges.
  const { data: tiny, info } = await sharp(buf).resize(24, 24, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true })
  let edge = 0, cnt = 0
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if ((x < 2 || x > 21) && (y < 2 || y > 21)) {
    const i = (y * 24 + x) * info.channels; if (Math.min(tiny[i], tiny[i + 1], tiny[i + 2]) > 232) edge++; cnt++
  }
  const whiteBg = edge / cnt > 0.55
  try { buf = await sharp(buf).trim({ threshold: 18 }).png().toBuffer() } catch { /* nothing to trim */ }
  const { width, height } = await sharp(buf).metadata()
  const ratio = width / height
  if (ratio > 0.82 && ratio < 1.22) return sharp(buf).resize(size, size, { fit: "cover", position: sharp.strategy.attention })
  // Tall/wide: show the whole photo on a soft, blurred backdrop made from the same photo.
  if (whiteBg) {
    const inner = Math.round(size * 0.9)
    const fitted = await sharp(buf).resize(inner, inner, { fit: "inside" }).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } }).composite([{ input: fitted, gravity: "center" }])
  }
  const backdrop = await sharp(buf).resize(size, size, { fit: "cover" }).blur(28).modulate({ brightness: 1.08 }).png().toBuffer()
  const inner = Math.round(size * 0.92)
  const fitted = await sharp(buf).resize(inner, inner, { fit: "inside" }).png().toBuffer()
  return sharp(backdrop).composite([{ input: fitted, gravity: "center" }])
}

const slugs = new Set(products.map((p) => p.slug))
const credits = JSON.parse(await readFile(creditsFile, 'utf8'))
let n = 0
for (const f of await readdir(inDir)) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue
  const slug = basename(f, extname(f)).toLowerCase()
  if (!slugs.has(slug)) { console.log(`✗ ${f}: no product with slug "${slug}"`); continue }
  const file = join(inDir, f)
  await (await squareOf(file, 640)).webp({ quality: 82 }).toFile(join(outDir, `${slug}.webp`))
  await (await squareOf(file, 320)).webp({ quality: 78 }).toFile(join(outDir, 'thumb', `${slug}.webp`))
  credits[slug] = { own: true, file: f, author: shop.fullName, license: 'Supplied by the shop', licenseUrl: '', source: '' }
  console.log(`✓ ${slug}`)
  n++
}
// Drop credits for products that no longer exist.
for (const k of Object.keys(credits)) if (!slugs.has(k)) delete credits[k]
await writeFile(creditsFile, JSON.stringify(credits, null, 2) + '\n')
console.log(n ? `\n${n} shop photo(s) imported. Now run: npm run build` : `No photos found in ${inDir}`)
