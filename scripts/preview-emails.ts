/**
 * Envoie un apercu de CHAQUE gabarit d'email a une adresse, pour relecture visuelle.
 *
 * Les gabarits sont importes depuis src/emails/ : ce sont exactement ceux que recoivent
 * les clients, pas des copies. Si un gabarit change, l'apercu change avec lui.
 *
 * Usage :
 *   npm run emails:preview -- destinataire@exemple.com
 *   RESEND_API_KEY=re_... npm run emails:preview -- destinataire@exemple.com
 *
 * La cle est lue dans RESEND_API_KEY (ou .dev.vars, qui n'est pas suivi par git).
 * Les donnees sont fictives et les objets sont prefixes [APERCU] : impossible de les
 * confondre avec un vrai email transactionnel.
 */

import { readFileSync } from 'node:fs';
import * as authEmails from '../src/emails/auth';
import * as orderEmails from '../src/emails/orders';
import * as supportEmails from '../src/emails/support';
import * as projectEmails from '../src/emails/projects';
import type { OrderView } from '../src/emails/orders';

type Email = { subject: string; html: string; text: string };

const SITE = 'https://race-up.net';
const DASH = 'https://raceup-backend-api.jacqueslucas-m2101.workers.dev/dashboard';
const FROM = 'RaceUp <no-reply@race-up.net>';

// Jeton factice de la bonne forme (64 caracteres hexa) : les liens ressemblent aux vrais.
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

// ---------- Donnees fictives ----------

const CLIENT = { firstName: 'Camille', fullName: 'Camille Rousseau', email: 'camille.rousseau@atelier-vernaz.fr' };
const PROJECT_ID = '7f3c1a9e-4b2d-4c8f-9a1e-2d5b8c7f4a31';
const PROJECT_NAME = 'Developpement Web — Boutique e-commerce';
const PROJECT_URL = `${SITE}/fr/account/project/${PROJECT_ID}/`;

const depositOrder: OrderView = {
  id: 'b4e7d2c1-8f3a-4e6b-9c5d-1a2f8e7b3c40',
  reference: 'B4E7D2C1',
  kind: 'deposit',
  description: 'Acompte 40 % — Developpement Web : Boutique e-commerce + SEO avance + Version multilingue',
  amount: '2 440 €',
  projectTotal: '6 100 €',
  remaining: '3 660 €',
  serviceTitle: 'Developpement Web',
  configLabel: 'Boutique e-commerce + SEO avance + Version multilingue',
  customerName: CLIENT.firstName,
  customerEmail: CLIENT.email,
  date: '08/11/2026 14:32',
  status: 'paid',
  paymentIntentId: 'pi_3QexAmPnyNnQz0gI1aBcDeFg',
  receiptUrl: 'https://invoice.stripe.com/i/acct_example/live_YWNjdF9leGFtcGxl',
  projectUrl: PROJECT_URL,
  stripeUrl: 'https://dashboard.stripe.com/test/payments/pi_3QexAmPnyNnQz0gI1aBcDeFg',
};

const milestoneOrder: OrderView = {
  ...depositOrder,
  id: 'c9a1f5e3-2b7d-4a8c-8e1f-5d3b9c2a7e68',
  reference: 'C9A1F5E3',
  kind: 'milestone',
  description: 'Echeance 40 % — validation de la beta',
  amount: '2 440 €',
  remaining: null,
  configLabel: null,
  status: 'awaiting_payment',
  receiptUrl: null,
  date: '08/11/2026 09:15',
};

const SUPPORT_MESSAGE =
  "Bonjour,\n\nImpossible de telecharger le dernier livrable depuis l'onglet Fichiers : le bouton tourne puis affiche une erreur. J'ai essaye sur Chrome et Firefox.\n\nMerci d'avance.";

const TICKET_MESSAGE =
  "Bonjour Camille,\n\nC'est corrige : le fichier etait trop volumineux pour l'ancien quota. Vous pouvez le retelecharger, il fait 18 Mo.\n\nBonne journee.";

// ---------- Catalogue des apercus ----------

