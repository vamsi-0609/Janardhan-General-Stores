/**
 * Festival recommendations shown at the top of the home page. The data lives in festivals.json. Edit it with
 * the local editor (`npm run admin`) or by hand.
 *
 * The browser picks what to show from TODAY's date in India (IST), so the live site changes by itself:
 *   • `lead` days before the first festival day → "Coming up" with the items to buy
 *   • on the festival day(s)                       → a greeting in English and Telugu (items stay listed)
 *   • at other times                               → nothing is shown
 * Preview any date: /?fest-date=2027-01-14
 *
 * festival: { id, name, te, colors: [dark, light], lead, season?, note?,
 *             before: { title, titleTe, text }, day: { title, titleTe, text },
 *             items: [product slugs], dates: [ [ [YYYY-MM-DD, day name, Telugu day name, special greeting?], … ], … ] }
 *   Each entry in `dates` is one year's occurrence. For `season: true` (Karthika Masam) the first and last rows are
 *   the start and end of the month and the rows in between are special days (e.g. Karthika Pournami).
 * EVERY YEAR: add next year's dates. The build warns when fewer than 120 days of dates are left.
 */
import { readFileSync } from 'node:fs'

export const festivals = JSON.parse(readFileSync(new URL('./festivals.json', import.meta.url), 'utf8')).festivals
