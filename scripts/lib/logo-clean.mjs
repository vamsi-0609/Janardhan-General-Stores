/**
 * Brand logos: make a plain light background (white / off-white / light grey) see-through, so a logo sits cleanly
 * on any page colour. Only background that touches the edges is removed (flood fill from the border), so white
 * letters or shapes inside the logo stay. Logos without a plain light background (e.g. a coloured edge) are left as
 * they are. Returns a WebP buffer, trimmed to the logo.
 */
import sharp from 'sharp'

export async function cleanLogo(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const at = (x, y) => (y * w + x) * 4
  const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => [...data.subarray(at(x, y), at(x, y) + 4)])
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  // background = the corner colour most other corners agree with; must be light and opaque
  let bg = null
  for (const c of corners) if (c[3] > 250 && c[0] + c[1] + c[2] > 3 * 205 && corners.filter((d) => d[3] > 250 && dist(c, d) < 24).length >= 3) { bg = c; break }
  if (!bg) return sharp(input).webp({ quality: 92, alphaQuality: 100 }).toBuffer()
  const TOL = 26, EDGE = TOL * 1.9
  const seen = new Uint8Array(w * h)
  const queue = []
  const push = (x, y) => { const k = y * w + x; if (seen[k]) return; seen[k] = 1; queue.push(k) }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (queue.length) {
    const k = queue.pop()
    const i = k * 4
    const d = dist([data[i], data[i + 1], data[i + 2]], bg)
    if (data[i + 3] === 0 || d >= EDGE) continue // logo starts here
    // soft edge: fully clear on the background, fading in towards the logo
    data[i + 3] = Math.min(data[i + 3], d < TOL ? 0 : Math.round(255 * (d - TOL) / (EDGE - TOL)))
    const x = k % w, y = (k / w) | 0
    if (d < TOL) { if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1) }
  }
  // remove tiny stray specks left outside the logo (pieces smaller than 0.3 % of the picture)
  const label = new Int32Array(w * h).fill(-1)
  const minArea = Math.max(12, Math.round(w * h * 0.003))
  for (let s = 0; s < w * h; s++) {
    if (label[s] !== -1 || data[s * 4 + 3] < 40) continue
    const part = [s]; label[s] = s
    for (let q = 0; q < part.length; q++) {
      const k = part[q], x = k % w, y = (k / w) | 0
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (label[n] === -1 && data[n * 4 + 3] >= 40) { label[n] = s; part.push(n) }
      }
    }
    if (part.length < minArea) for (const k of part) data[k * 4 + 3] = 0
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).webp({ quality: 92, alphaQuality: 100 }).toBuffer()
}
