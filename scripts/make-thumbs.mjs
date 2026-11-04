/** Creates 320px grid thumbnails from the 640px product photos (run after fetch-images). */
import { readdir, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'products')
await mkdir(join(dir, 'thumb'), { recursive: true })
for (const f of (await readdir(dir)).filter((f) => f.endsWith('.webp'))) {
  await sharp(join(dir, f)).resize(320, 320).webp({ quality: 72, effort: 5 }).toFile(join(dir, 'thumb', f))
}
console.log('thumbnails done')
