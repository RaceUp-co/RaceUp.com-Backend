import {
  button,
  callout,
  esc,
  paragraph,
  renderEmail,
  table,
  textBlock,
  textRows,
  type EmailLang,
  type Row,
} from './layout';
import type { Email } from './auth';

// Emails du support : accuse de reception cote client, alerte complete cote RaceUp
// (avec reply-to sur l'adresse du demandeur pour repondre d'un simple clic), et
// notification de cloture.

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  account_issue: { fr: 'Problème de compte', en: 'Account issue' },
  account_hacked: { fr: 'Compte compromis', en: 'Compromised account' },
  project_inaccessible: { fr: 'Projet inaccessible', en: 'Project inaccessible' },
  bug: { fr: 'Bug technique', en: 'Technical bug' },
  billing: { fr: 'Facturation', en: 'Billing' },
  gdpr: { fr: 'Suppression de données', en: 'Data deletion' },
  question: { fr: 'Question générale', en: 'General question' },
  other: { fr: 'Autre', en: 'Other' },
  quote_request: { fr: 'Demande de devis', en: 'Quote request' },
};

export function categoryLabel(category: string, lang: EmailLang): string {
  return CATEGORY_LABELS[category]?.[lang] ?? category;
}

// Delais de reponse annonces, alignes sur la priorite calculee cote serveur.
const SLA = {
  urgent: { fr: 'sous 24 heures', en: 'within 24 hours' },
  normal: { fr: 'sous 2 jours ouvrés', en: 'within 2 business days' },
  low: { fr: 'sous 3 jours ouvrés', en: 'within 3 business days' },
} as const;

// ---------- Client : accuse de reception ----------

export function supportReceived(p: {
  lang: EmailLang;
  name: string;
  ticketId: string;
  category: string;
  priority: string;
  message: string;
  siteUrl: string;
}): Email {
  const reference = p.ticketId.slice(0, 8).toUpperCase();
  const sla = (SLA[p.priority as keyof typeof SLA] ?? SLA.normal)[p.lang];
  const isQuote = p.category === 'quote_request';

  const subject =
    p.lang === 'fr'
      ? `Votre demande est enregistrée (réf. ${reference})`
      : `We have received your request (ref. ${reference})`;

  const hello = p.lang === 'fr' ? (p.name ? `Bonjour ${p.name},` : 'Bonjour,') : p.name ? `Hi ${p.name},` : 'Hello,';

  const intro = isQuote
    ? p.lang === 'fr'
      ? 'Merci pour votre demande de devis. Nous l’étudions et revenons vers vous avec une proposition chiffrée.'
      : 'Thank you for your quote request. We are reviewing it and will come back to you with a priced proposal.'
    : p.lang === 'fr'
      ? 'Merci, votre demande est bien arrivée. Une personne de l’équipe la prend en charge.'
      : 'Thank you, your request has reached us. Someone on the team is picking it up.';

  const delay =
    p.lang === 'fr' ? `Vous recevrez une réponse ${sla}.` : `You will get a reply ${sla}.`;

  const rows: Row[] = [
    { label: p.lang === 'fr' ? 'Référence' : 'Reference', value: reference, strong: true },
    { label: p.lang === 'fr' ? 'Sujet' : 'Subject', value: categoryLabel(p.category, p.lang) },
    { label: p.lang === 'fr' ? 'Date' : 'Date', value: new Date().toLocaleString(p.lang === 'fr' ? 'fr-FR' : 'en-GB') },
  ];

  const recap = p.lang === 'fr' ? 'Votre message :' : 'Your message:';
  const reply =
    p.lang === 'fr'
      ? 'Vous pouvez répondre directement à cet email pour ajouter une précision ou une capture d’écran.'
      : 'You can reply directly to this email to add details or a screenshot.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Demande enregistrée' : 'Request received',
      preheader: delay,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(hello)),
        paragraph(esc(intro)),
        paragraph(`<strong>${esc(delay)}</strong>`),
        table(rows),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(recap)}</span>`),
        callout(esc(p.message).replace(/\n/g, '<br>')),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(reply)}</span>`),
      ].join('\n'),
    }),
    text: textBlock([hello, '', intro, delay, '', textRows(rows), '', recap, p.message, '', reply]),
  };
}

// ---------- RaceUp : nouvelle demande ----------

