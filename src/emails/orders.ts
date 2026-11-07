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
import type { Email } from './auth';

// Emails de paiement. Cote client : recu, paiement en cours, echec, remboursement,
// echeance a regler. Cote RaceUp : une notification complete par mouvement d'argent,
// avec TOUTES les informations utiles (client, montant, configuration, liens Stripe).

/** Vue d'une commande prete a l'affichage (montants deja formates). */
export type OrderView = {
  id: string;
  reference: string; // 8 premiers caracteres de l'id, lisibles au telephone
  kind: 'deposit' | 'milestone';
  description: string;
  amount: string; // ex: "2 400 €"
  projectTotal: string | null;
  remaining: string | null; // solde restant du (acompte uniquement)
  serviceTitle: string | null;
  configLabel: string | null;
  customerName: string;
  customerEmail: string;
  date: string;
  status: string;
  paymentIntentId: string | null;
  receiptUrl: string | null;
  projectUrl: string | null;
  stripeUrl: string | null;
};

const T = {
  fr: {
    hello: (n: string) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    ref: 'Référence',
    service: 'Prestation',
    config: 'Configuration',
    amountPaid: 'Montant réglé',
    amountDue: 'Montant à régler',
    total: 'Prix total du projet',
    remaining: 'Solde restant',
    date: 'Date',
    invoice: 'Télécharger la facture',
    openProject: 'Voir mon projet',
    linkFallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    schedule:
      'Pour mémoire, le règlement se fait en trois temps : 40 % à la commande, 40 % à la validation de la bêta, 20 % à la mise en ligne.',
    vat: 'TVA non applicable, article 293 B du CGI.',
  },
  en: {
    hello: (n: string) => (n ? `Hi ${n},` : 'Hello,'),
    ref: 'Reference',
    service: 'Service',
    config: 'Configuration',
    amountPaid: 'Amount paid',
    amountDue: 'Amount due',
    total: 'Total project price',
    remaining: 'Remaining balance',
    date: 'Date',
    invoice: 'Download the invoice',
    openProject: 'View my project',
    linkFallback: 'Button not working? Copy this link into your browser:',
    schedule:
      'As a reminder, payment is split in three: 40% on order, 40% when the beta is approved, 20% at launch.',
    vat: 'VAT not applicable, article 293 B of the French General Tax Code.',
  },
} as const;

function clientRows(o: OrderView, lang: EmailLang, amountLabel: string): Row[] {
  const t = T[lang];
  return [
    { label: t.ref, value: o.reference },
    { label: t.service, value: o.serviceTitle ?? o.description },
    { label: t.config, value: o.configLabel ?? '' },
    { label: amountLabel, value: o.amount, strong: true },
    { label: t.total, value: o.projectTotal ?? '' },
    { label: t.remaining, value: o.remaining ?? '' },
    { label: t.date, value: o.date },
  ];
}

// ---------- Client : paiement confirme ----------

