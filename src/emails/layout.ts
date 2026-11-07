// Gabarit HTML commun a tous les emails transactionnels.
//
// Contraintes des clients mail (Outlook, Gmail, Apple Mail) : pas de flexbox, pas de grid,
// pas de <style> externe fiable -> tout est en tableaux et en styles inline. Fond clair
// volontaire (un fond sombre est tronque ou inverse par plusieurs clients), avec le bandeau
// de marque RaceUp en tete pour l'identite visuelle.

export type EmailLang = 'fr' | 'en';

const BRAND = {
  night: '#0a0a1f', // fond du bandeau (design system Palantir)
  accent: '#4169e1',
  text: '#1a1a2e',
  muted: '#6b6b80',
  border: '#e3e3ec',
  surface: '#f6f6fa',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Echappement HTML : toutes les donnees injectees dans un email viennent de tiers
// (nom du client, libelle de projet, message de ticket) -> jamais concatenees brutes.
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type Row = { label: string; value: string; strong?: boolean };

// Tableau recapitulatif (details d'une commande, d'un ticket...).
export function table(rows: Row[]): string {
  const cells = rows
    .filter((r) => r.value !== '' && r.value != null)
    .map(
      (r) => `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:13px;white-space:nowrap;vertical-align:top;">${esc(r.label)}</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:14px;${r.strong ? 'font-weight:700;' : ''}">${esc(r.value)}</td>
          </tr>`
    )
    .join('');

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:6px;border-collapse:separate;overflow:hidden;background:#ffffff;margin:0 0 24px;">
        ${cells}
      </table>`;
}

// Bouton d'action principal. `td` colore + lien : rendu correct jusqu'a Outlook 2016.
export function button(label: string, url: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td align="center" bgcolor="${BRAND.accent}" style="border-radius:6px;">
            <a href="${esc(url)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(label)}</a>
          </td>
        </tr>
      </table>`;
}

// Encadre d'avertissement (securite, echec de paiement).
export function callout(text: string, tone: 'info' | 'warning' = 'info'): string {
  const color = tone === 'warning' ? '#b4542b' : BRAND.muted;
  const bg = tone === 'warning' ? '#fff6f1' : BRAND.surface;
  const border = tone === 'warning' ? '#f0c8b4' : BRAND.border;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding:14px 16px;background:${bg};border:1px solid ${border};border-left:3px solid ${color};border-radius:4px;color:${color};font-size:13px;line-height:1.6;">${text}</td>
        </tr>
      </table>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 18px;color:${BRAND.text};font-size:15px;line-height:1.65;">${text}</p>`;
}

// Lien de secours : certains clients mail n'ouvrent pas les boutons (texte brut, lecteurs
// d'ecran) -> l'URL complete est toujours rappelee sous le bouton.
export function fallbackLink(label: string, url: string): string {
  return `<p style="margin:0 0 18px;color:${BRAND.muted};font-size:12px;line-height:1.6;">${esc(label)}<br><a href="${esc(url)}" style="color:${BRAND.accent};word-break:break-all;">${esc(url)}</a></p>`;
}

const FOOTER = {
  fr: {
    tagline: 'Services digitaux — développement, design et IA',
    auto: "Cet email a été envoyé automatiquement, mais vous pouvez y répondre directement : nous le lisons.",
    legal: 'RaceUp — SIRET 999 028 780 00016',
  },
  en: {
    tagline: 'Digital services — development, design and AI',
    auto: 'This email was sent automatically, but you can reply to it directly: we do read replies.',
    legal: 'RaceUp — SIRET 999 028 780 00016',
  },
} as const;

export type RenderOptions = {
  lang: EmailLang;
  title: string; // titre affiche en haut du corps
  preheader: string; // texte d'apercu dans la boite de reception
  body: string; // HTML deja echappe
  siteUrl: string;
};

export function renderEmail(options: RenderOptions): string {
  const f = FOOTER[options.lang];
  const site = options.siteUrl.replace(/\/+$/, '');

  return `<!doctype html>
<html lang="${options.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <!-- Apercu dans la liste des messages, invisible dans le corps -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(options.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${BRAND.border};">

          <!-- Bandeau de marque -->
          <tr>
            <td style="background:${BRAND.night};padding:22px 32px;">
              <a href="${esc(site)}" style="color:#ffffff;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:0.04em;text-decoration:none;">RaceUp</a>
              <div style="color:#8f8fb0;font-family:${FONT};font-size:11px;margin-top:3px;letter-spacing:0.02em;">${esc(f.tagline)}</div>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:32px;font-family:${FONT};">
              <h1 style="margin:0 0 20px;color:${BRAND.text};font-size:21px;line-height:1.35;font-weight:700;">${esc(options.title)}</h1>
              ${options.body}
            </td>
          </tr>

          <!-- Pied -->
          <tr>
            <td style="padding:20px 32px 26px;background:${BRAND.surface};border-top:1px solid ${BRAND.border};font-family:${FONT};">
              <p style="margin:0 0 8px;color:${BRAND.muted};font-size:12px;line-height:1.6;">${esc(f.auto)}</p>
              <p style="margin:0;color:#9a9ab0;font-size:11px;line-height:1.6;">
                ${esc(f.legal)} ·
                <a href="${esc(site)}" style="color:${BRAND.muted};text-decoration:underline;">${esc(site.replace(/^https?:\/\//, ''))}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------- Version texte brut ----------
// Obligatoire : un email sans partie texte est penalise par les filtres anti-spam, et
// certains clients (montres, lecteurs d'ecran) n'affichent que celle-ci.

export function textBlock(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).join('\n');
}

export function textRows(rows: Row[]): string {
  return rows
    .filter((r) => r.value !== '' && r.value != null)
    .map((r) => `  ${r.label} : ${r.value}`)
    .join('\n');
}
