import {
  button,
  callout,
  esc,
  fallbackLink,
  paragraph,
  renderEmail,
  table,
  textBlock,
  textRows,
  type EmailLang,
  type Row,
} from './layout';

// Emails lies au compte : bienvenue, verification d'adresse, mot de passe oublie et
// alertes de securite. Tous bilingues (fr/en) sauf les notifications internes a RaceUp,
// qui restent en francais.

export type Email = { subject: string; html: string; text: string };

const T = {
  fr: {
    hello: (name: string) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : rien ne sera modifié.",
    linkFallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    expires: (h: string) => `Ce lien est valable ${h} et ne peut être utilisé qu'une seule fois.`,
    securityContact: 'Si vous pensez que votre compte est compromis, répondez immédiatement à cet email.',
  },
  en: {
    hello: (name: string) => (name ? `Hi ${name},` : 'Hello,'),
    ignore: "If you didn't request this, simply ignore this email: nothing will change.",
    linkFallback: "Button not working? Copy this link into your browser:",
    expires: (h: string) => `This link is valid for ${h} and can only be used once.`,
    securityContact: 'If you believe your account has been compromised, reply to this email right away.',
  },
} as const;

function dur(lang: EmailLang, hours: number): string {
  if (hours < 1) {
    const m = Math.round(hours * 60);
    return lang === 'fr' ? `${m} minutes` : `${m} minutes`;
  }
  if (hours === 1) return lang === 'fr' ? '1 heure' : '1 hour';
  return lang === 'fr' ? `${hours} heures` : `${hours} hours`;
}

// ---------- 1. Bienvenue + verification d'adresse ----------

export function welcomeVerify(p: {
  lang: EmailLang;
  firstName: string;
  verifyUrl: string;
  siteUrl: string;
  expiresHours: number;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Bienvenue chez RaceUp — confirmez votre adresse' : 'Welcome to RaceUp — confirm your email';
  const title = p.lang === 'fr' ? 'Bienvenue chez RaceUp' : 'Welcome to RaceUp';

  const intro =
    p.lang === 'fr'
      ? 'Votre compte est créé et déjà utilisable. Il ne reste qu’une étape : confirmer votre adresse email. Elle nous sert à vous envoyer vos factures, l’avancement de vos projets et les réponses du support.'
      : 'Your account is created and ready to use. One step remains: confirming your email address. We use it to send your invoices, project updates and support replies.';

  const cta = p.lang === 'fr' ? 'Confirmer mon adresse' : 'Confirm my email';

  const next =
    p.lang === 'fr'
      ? 'Ensuite, vous pourrez suivre vos projets, échanger avec nous par tickets, récupérer vos livrables et régler vos échéances depuis votre espace client.'
      : 'After that, you can follow your projects, talk to us through tickets, download your deliverables and pay your milestones from your client area.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title,
      preheader: p.lang === 'fr' ? 'Une étape pour activer toutes les fonctionnalités.' : 'One step to unlock everything.',
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        button(cta, p.verifyUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.expires(dur(p.lang, p.expiresHours)))}</span>`),
        paragraph(esc(next)),
        fallbackLink(t.linkFallback, p.verifyUrl),
      ].join('\n'),
    }),
    text: textBlock([
      t.hello(p.firstName),
      '',
      intro,
      '',
      `${cta} : ${p.verifyUrl}`,
      '',
      t.expires(dur(p.lang, p.expiresHours)),
      '',
      next,
    ]),
  };
}

// ---------- 2. Renvoi du lien de verification ----------

export function emailVerification(p: {
  lang: EmailLang;
  firstName: string;
  verifyUrl: string;
  siteUrl: string;
  expiresHours: number;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Confirmez votre adresse email' : 'Confirm your email address';
  const cta = p.lang === 'fr' ? 'Confirmer mon adresse' : 'Confirm my email';
  const intro =
    p.lang === 'fr'
      ? 'Voici un nouveau lien pour confirmer votre adresse email. Le précédent n’est plus valable.'
      : 'Here is a new link to confirm your email address. The previous one is no longer valid.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        button(cta, p.verifyUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.expires(dur(p.lang, p.expiresHours)))}</span>`),
        fallbackLink(t.linkFallback, p.verifyUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', `${cta} : ${p.verifyUrl}`, '', t.expires(dur(p.lang, p.expiresHours))]),
  };
}

