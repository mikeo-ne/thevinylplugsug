/**
 * Single source of truth for the business contact details.
 *
 * Every WhatsApp / mailto link in the UI is built here so a change is one edit,
 * not a hunt through six components. Server-side values live in
 * `server/config.js`; keep the two in step (the API exposes them via /api/config,
 * but the landing page renders its links before that request resolves).
 */
export const CONTACT = {
  email: '7hmusicgroupug@gmail.com',
  phone: '+256 768 261 003',
  /** Digits only, for wa.me links. */
  whatsappNumber: '256768261003',
  location: 'Kampala, Uganda',
  hours: 'Mon–Sat · 09:00–19:00 EAT',
} as const;

/** `wa.me` deep link, optionally with a prefilled message. */
export const whatsappUrl = (message?: string) =>
  message ? `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(message)}` : `https://wa.me/${CONTACT.whatsappNumber}`;

/** `tel:` link that works on phones without exposing the display formatting. */
export const telUrl = `tel:+${CONTACT.whatsappNumber}`;

/** mailto link, optionally with subject and body. */
export const mailtoUrl = (subject?: string, body?: string) => {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${CONTACT.email}${query ? `?${query}` : ''}`;
};