export function orderPaid(p: { lang: EmailLang; order: OrderView; siteUrl: string }): Email {
  const t = T[p.lang];
  const o = p.order;
  const isDeposit = o.kind === 'deposit';

  const subject =
    p.lang === 'fr'
      ? `Paiement confirmé — ${o.amount} (réf. ${o.reference})`
      : `Payment confirmed — ${o.amount} (ref. ${o.reference})`;

  const title = p.lang === 'fr' ? 'Paiement confirmé' : 'Payment confirmed';

  const intro = isDeposit
    ? p.lang === 'fr'
      ? 'Merci, votre acompte est bien encaissé. Votre projet est créé et accessible dès maintenant dans votre espace client : nous nous mettons au travail.'
      : 'Thank you, your deposit has been received. Your project is created and already available in your client area: we are getting to work.'
    : p.lang === 'fr'
      ? 'Merci, votre paiement est bien encaissé. Cette échéance est soldée.'
      : 'Thank you, your payment has been received. This milestone is settled.';

  const rows = clientRows(o, p.lang, t.amountPaid);

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title,
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(o.customerName))),
        paragraph(esc(intro)),
        table(rows),
        o.receiptUrl ? button(t.invoice, o.receiptUrl) : '',
        o.projectUrl ? button(t.openProject, o.projectUrl) : '',
        isDeposit ? paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.schedule)}</span>`) : '',
        paragraph(`<span style="color:#9a9ab0;font-size:12px;">${esc(t.vat)}</span>`),
        o.receiptUrl ? fallbackLink(t.linkFallback, o.receiptUrl) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock([
      t.hello(o.customerName),
      '',
      intro,
      '',
      textRows(rows),
      '',
      o.receiptUrl ? `${t.invoice} : ${o.receiptUrl}` : '',
      o.projectUrl ? `${t.openProject} : ${o.projectUrl}` : '',
      '',
      isDeposit ? t.schedule : '',
      t.vat,
    ]),
  };
}

// ---------- Client : paiement differe en cours (SEPA...) ----------

export function orderProcessing(p: { lang: EmailLang; order: OrderView; siteUrl: string }): Email {
  const t = T[p.lang];
  const o = p.order;
  const subject = p.lang === 'fr' ? `Paiement en cours de traitement (réf. ${o.reference})` : `Payment being processed (ref. ${o.reference})`;
  const intro =
    p.lang === 'fr'
      ? 'Votre paiement a bien été initié. Votre banque doit encore le confirmer, ce qui prend généralement 2 à 5 jours ouvrés pour un prélèvement. Vous recevrez un second email dès qu’il est définitivement encaissé.'
      : 'Your payment has been initiated. Your bank still needs to confirm it, which usually takes 2 to 5 business days for a direct debit. You will get a second email as soon as it clears.';
  const rows = clientRows(o, p.lang, t.amountDue);

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Paiement en cours de traitement' : 'Payment being processed',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [paragraph(esc(t.hello(o.customerName))), paragraph(esc(intro)), table(rows)].join('\n'),
    }),
    text: textBlock([t.hello(o.customerName), '', intro, '', textRows(rows)]),
  };
}

// ---------- Client : echec de paiement ----------

export function orderFailed(p: { lang: EmailLang; order: OrderView; retryUrl: string | null; siteUrl: string }): Email {
  const t = T[p.lang];
  const o = p.order;
  const subject = p.lang === 'fr' ? `Votre paiement n'a pas abouti (réf. ${o.reference})` : `Your payment did not go through (ref. ${o.reference})`;
  const intro =
    p.lang === 'fr'
      ? 'Votre banque a refusé le paiement. Aucun montant n’a été débité. Cela arrive le plus souvent pour un plafond atteint ou des coordonnées bancaires expirées.'
      : 'Your bank declined the payment. Nothing has been charged. This usually happens because of a spending limit or expired card details.';
  const advice =
    p.lang === 'fr'
      ? 'Vous pouvez réessayer quand vous le souhaitez, avec le même moyen de paiement ou un autre. Si le problème persiste, répondez à cet email : on trouve une solution.'
      : 'You can try again whenever you like, with the same payment method or another one. If it keeps failing, reply to this email and we will sort it out.';
  const cta = p.lang === 'fr' ? 'Réessayer le paiement' : 'Try the payment again';
  const rows = clientRows(o, p.lang, t.amountDue);

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Paiement non abouti' : 'Payment unsuccessful',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(o.customerName))),
        paragraph(esc(intro)),
        table(rows),
        callout(esc(advice), 'warning'),
        p.retryUrl ? button(cta, p.retryUrl) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock([
      t.hello(o.customerName),
      '',
      intro,
      '',
      textRows(rows),
      '',
      advice,
      p.retryUrl ? `\n${cta} : ${p.retryUrl}` : '',
    ]),
  };
}