export function adminSupportReceived(p: {
  ticketId: string;
  name: string;
  email: string;
  category: string;
  priority: string;
  message: string;
  metadata: Record<string, string> | null;
  dashboardUrl: string;
  siteUrl: string;
}): Email {
  const reference = p.ticketId.slice(0, 8).toUpperCase();
  const label = categoryLabel(p.category, 'fr');
  const isUrgent = p.priority === 'urgent';

  const rows: Row[] = [
    { label: 'Priorité', value: p.priority.toUpperCase(), strong: isUrgent },
    { label: 'Catégorie', value: label },
    { label: 'Nom', value: p.name },
    { label: 'Email', value: p.email, strong: true },
    { label: 'Référence', value: reference },
    { label: 'Ticket', value: p.ticketId },
    { label: 'Date', value: new Date().toLocaleString('fr-FR') },
  ];

  // Les champs de metadonnees varient selon la categorie (devis, bug, compte...)
  const metaRows: Row[] = Object.entries(p.metadata ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => ({ label: META_LABELS[k] ?? k, value: String(v) }));

  return {
    subject: `${isUrgent ? '[URGENT] ' : ''}${label} — ${p.email} (réf. ${reference})`,
    html: renderEmail({
      lang: 'fr',
      title: `${label}${isUrgent ? ' — urgent' : ''}`,
      preheader: `${p.name} <${p.email}> : ${p.message.slice(0, 120)}`,
      siteUrl: p.siteUrl,
      body: [
        isUrgent ? callout('Demande marquée <strong>urgente</strong> : à traiter sous 24 h.', 'warning') : '',
        table(rows),
        metaRows.length > 0 ? paragraph('<span style="color:#6b6b80;font-size:13px;">Informations complémentaires :</span>') : '',
        metaRows.length > 0 ? table(metaRows) : '',
        paragraph('<span style="color:#6b6b80;font-size:13px;">Message :</span>'),
        callout(esc(p.message).replace(/\n/g, '<br>')),
        paragraph(
          '<span style="color:#6b6b80;font-size:13px;">Répondez directement à cet email : la réponse part vers le client.</span>'
        ),
        button('Ouvrir dans le dashboard', p.dashboardUrl),
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    text: textBlock([
      `${label}${isUrgent ? ' — URGENT' : ''}`,
      '',
      textRows(rows),
      metaRows.length > 0 ? `\nInformations complémentaires :\n${textRows(metaRows)}` : '',
      '',
      'Message :',
      p.message,
      '',
      `Dashboard : ${p.dashboardUrl}`,
    ]),
  };
}

const META_LABELS: Record<string, string> = {
  account_email: 'Email du compte',
  username: "Nom d'utilisateur",
  incident_date: "Date de l'incident",
  project_name: 'Projet concerné',
  page_url: 'Page',
  browser: 'Navigateur',
  order_number: 'N° de commande',
  company: 'Société',
  service: 'Service souhaité',
  budget: 'Budget',
  configuration: 'Configuration',
};

// ---------- Client : demande cloturee ----------

export function supportClosed(p: {
  lang: EmailLang;
  name: string;
  ticketId: string;
  category: string;
  siteUrl: string;
}): Email {
  const reference = p.ticketId.slice(0, 8).toUpperCase();
  const subject =
    p.lang === 'fr' ? `Votre demande est résolue (réf. ${reference})` : `Your request is resolved (ref. ${reference})`;
  const hello = p.lang === 'fr' ? (p.name ? `Bonjour ${p.name},` : 'Bonjour,') : p.name ? `Hi ${p.name},` : 'Hello,';
  const intro =
    p.lang === 'fr'
      ? `Nous considérons votre demande « ${categoryLabel(p.category, 'fr')} » comme traitée et nous la clôturons.`
      : `We consider your "${categoryLabel(p.category, 'en')}" request handled and are closing it.`;
  const reopen =
    p.lang === 'fr'
      ? 'Si le problème persiste ou si quelque chose reste flou, répondez à cet email : la demande est immédiatement réouverte, sans refaire le formulaire.'
      : 'If the issue persists or anything is still unclear, reply to this email: the request reopens immediately, no need to fill the form again.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Demande résolue' : 'Request resolved',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [paragraph(esc(hello)), paragraph(esc(intro)), paragraph(esc(reopen))].join('\n'),
    }),
    text: textBlock([hello, '', intro, '', reopen]),
  };
}