// ---------- 3. Mot de passe oublie ----------

export function passwordReset(p: {
  lang: EmailLang;
  firstName: string;
  resetUrl: string;
  siteUrl: string;
  expiresHours: number;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Réinitialiser votre mot de passe RaceUp' : 'Reset your RaceUp password';
  const cta = p.lang === 'fr' ? 'Choisir un nouveau mot de passe' : 'Choose a new password';
  const intro =
    p.lang === 'fr'
      ? 'Vous avez demandé à réinitialiser le mot de passe de votre compte RaceUp. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.'
      : 'You asked to reset the password for your RaceUp account. Use the button below to choose a new one.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Réinitialisation du mot de passe' : 'Password reset',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        button(cta, p.resetUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.expires(dur(p.lang, p.expiresHours)))}</span>`),
        callout(esc(t.ignore)),
        fallbackLink(t.linkFallback, p.resetUrl),
      ].join('\n'),
    }),
    text: textBlock([
      t.hello(p.firstName),
      '',
      intro,
      '',
      `${cta} : ${p.resetUrl}`,
      '',
      t.expires(dur(p.lang, p.expiresHours)),
      '',
      t.ignore,
    ]),
  };
}

// ---------- 4. Mot de passe modifie (alerte de securite) ----------

export function passwordChanged(p: {
  lang: EmailLang;
  firstName: string;
  siteUrl: string;
  when: string; // date lisible
  ip: string | null;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Votre mot de passe a été modifié' : 'Your password was changed';

  const rows: Row[] = [
    { label: p.lang === 'fr' ? 'Date' : 'Date', value: p.when },
    ...(p.ip ? [{ label: p.lang === 'fr' ? 'Adresse IP' : 'IP address', value: p.ip }] : []),
  ];

  const intro =
    p.lang === 'fr'
      ? 'Le mot de passe de votre compte RaceUp vient d’être modifié. Toutes vos autres sessions ont été déconnectées.'
      : 'The password for your RaceUp account has just been changed. All your other sessions have been signed out.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        table(rows),
        callout(esc(t.securityContact), 'warning'),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', textRows(rows), '', t.securityContact]),
  };
}

// ---------- 5. Changement d'email : confirmation (vers la NOUVELLE adresse) ----------

export function emailChangeConfirm(p: {
  lang: EmailLang;
  firstName: string;
  newEmail: string;
  confirmUrl: string;
  siteUrl: string;
  expiresHours: number;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Confirmez votre nouvelle adresse email' : 'Confirm your new email address';
  const cta = p.lang === 'fr' ? 'Confirmer cette adresse' : 'Confirm this address';
  const intro =
    p.lang === 'fr'
      ? `Vous avez demandé à utiliser ${p.newEmail} comme nouvelle adresse de connexion à votre compte RaceUp. Confirmez-la pour appliquer le changement.`
      : `You asked to use ${p.newEmail} as the new sign-in address for your RaceUp account. Confirm it to apply the change.`;
  const note =
    p.lang === 'fr'
      ? 'Votre ancienne adresse reste active jusqu’à cette confirmation.'
      : 'Your previous address stays active until you confirm.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: note,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        button(cta, p.confirmUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.expires(dur(p.lang, p.expiresHours)))} ${esc(note)}</span>`),
        callout(esc(t.ignore)),
        fallbackLink(t.linkFallback, p.confirmUrl),
      ].join('\n'),
    }),
    text: textBlock([
      t.hello(p.firstName),
      '',
      intro,
      '',
      `${cta} : ${p.confirmUrl}`,
      '',
      t.expires(dur(p.lang, p.expiresHours)),
      note,
      '',
      t.ignore,
    ]),
  };
}

// ---------- 6. Email change (alerte vers l'ANCIENNE adresse) ----------