// ---------- Client : remboursement ----------

export function orderRefunded(p: { lang: EmailLang; order: OrderView; siteUrl: string }): Email {
  const t = T[p.lang];
  const o = p.order;
  const subject = p.lang === 'fr' ? `Remboursement effectué — ${o.amount} (réf. ${o.reference})` : `Refund issued — ${o.amount} (ref. ${o.reference})`;
  const intro =
    p.lang === 'fr'
      ? 'Votre paiement a été remboursé intégralement. Le montant réapparaît sur le moyen de paiement d’origine sous 5 à 10 jours ouvrés, selon votre banque.'
      : 'Your payment has been refunded in full. The amount will reappear on the original payment method within 5 to 10 business days, depending on your bank.';
  const rows = clientRows(o, p.lang, p.lang === 'fr' ? 'Montant remboursé' : 'Amount refunded');

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Remboursement effectué' : 'Refund issued',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [paragraph(esc(t.hello(o.customerName))), paragraph(esc(intro)), table(rows)].join('\n'),
    }),
    text: textBlock([t.hello(o.customerName), '', intro, '', textRows(rows)]),
  };
}

// ---------- Client : echeance a regler (demandee par RaceUp) ----------

export function milestoneRequested(p: {
  lang: EmailLang;
  order: OrderView;
  payUrl: string;
  projectName: string | null;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const o = p.order;
  const subject =
    p.lang === 'fr' ? `Nouvelle échéance à régler — ${o.amount}` : `New milestone to pay — ${o.amount}`;
  const intro =
    p.lang === 'fr'
      ? `Une nouvelle échéance est disponible sur votre projet${p.projectName ? ` « ${p.projectName} »` : ''}. Vous pouvez la régler en ligne par carte bancaire depuis votre espace client.`
      : `A new milestone is available on your project${p.projectName ? ` "${p.projectName}"` : ''}. You can pay it online by card from your client area.`;
  const cta = p.lang === 'fr' ? 'Régler cette échéance' : 'Pay this milestone';

  const rows: Row[] = [
    { label: t.ref, value: o.reference },
    { label: p.lang === 'fr' ? 'Échéance' : 'Milestone', value: o.description },
    { label: t.amountDue, value: o.amount, strong: true },
    { label: t.total, value: o.projectTotal ?? '' },
    { label: t.date, value: o.date },
  ];

  const note =
    p.lang === 'fr'
      ? 'Une facture vous est automatiquement envoyée après le paiement. Une question sur cette échéance ? Répondez simplement à cet email.'
      : 'An invoice is sent automatically once the payment is made. Any question about this milestone? Just reply to this email.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Nouvelle échéance à régler' : 'New milestone to pay',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(o.customerName))),
        paragraph(esc(intro)),
        table(rows),
        button(cta, p.payUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(note)}</span>`),
        fallbackLink(t.linkFallback, p.payUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(o.customerName), '', intro, '', textRows(rows), '', `${cta} : ${p.payUrl}`, '', note]),
  };
}

// ---------- RaceUp : notifications internes ----------

function adminRows(o: OrderView): Row[] {
  return [
    { label: 'Client', value: o.customerName || '—' },
    { label: 'Email', value: o.customerEmail, strong: true },
    { label: 'Montant', value: o.amount, strong: true },
    { label: 'Type', value: o.kind === 'deposit' ? 'Acompte 40 % (configurateur)' : 'Échéance' },
    { label: 'Prestation', value: o.serviceTitle ?? o.description },
    { label: 'Configuration', value: o.configLabel ?? '' },
    { label: 'Prix total projet', value: o.projectTotal ?? '' },
    { label: 'Solde restant', value: o.remaining ?? '' },
    { label: 'Référence', value: o.reference },
    { label: 'Commande', value: o.id },
    { label: 'Payment Intent', value: o.paymentIntentId ?? '' },
    { label: 'Statut', value: o.status },
    { label: 'Date', value: o.date },
  ];
}

export function adminOrderPaid(p: { order: OrderView; dashboardUrl: string; siteUrl: string }): Email {
  const o = p.order;
  const rows = adminRows(o);
  const headline =
    o.kind === 'deposit'
      ? `Nouvelle commande encaissée — ${o.amount}`
      : `Échéance encaissée — ${o.amount}`;

  const next =
    o.kind === 'deposit'
      ? 'Le projet a été créé automatiquement dans l’espace du client. Prochaine étape : le contacter et planifier le lancement.'
      : 'Le statut de l’échéance est passé à « réglé » dans le dashboard.';

  return {
    subject: `${headline} — ${o.customerEmail}`,
    html: renderEmail({
      lang: 'fr',
      title: headline,
      preheader: `${o.customerName || o.customerEmail} — ${o.amount} — ${o.serviceTitle ?? o.description}`,
      siteUrl: p.siteUrl,
      body: [
        paragraph(`<strong>${esc(o.amount)}</strong> viennent d’être encaissés.`),
        table(rows),
        paragraph(esc(next)),
        button('Ouvrir le dashboard', p.dashboardUrl),
        o.stripeUrl ? fallbackLink('Voir le paiement dans Stripe :', o.stripeUrl) : '',
        o.receiptUrl ? fallbackLink('Facture / reçu client :', o.receiptUrl) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock([
      headline,
      '',
      textRows(rows),
      '',
      next,
      '',
      `Dashboard : ${p.dashboardUrl}`,
      o.stripeUrl ? `Stripe : ${o.stripeUrl}` : '',
      o.receiptUrl ? `Facture : ${o.receiptUrl}` : '',
    ]),
  };
}

export function adminOrderFailed(p: { order: OrderView; dashboardUrl: string; siteUrl: string }): Email {
  const o = p.order;
  const rows = adminRows(o);
  return {
    subject: `Paiement échoué — ${o.amount} — ${o.customerEmail}`,
    html: renderEmail({
      lang: 'fr',
      title: 'Paiement échoué',
      preheader: `${o.customerName || o.customerEmail} — ${o.amount}`,
      siteUrl: p.siteUrl,
      body: [
        paragraph('Un paiement a été refusé par la banque du client. Le client a été prévenu automatiquement.'),
        table(rows),
        callout(
          o.kind === 'milestone'
            ? "L'échéance est repassée en « à régler » : le client peut réessayer depuis son espace."
            : "Il s'agit d'un acompte : aucun projet n'a été créé.",
          'warning'
        ),
        button('Ouvrir le dashboard', p.dashboardUrl),
        o.stripeUrl ? fallbackLink('Voir dans Stripe :', o.stripeUrl) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock(['Paiement échoué', '', textRows(rows), '', `Dashboard : ${p.dashboardUrl}`, o.stripeUrl ? `Stripe : ${o.stripeUrl}` : '']),
  };
}

export function adminOrderRefunded(p: { order: OrderView; dashboardUrl: string; siteUrl: string }): Email {
  const o = p.order;
  const rows = adminRows(o);
  return {
    subject: `Remboursement — ${o.amount} — ${o.customerEmail}`,
    html: renderEmail({
      lang: 'fr',
      title: 'Remboursement effectué',
      preheader: `${o.customerName || o.customerEmail} — ${o.amount} remboursés`,
      siteUrl: p.siteUrl,
      body: [
        paragraph('Un remboursement intégral a été constaté sur Stripe. Le client a été prévenu automatiquement.'),
        table(rows),
        button('Ouvrir le dashboard', p.dashboardUrl),
        o.stripeUrl ? fallbackLink('Voir dans Stripe :', o.stripeUrl) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock(['Remboursement effectué', '', textRows(rows), '', `Dashboard : ${p.dashboardUrl}`]),
  };
}