const previews: { name: string; email: Email }[] = [
  // --- Compte ---
  {
    name: 'welcome_verify',
    email: authEmails.welcomeVerify({
      lang: 'fr', firstName: CLIENT.firstName, verifyUrl: `${SITE}/fr/verification-email/?token=${TOKEN}`,
      siteUrl: SITE, expiresHours: 48,
    }),
  },
  {
    name: 'email_verification',
    email: authEmails.emailVerification({
      lang: 'fr', firstName: CLIENT.firstName, verifyUrl: `${SITE}/fr/verification-email/?token=${TOKEN}`,
      siteUrl: SITE, expiresHours: 48,
    }),
  },
  {
    name: 'password_reset',
    email: authEmails.passwordReset({
      lang: 'fr', firstName: CLIENT.firstName, resetUrl: `${SITE}/fr/nouveau-mot-de-passe/?token=${TOKEN}`,
      siteUrl: SITE, expiresHours: 1,
    }),
  },
  {
    name: 'password_changed',
    email: authEmails.passwordChanged({
      lang: 'fr', firstName: CLIENT.firstName, siteUrl: SITE, when: '08/11/2026 14:32', ip: '92.184.106.12',
    }),
  },
  {
    name: 'email_change_confirm',
    email: authEmails.emailChangeConfirm({
      lang: 'fr', firstName: CLIENT.firstName, newEmail: 'camille@atelier-vernaz.fr',
      confirmUrl: `${SITE}/fr/changement-email/?token=${TOKEN}`, siteUrl: SITE, expiresHours: 24,
    }),
  },
  {
    name: 'email_changed',
    email: authEmails.emailChanged({
      lang: 'fr', firstName: CLIENT.firstName, newEmail: 'camille@atelier-vernaz.fr', siteUrl: SITE,
    }),
  },
  {
    name: 'account_deleted',
    email: authEmails.accountDeleted({ lang: 'fr', firstName: CLIENT.firstName, siteUrl: SITE }),
  },
  {
    name: 'login_locked',
    email: authEmails.loginLocked({
      lang: 'fr', firstName: CLIENT.firstName, siteUrl: SITE, minutes: 15,
      resetUrl: `${SITE}/fr/mot-de-passe-oublie/`,
    }),
  },
  {
    name: 'admin_new_user  [interne]',
    email: authEmails.adminNewUser({
      siteUrl: SITE, dashboardUrl: `${DASH}/users/42`, email: CLIENT.email, name: CLIENT.fullName,
      username: 'camille_r', provider: 'email', createdAt: '08/11/2026 14:30',
    }),
  },

  // --- Paiements ---
  { name: 'order_paid', email: orderEmails.orderPaid({ lang: 'fr', order: depositOrder, siteUrl: SITE }) },
  {
    name: 'order_processing',
    email: orderEmails.orderProcessing({
      lang: 'fr', order: { ...depositOrder, status: 'processing', receiptUrl: null }, siteUrl: SITE,
    }),
  },
  {
    name: 'order_failed',
    email: orderEmails.orderFailed({
      lang: 'fr', order: { ...depositOrder, status: 'failed', receiptUrl: null },
      retryUrl: `${SITE}/fr/services/web-development/`, siteUrl: SITE,
    }),
  },
  {
    name: 'order_refunded',
    email: orderEmails.orderRefunded({ lang: 'fr', order: { ...depositOrder, status: 'refunded' }, siteUrl: SITE }),
  },
  {
    name: 'milestone_requested',
    email: orderEmails.milestoneRequested({
      lang: 'fr', order: milestoneOrder, payUrl: PROJECT_URL, projectName: PROJECT_NAME, siteUrl: SITE,
    }),
  },
  {
    name: 'admin_order_paid  [interne]',
    email: orderEmails.adminOrderPaid({ order: depositOrder, dashboardUrl: `${DASH}/payments`, siteUrl: SITE }),
  },
  {
    name: 'admin_order_failed  [interne]',
    email: orderEmails.adminOrderFailed({
      order: { ...depositOrder, status: 'failed', receiptUrl: null }, dashboardUrl: `${DASH}/payments`, siteUrl: SITE,
    }),
  },
  {
    name: 'admin_order_refunded  [interne]',
    email: orderEmails.adminOrderRefunded({
      order: { ...depositOrder, status: 'refunded' }, dashboardUrl: `${DASH}/payments`, siteUrl: SITE,
    }),
  },

  // --- Support ---
  {
    name: 'support_received',
    email: supportEmails.supportReceived({
      lang: 'fr', name: CLIENT.firstName, ticketId: 'd51f8a2c-3e6b-4d9a-8c7f-1b4e2a9d6c83',
      category: 'project_inaccessible', priority: 'normal', message: SUPPORT_MESSAGE, siteUrl: SITE,
    }),
  },
  {
    name: 'admin_support_received  [interne]',
    email: supportEmails.adminSupportReceived({
      ticketId: 'd51f8a2c-3e6b-4d9a-8c7f-1b4e2a9d6c83', name: CLIENT.fullName, email: CLIENT.email,
      category: 'quote_request', priority: 'urgent',
      message: "Bonjour, nous cherchons a refondre notre site et a y brancher une boutique. Budget autour de 6 000 €. Disponible cette semaine pour en parler.",
      metadata: { company: 'Atelier Vernaz', service: 'web-development', budget: '5 000 - 8 000 €', configuration: 'Boutique e-commerce + SEO avance' },
      dashboardUrl: `${DASH}/support`, siteUrl: SITE,
    }),
  },
  {
    name: 'support_closed',
    email: supportEmails.supportClosed({
      lang: 'fr', name: CLIENT.firstName, ticketId: 'd51f8a2c-3e6b-4d9a-8c7f-1b4e2a9d6c83',
      category: 'project_inaccessible', siteUrl: SITE,
    }),
  },

  // --- Projets ---
  {
    name: 'project_created',
    email: projectEmails.projectCreated({
      lang: 'fr', firstName: CLIENT.firstName, projectName: PROJECT_NAME, serviceTitle: 'Developpement Web',
      projectUrl: PROJECT_URL, siteUrl: SITE,
    }),
  },
  {
    name: 'project_file_added',
    email: projectEmails.projectFileAdded({
      lang: 'fr', firstName: CLIENT.firstName, projectName: PROJECT_NAME,
      filename: 'maquettes-v2-boutique.pdf', fileSize: '18.4 Mo', projectUrl: PROJECT_URL, siteUrl: SITE,
    }),
  },
  {
    name: 'project_ticket_reply',
    email: projectEmails.projectTicketMessage({
      lang: 'fr', firstName: CLIENT.firstName, projectName: PROJECT_NAME,
      ticketSubject: 'Telechargement du livrable impossible', authorName: 'Jacques (RaceUp)',
      message: TICKET_MESSAGE, ticketUrl: PROJECT_URL, siteUrl: SITE,
    }),
  },
  {
    name: 'project_completed',
    email: projectEmails.projectCompleted({
      lang: 'fr', firstName: CLIENT.firstName, projectName: PROJECT_NAME, projectUrl: PROJECT_URL, siteUrl: SITE,
    }),
  },
  {
    name: 'admin_project_ticket  [interne]',
    email: projectEmails.adminProjectTicketActivity({
      kind: 'created', projectName: PROJECT_NAME, ticketSubject: 'Telechargement du livrable impossible',
      authorName: CLIENT.fullName, authorEmail: CLIENT.email, message: SUPPORT_MESSAGE,
      dashboardUrl: `${DASH}/projects/${PROJECT_ID}`, siteUrl: SITE,
    }),
  },
  {
    name: 'admin_new_review  [interne]',
    email: projectEmails.adminNewReview({
      projectName: PROJECT_NAME, authorName: 'Camille R.', authorCompany: 'Atelier Vernaz',
      authorRole: 'Directrice', rating: 5,
      comment: "Travail impeccable et delais tenus. La boutique tourne depuis trois semaines sans un accroc, et le suivi par tickets nous a evite des dizaines de mails.",
      link: 'https://atelier-vernaz.fr', dashboardUrl: `${DASH}/reviews`, siteUrl: SITE,
    }),
  },

  // --- Un exemplaire en anglais, pour verifier la version bilingue ---
  {
    name: 'order_paid  [EN]',
    email: orderEmails.orderPaid({
      lang: 'en',
      order: { ...depositOrder, amount: '€2,440', projectTotal: '€6,100', remaining: '€3,660' },
      siteUrl: SITE,
    }),
  },
];

