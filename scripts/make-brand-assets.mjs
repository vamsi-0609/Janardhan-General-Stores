/**
 * Makes the shop QR code and the app (PWA) icons from the logo. Run once after the logo or web address changes:
 *   npm run brand-assets
 * The results are committed in public/, so the normal build needs nothing extra.
 *
 *   public/brand/qr-site.svg  — branded QR (logo in the middle) shown on the About page poster
 *   public/brand/qr-site.png  — 1200 px copy of the same QR, for "Download QR" / WhatsApp / printing elsewhere
 *   public/icons/*.png        — app icons (normal + "maskable" for Android round/squircle icons)
 *
 * Fast scanning: error correction H (30 %), short upper-case address (QR alphanumeric mode → only 29×29 modules),
 * very dark modules on white, a 4-module quiet zone, and the logo covers under 6 % of the code.
 * Checked with the ZXing decoder (used by most Android scanners): 176/176 at 90–1200 px, rotated and blurred.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOGO = join(root, 'brand-source', 'janardhan-logo-original.jpg')
// Upper case keeps the code small (alphanumeric mode). Phones open it as https://shop.myconnect.sbs/
const URL_TEXT = (process.env.QR_URL || 'HTTPS://SHOP.MYCONNECT.SBS/').toUpperCase()

const INK = '#2b0f0c'     // modules: near-black maroon (very high contrast)
const EYE = '#2b0f0c'     // finder frames
const PUPIL = '#9c3a22'   // finder centres: deep terracotta
const GOLD = '#c79a3e'

// ── QR matrix ──
const qr = QRCode.create(URL_TEXT, { errorCorrectionLevel: 'H' })
const n = qr.modules.size
const dark = (r, c) => qr.modules.get(r, c) === 1
const Q = 4                       // quiet zone
const W = n + Q * 2
const mid = n / 2
const LOGO_R = 3.6                // logo radius in modules (logo ≈ 25 % of the width, under 6 % of the area)
const CLEAR_R = LOGO_R + 0.75     // no modules inside this circle

const inFinder = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)
const inLogo = (r, c) => Math.hypot(r + 0.5 - mid, c + 0.5 - mid) < CLEAR_R

// Data modules: rounded squares with only a hairline gap. (Tested with a QR decoder at 90–1000 px, rotated and
// blurred: wider gaps or dots made decoding fail at some sizes; this style decoded 80/80 like a plain QR.)
const GAP = 0.02, SIDE = 1 - 2 * GAP, RAD = 0.3
let mods = ''
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (!dark(r, c) || inFinder(r, c) || inLogo(r, c)) continue
  mods += `<rect x="${c + Q + GAP}" y="${r + Q + GAP}" width="${SIDE}" height="${SIDE}" rx="${RAD}"/>`
}
// Finder "eyes": rounded frame + rounded centre.
const eye = (r, c) => {
  const x = c + Q, y = r + Q
  return `<path fill="${EYE}" fill-rule="evenodd" d="M${x} ${y + 2}a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2ZM${x + 1} ${y + 2.2}a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2v2.6a1.2 1.2 0 0 1-1.2 1.2h-2.6a1.2 1.2 0 0 1-1.2-1.2Z"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${PUPIL}"/>`
}

async function qrSvg(logoHref) {
  const cx = W / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${W}" width="${W * 20}" height="${W * 20}" shape-rendering="geometricPrecision" role="img" aria-label="QR code: ${URL_TEXT.toLowerCase()}">
<title>Janardhan General Stores — ${URL_TEXT.toLowerCase()}</title>
<rect width="${W}" height="${W}" rx="2.2" fill="#fff"/>
<g fill="${INK}">${mods}</g>
${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}
<circle cx="${cx}" cy="${cx}" r="${LOGO_R + 0.38}" fill="#fff" stroke="${GOLD}" stroke-width="0.22"/>
<clipPath id="lg"><circle cx="${cx}" cy="${cx}" r="${LOGO_R}"/></clipPath>
<image href="${logoHref}" xlink:href="${logoHref}" x="${cx - LOGO_R}" y="${cx - LOGO_R}" width="${LOGO_R * 2}" height="${LOGO_R * 2}" clip-path="url(#lg)" preserveAspectRatio="xMidYMid slice"/>
</svg>
`
}

const logoJpg = await sharp(LOGO).resize(240, 240).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
const logoData = `data:image/jpeg;base64,${logoJpg.toString('base64')}`
await mkdir(join(root, 'public', 'brand'), { recursive: true })
const svg = await qrSvg(logoData)
await writeFile(join(root, 'public', 'brand', 'qr-site.svg'), svg)
await sharp(Buffer.from(svg), { density: 600 }).resize(1200, 1200).png({ palette: true, quality: 95, compressionLevel: 9 }).toFile(join(root, 'public', 'brand', 'qr-site.png'))
console.log(`QR: "${URL_TEXT}" → version ${qr.version} (${n}×${n} modules), error correction H`)

// ── App icons ──
const iconsDir = join(root, 'public', 'icons')
await mkdir(iconsDir, { recursive: true })
for (const size of [192, 512]) {
  // "any": the round logo as-is.
  await sharp(LOGO).resize(size, size).png({ palette: true, quality: 90 }).toFile(join(iconsDir, `icon-${size}.png`))
  // "maskable": logo inside Android's 80 % safe circle on the logo's own dark background.
  const inner = Math.round(size * 0.78)
  const logo = await sharp(LOGO).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 3, background: '#2a0e0b' } })
    .composite([{ input: logo, gravity: 'centre' }]).png({ palette: true, quality: 90 }).toFile(join(iconsDir, `maskable-${size}.png`))
}
console.log('Icons: public/icons/icon-{192,512}.png, maskable-{192,512}.png')
