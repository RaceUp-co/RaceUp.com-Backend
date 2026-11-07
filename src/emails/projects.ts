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

// Emails de suivi de projet : creation, nouveau fichier/livrable, echanges de tickets
// et cloture du projet. Ce sont eux qui evitent au client d'avoir a venir verifier
// son espace tous les jours.

const T = {
  fr: {
    hello: (n: string) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    openProject: 'Voir le projet',
    openTicket: 'Voir la conversation',
    project: 'Projet',
    linkFallback: 'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :',
    replyInApp:
      'Répondez depuis votre espace client pour garder tout l’historique de la conversation au même endroit.',
  },
  en: {
    hello: (n: string) => (n ? `Hi ${n},` : 'Hello,'),
    openProject: 'View the project',
    openTicket: 'View the conversation',
    project: 'Project',
    linkFallback: 'Button not working? Copy this link into your browser:',
    replyInApp: 'Reply from your client area to keep the whole conversation history in one place.',
  },
} as const;

// ---------- Projet cree ----------

export function projectCreated(p: {
  lang: EmailLang;
  firstName: string;
  projectName: string;
  serviceTitle: string;
  projectUrl: string;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? `Votre projet « ${p.projectName} » est ouvert` : `Your project "${p.projectName}" is open`;
  const intro =
    p.lang === 'fr'
      ? 'Votre projet est créé dans votre espace client. Vous y suivrez son avancement, y récupérerez les livrables et pourrez nous écrire à tout moment par ticket.'
      : 'Your project has been created in your client area. You can follow its progress there, download deliverables and message us any time through tickets.';

  const rows: Row[] = [
    { label: t.project, value: p.projectName, strong: true },
    { label: p.lang === 'fr' ? 'Prestation' : 'Service', value: p.serviceTitle },
    { label: p.lang === 'fr' ? 'Ouverture' : 'Opened', value: new Date().toLocaleDateString(p.lang === 'fr' ? 'fr-FR' : 'en-GB') },
  ];

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Votre projet est ouvert' : 'Your project is open',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        table(rows),
        button(t.openProject, p.projectUrl),
        fallbackLink(t.linkFallback, p.projectUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', textRows(rows), '', `${t.openProject} : ${p.projectUrl}`]),
  };
}

// ---------- Nouveau fichier deposé par RaceUp (livrable) ----------

export function projectFileAdded(p: {
  lang: EmailLang;
  firstName: string;
  projectName: string;
  filename: string;
  fileSize: string;
  projectUrl: string;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const subject =
    p.lang === 'fr' ? `Nouveau fichier sur « ${p.projectName} »` : `New file on "${p.projectName}"`;
  const intro =
    p.lang === 'fr'
      ? 'Nous venons de déposer un nouveau fichier sur votre projet. Il est téléchargeable depuis l’onglet Fichiers de votre espace.'
      : 'We just added a new file to your project. You can download it from the Files tab of your client area.';

  const rows: Row[] = [
    { label: t.project, value: p.projectName },
    { label: p.lang === 'fr' ? 'Fichier' : 'File', value: p.filename, strong: true },
    { label: p.lang === 'fr' ? 'Taille' : 'Size', value: p.fileSize },
  ];

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Nouveau fichier disponible' : 'New file available',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        table(rows),
        button(t.openProject, p.projectUrl),
        fallbackLink(t.linkFallback, p.projectUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', textRows(rows), '', `${t.openProject} : ${p.projectUrl}`]),
  };
}

// ---------- Nouveau message sur un ticket de projet (vers le client) ----------

export function projectTicketMessage(p: {
  lang: EmailLang;
  firstName: string;
  projectName: string;
  ticketSubject: string;
  authorName: string;
  message: string;
  ticketUrl: string;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const subject =
    p.lang === 'fr' ? `Réponse de RaceUp — ${p.ticketSubject}` : `Reply from RaceUp — ${p.ticketSubject}`;
  const intro =
    p.lang === 'fr'
      ? `${p.authorName} a répondu sur votre ticket « ${p.ticketSubject} » (projet ${p.projectName}).`
      : `${p.authorName} replied on your ticket "${p.ticketSubject}" (project ${p.projectName}).`;

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Nouvelle réponse' : 'New reply',
      preheader: p.message.slice(0, 120),
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        callout(esc(p.message).replace(/\n/g, '<br>')),
        button(t.openTicket, p.ticketUrl),
        paragraph(`<span style="color:#6b6b80;font-size:13px;">${esc(t.replyInApp)}</span>`),
        fallbackLink(t.linkFallback, p.ticketUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', p.message, '', `${t.openTicket} : ${p.ticketUrl}`, '', t.replyInApp]),
  };
}

// ---------- Projet termine (+ invitation a laisser un avis) ----------

export function projectCompleted(p: {
  lang: EmailLang;
  firstName: string;
  projectName: string;
  projectUrl: string;
  siteUrl: string;
}): Email {
  const t = T[p.lang];
  const subject = p.lang === 'fr' ? `« ${p.projectName} » est terminé` : `"${p.projectName}" is complete`;
  const intro =
    p.lang === 'fr'
      ? 'Votre projet est marqué comme terminé. Tous les livrables sont disponibles dans votre espace client, et vous y gardez l’accès sans limite de temps.'
      : 'Your project is marked as complete. All deliverables are available in your client area, and your access never expires.';
  const review =
    p.lang === 'fr'
      ? 'Si le résultat vous plaît, vous pouvez laisser un avis depuis votre espace : c’est ce qui nous aide le plus à travailler avec de nouveaux clients.'
      : 'If you are happy with the result, you can leave a review from your client area: nothing helps us win new clients more.';

  return {
    subject,
    html: renderEmail({
      lang: p.lang,
      title: p.lang === 'fr' ? 'Projet terminé' : 'Project complete',
      preheader: intro,
      siteUrl: p.siteUrl,
      body: [
        paragraph(esc(t.hello(p.firstName))),
        paragraph(esc(intro)),
        paragraph(esc(review)),
        button(t.openProject, p.projectUrl),
        fallbackLink(t.linkFallback, p.projectUrl),
      ].join('\n'),
    }),
    text: textBlock([t.hello(p.firstName), '', intro, '', review, '', `${t.openProject} : ${p.projectUrl}`]),
  };
}

// ---------- RaceUp : nouveau ticket / message d'un client ----------

export function adminProjectTicketActivity(p: {
  kind: 'created' | 'message';
  projectName: string;
  ticketSubject: string;
  authorName: string;
  authorEmail: string;
  message: string;
  dashboardUrl: string;
  siteUrl: string;
}): Email {
  const headline =
    p.kind === 'created'
      ? `Nouveau ticket — ${p.projectName}`
      : `Nouveau message client — ${p.projectName}`;

  const rows: Row[] = [
    { label: 'Projet', value: p.projectName },
    { label: 'Sujet', value: p.ticketSubject, strong: true },
    { label: 'Client', value: p.authorName },
    { label: 'Email', value: p.authorEmail },
    { label: 'Date', value: new Date().toLocaleString('fr-FR') },
  ];

  return {
    subject: `${headline} — ${p.ticketSubject}`,
    html: renderEmail({
      lang: 'fr',
      title: headline,
      preheader: `${p.authorName} : ${p.message.slice(0, 120)}`,
      siteUrl: p.siteUrl,
      body: [
        paragraph(
          p.kind === 'created'
            ? 'Un client vient d’ouvrir un ticket sur son projet.'
            : 'Un client vient de répondre sur un ticket de projet.'
        ),
        table(rows),
        callout(esc(p.message).replace(/\n/g, '<br>')),
        button('Ouvrir dans le dashboard', p.dashboardUrl),
      ].join('\n'),
    }),
    text: textBlock([headline, '', textRows(rows), '', p.message, '', `Dashboard : ${p.dashboardUrl}`]),
  };
}