// ---------- Envoi ----------

function resolveApiKey(): string {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  try {
    // Resolu depuis la racine du projet : le script est bundle dans un dossier temporaire,
    // donc un chemin relatif au fichier compile pointerait ailleurs.
    const devVars = readFileSync(`${process.cwd()}/.dev.vars`, 'utf8');
    const match = devVars.match(/^RESEND_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) return match[1];
  } catch {
    // .dev.vars absent : on tombe sur l'erreur ci-dessous
  }
  throw new Error('RESEND_API_KEY manquante (variable d’environnement ou .dev.vars).');
}

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes('@')) {
    console.error('Usage : npm run emails:preview -- destinataire@exemple.com');
    process.exit(1);
  }

  const apiKey = resolveApiKey();
  console.log(`Envoi de ${previews.length} apercus vers ${to}\n`);

  let sent = 0;
  for (const [index, preview] of previews.entries()) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        // Prefixe explicite : un apercu ne doit jamais etre pris pour un vrai email.
        subject: `[APERCU ${String(index + 1).padStart(2, '0')}] ${preview.email.subject}`,
        html: preview.email.html,
        text: preview.email.text,
        reply_to: ['support@race-up.net'],
        tags: [{ name: 'template', value: 'preview' }],
      }),
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (response.ok && payload?.id) {
      sent += 1;
      console.log(`  ${String(index + 1).padStart(2, '0')}. ${preview.name.padEnd(34)} ok`);
    } else {
      console.error(`  ${String(index + 1).padStart(2, '0')}. ${preview.name.padEnd(34)} ECHEC — ${response.status} ${payload?.message ?? ''}`);
    }

    // Resend limite a 2 requetes/seconde sur les plans d'entree de gamme.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  console.log(`\n${sent}/${previews.length} apercus envoyes.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
