// Origines du site officiel. Une seule liste pour le CORS et pour les URLs de retour Stripe.
const SITE_ORIGINS = [
  'https://raceup.com',
  'https://www.raceup.com',
  'https://race-up.net',
  'https://www.race-up.net',
];

const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

// Previews du projet Cloudflare Pages de RaceUp uniquement (raceup-com.pages.dev et ses
// sous-domaines de preview) — et non n'importe quel site *.pages.dev.
const PAGES_PREVIEW_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?raceup-com\.pages\.dev$/;

// CORS : origines officielles + previews Pages RaceUp + localhost (dev).
export function isCorsAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (SITE_ORIGINS.includes(origin)) return true;
  if (PAGES_PREVIEW_ORIGIN.test(origin)) return true;
  if (LOCALHOST_ORIGIN.test(origin)) return true;
  return false;
}

// URL de retour apres Stripe Checkout : on renvoie le client sur l'origine d'ou il vient,
// uniquement si elle est officielle (ou localhost en dev). Sinon : SITE_URL.
// Plus strict que le CORS (pas de *.pages.dev) pour ne jamais rediriger vers un site tiers.
export function resolveSiteOrigin(origin: string | undefined, fallback: string): string {
  if (origin && (SITE_ORIGINS.includes(origin) || LOCALHOST_ORIGIN.test(origin))) return origin;
  return fallback.replace(/\/+$/, '');
}
