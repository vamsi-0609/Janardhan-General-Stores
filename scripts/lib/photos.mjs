/**
 * Shared product-photo processing, used by scripts/import-shop-photos.mjs and the local editor (admin/).
 *
 * Source photos live in shop-photos/ (NOT deployed): <slug>.jpg is the main photo, <slug>-2.jpg, <slug>-3.jpg … are extras.
 * Processed photos live in public/img/products/<name>.webp (640px) and thumb/<name>.webp (320px), which ARE deployed.
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// Don't keep input files open (on Windows an open file cannot be renamed or deleted).
sharp.cache(false)

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const srcDir = join(root, 'shop-photos')
export const outDir = join(root, 'public', 'img', 'products')
export const thumbDir = join(outDir, 'thumb')
export const creditsFile = join(root, 'src', 'data', 'image-credits.json')
export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i

/** Plain borders are trimmed. Near-square photos are cropped square; tall/wide pack shots are fitted whole. */
export async function squareOf(input, size) {
  let buf = await sharp(input).rotate().flatten({ background: '#ffffff' }).png().toBuffer()
  // Is the photo on a plain white/near-white background? Sample the corners.
  const { data: tiny, info } = await sharp(buf).resize(24, 24, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  let edge = 0, cnt = 0
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if ((x < 2 || x > 21) && (y < 2 || y > 21)) {
    const i = (y * 24 + x) * info.channels; if (Math.min(tiny[i], tiny[i + 1], tiny[i + 2]) > 232) edge++; cnt++
  }
  const whiteBg = edge / cnt > 0.55
  try { buf = await sharp(buf).trim({ threshold: 18 }).png().toBuffer() } catch { /* nothing to trim */ }
  const { width, height } = await sharp(buf).metadata()
  const ratio = width / height
  if (ratio > 0.82 && ratio < 1.22) return sharp(buf).resize(size, size, { fit: 'cover', position: sharp.strategy.attention })
  if (whiteBg) {
    const inner = Math.round(size * 0.9)
    const fitted = await sharp(buf).resize(inner, inner, { fit: 'inside' }).png().toBuffer()
    return sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } }).composite([{ input: fitted, gravity: 'center' }])
  }
  // Tall/wide on a busy background: show the whole photo on a soft, blurred backdrop made from the same photo.
  const backdrop = await sharp(buf).resize(size, size, { fit: 'cover' }).blur(28).modulate({ brightness: 1.08 }).png().toBuffer()
  const inner = Math.round(size * 0.92)
  const fitted = await sharp(buf).resize(inner, inner, { fit: 'inside' }).png().toBuffer()
  return sharp(backdrop).composite([{ input: fitted, gravity: 'center' }])
}

/** Upright (EXIF-corrected) and optionally rotated by 90/180/270, on white. */
export async function uprightBuffer(input, rotate = 0) {
  const upright = await sharp(input).rotate().flatten({ background: '#ffffff' }).png().toBuffer()
  return rotate ? sharp(upright).rotate(rotate).png().toBuffer() : upright
}

/**
 * A crop chosen in the editor: { rotate: 0|90|180|270, x, y, s }.
 * Think of a square "stage" whose side is the photo's longer edge, with the photo centred in it (white around it).
 * x, y = top-left of the chosen square and s = its side, all as fractions (0–1) of the stage side.
 * Parts of the square outside the photo are filled white, so you can zoom out to fit a tall pack whole.
 */
export async function croppedOf(input, crop, size) {
  const buf = await uprightBuffer(input, crop.rotate || 0)
  const { width: W, height: H } = await sharp(buf).metadata()
  const S = Math.max(W, H)
  const side = Math.max(8, Math.round(crop.s * S))
  const left = Math.round(crop.x * S - (S - W) / 2)
  const top = Math.round(crop.y * S - (S - H) / 2)
  const pad = { left: Math.max(0, -left), top: Math.max(0, -top), right: Math.max(0, left + side - W), bottom: Math.max(0, top + side - H) }
  const padded = await sharp(buf).extend({ ...pad, background: '#ffffff' }).png().toBuffer()
  return sharp(padded).extract({ left: left + pad.left, top: top + pad.top, width: side, height: side }).resize(size, size)
}

export function validCrop(c) {
  if (!c || typeof c !== 'object') return null
  const rotate = [0, 90, 180, 270].includes(Number(c.rotate)) ? Number(c.rotate) : 0
  const n = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : null)
  const s = n(c.s, 0.03, 1), x = n(c.x, 0, 1), y = n(c.y, 0, 1)
  if (s == null || x == null || y == null) return null
  return { rotate, x: Math.min(x, 1 - s), y: Math.min(y, 1 - s), s }
}

// Crop settings are kept next to the source photos so `npm run shop-photos` re-applies them.
export const cropsFile = join(srcDir, 'crops.json')
export async function readCrops() {
  const { readFile } = await import('node:fs/promises')
  try { return JSON.parse(await readFile(cropsFile, 'utf8')) } catch { return {} }
}
export async function writeCrops(crops) {
  const { writeFile } = await import('node:fs/promises')
  const sorted = Object.fromEntries(Object.entries(crops).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(cropsFile, JSON.stringify(sorted, null, 2) + '\n')
}

/** Write <name>.webp and thumb/<name>.webp from a source file path or buffer (with an optional editor crop). */
export async function processPhoto(input, name, crop) {
  const make = (size) => (crop ? croppedOf(input, crop, size) : squareOf(input, size))
  await (await make(640)).webp({ quality: 82 }).toFile(join(outDir, `${name}.webp`))
  await (await make(320)).webp({ quality: 78 }).toFile(join(thumbDir, `${name}.webp`))
}

export const ownCredit = (file, shopName) => ({ own: true, file, author: shopName, license: 'Supplied by the shop', licenseUrl: '', source: '' })
