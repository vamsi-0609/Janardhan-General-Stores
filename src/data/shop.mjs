/**
 * Confirmed shop details (Janardhan General Stores and Puja Samagri). This is the single place to edit shop contact information.
 * Everything on the site (header, footer, Visit, Contact, structured data) reads from here.
 */
export const shop = {
  name: 'Janardhan General Stores',
  fullName: 'Janardhan General Stores and Puja Samagri',
  shortName: 'Janardhan',
  nameTe: 'జనార్దన్ జనరల్ స్టోర్స్',
  fullNameTe: 'జనార్దన్ జనరల్ స్టోర్స్ & పూజా సామగ్రి',
  tagline: 'Kirana & Puja Samagri',
  taglineTe: 'కిరాణా & పూజా సామగ్రి',

  address: {
    lines: ['Main Road, Near Sathya Show Room', 'Rajampet – 516115'],
    linesTe: ['మెయిన్ రోడ్, సత్య షోరూమ్ దగ్గర', 'రాజంపేట – 516115'],
    street: 'Main Road, Near Sathya Show Room',
    locality: 'Rajampet',
    region: 'Andhra Pradesh',
    postalCode: '516115',
    country: 'IN',
  },

  phoneDisplay: '70938 50218',
  phoneE164: '+917093850218',
  whatsappNumber: '917093850218',
  email: 'vamsi8202@gmail.com',

  hours: {
    // Every day, 06:00–22:00 (IST). Used for display, structured data and the "open now" badge.
    open: 6,
    close: 22,
    label: 'Every day, 6:00 AM – 10:00 PM',
    labelTe: 'ప్రతిరోజూ, ఉదయం 6:00 – రాత్రి 10:00',
  },

  mapsUrl: 'https://maps.app.goo.gl/sxt2WXo9wP9ZxnJ57?g_st=ac',
}

export const telHref = `tel:${shop.phoneE164}`
export const mailHref = `mailto:${shop.email}`

/** WhatsApp click-to-chat link with an optional pre-filled message. */
export function whatsappHref(message) {
  const base = `https://wa.me/${shop.whatsappNumber}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