export function emailChanged(p: {
  lang: EmailLang;
  firstName: string;
  newEmail: string;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? "L'adresse email de votre compte a changé" : 'Your account email address has changed';
  const intro =
    p.lang === 'fr'
      ? `L’adresse de connexion de votre compte RaceUp est désormais ${p.newEmail}. Cet email est la dernière notification envoyée à votre ancienne adresse.`
      : `The sign-in address for your RaceUp account is now ${p.newEmail}. This is the last notification sent to your previous address.`;

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [paragraph(esc(t.hello(p.firstName))), paragraph(esc(intro)), callout(esc(t.securityContact), 'warning')].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', t.securityContact]),
  };
}

// ---------- 7. Adresse verifiee / compte supprime ----------

export function accountDeleted(p: { lang: EmailLang; firstName: string; siteUrl: string }): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Votre compte RaceUp a été supprimé' : 'Your RaceUp account has been deleted';
  const intro =
    p.lang === 'fr'
      ? 'Votre compte, vos projets, vos tickets et vos fichiers ont été supprimés. Vos pièces comptables (factures et paiements) sont conservées séparément pendant la durée légale de 10 ans, comme la loi nous y oblige.'
      : 'Your account, projects, tickets and files have been deleted. Your accounting records (invoices and payments) are kept separately for the legally required 10 years.';
  const bye =
    p.lang === 'fr'
      ? 'Merci pour la confiance accordée. Si vous revenez un jour, vous repartirez d’une page blanche.'
      : 'Thank you for your trust. If you ever come back, you will start from a clean slate.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [paragraph(esc(t.hello(p.firstName))), paragraph(esc(intro)), paragraph(esc(bye))].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', bye]),
  };
}

// ---------- 8. Compte verrouille (brute-force) ----------

export function loginLocked(p: {
  lang: EmailLang;
  firstName: string;
  siteUrl: string;
  minutes: number;
  resetUrl: string;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? 'Tentatives de connexion suspectes sur votre compte' : 'Suspicious sign-in attempts on your account';
  const intro =
    p.lang === 'fr'
      ? `Plusieurs tentatives de connexion infructueuses ont eu lieu sur votre compte RaceUp. Par précaution, la connexion est bloquée pendant ${p.minutes} minutes.`
      : `Several failed sign-in attempts were made on your RaceUp account. As a precaution, sign-in is blocked for ${p.minutes} minutes.`;
  const advice =
    p.lang === 'fr'
      ? "S'il s'agissait de vous, patientez et réessayez. Sinon, changez votre mot de passe dès maintenant."
      : 'If this was you, just wait and try again. Otherwise, change your password right now.';
  const cta = p.lang === 'fr' ? 'Changer mon mot de passe' : 'Change my password';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: subject,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        callout(esc(advice), 'warning'),
        button(cta, p.resetUrl),
        fallbackLink(t.linkFallback, p.resetUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', advice, '', `${cta} : ${p.resetUrl}`]),
  };
}

// ---------- 9. Notification interne : nouvelle inscription ----------

export function adminNewUser(p: {
  siteUrl: string;
  dashboardUrl: string;
  email: string;
  name: string;
  username: string;
  provider: string;
  createdAt: string;
}): Email {
  const rows: Row[] = [
    { label: 'Nom', value: p.name || '—' },
    { label: 'Email', value: p.email, strong: true },
    { label: "Nom d'utilisateur", value: p.username },
    { label: 'Méthode', value: p.provider === 'email' ? 'Email + mot de passe' : p.provider },
    { label: 'Date', value: p.createdAt },
  ];

  return {
    subject: `Nouvelle inscription — ${p.email}`,
    html: renderEmail({
      lang: 'fr',
      title: 'Nouvelle inscription',
      preheader: `${p.name || p.email} vient de créer un compte.`,
      siteUrl: p.siteUrl,
      body: [
        paragraph('Un nouveau compte vient d’être créé sur le site.'),
        table(rows),
        button('Ouvrir le dashboard', p.dashboardUrl),
      ].join('\n'),
    }),
    text: textBlock(['Nouvelle inscription', '', textRows(rows), '', `Dashboard : ${p.dashboardUrl}`]),
  };
}
