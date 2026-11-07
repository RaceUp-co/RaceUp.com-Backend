import type { Bindings, Order, SupportTicket, User } from '../types';
import { getEmailConfig, sendEmail } from './email';
import { CATALOG, describeConfiguration, isServiceId, priceConfiguration } from '../data/catalog';
import { formatEuros, formatFileSize } from '../utils/money';
import type { EmailLang } from '../emails/layout';
import type { OrderView } from '../emails/orders';
import * as authEmails from '../emails/auth';
import * as orderEmails from '../emails/orders';
import * as supportEmails from '../emails/support';
import * as projectEmails from '../emails/projects';

// Couche d'orchestration : relie les flux metier (inscription, paiement, support,
// projets) aux gabarits d'emails. Les routes appellent ces fonctions, jamais sendEmail
// directement, pour que le choix du destinataire, de la langue et de la cle
// d'idempotence reste a un seul endroit.
//
// Aucune de ces fonctions ne leve d'exception : un email rate ne doit jamais annuler
// un paiement encaisse ni une inscription reussie.

const DEFAULT_DASHBOARD = 'https://raceup-backend-api.jacqueslucas-m2101.workers.dev/dashboard';

function siteUrl(env: Bindings): string {
  return (env.SITE_URL || 'https://race-up.net').replace(/\/+$/, '');
}

function dashboardUrl(env: Bindings, path = ''): string {
  const base = (env.DASHBOARD_URL || DEFAULT_DASHBOARD).replace(/\/+$/, '');
  return `${base}${path}`;
}

export function asLang(value: string | null | undefined): EmailLang {
  return value === 'en' ? 'en' : 'fr';
}

function firstName(user: Pick<User, 'first_name'>): string {
  return (user.first_name ?? '').trim();
}

function fullName(user: Pick<User, 'first_name' | 'last_name'>): string {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
}

// ---------- URLs publiques (front) ----------

export const publicUrls = {
  verifyEmail: (env: Bindings, lang: EmailLang, token: string) =>
    `${siteUrl(env)}/${lang}/verification-email/?token=${token}`,
  resetPassword: (env: Bindings, lang: EmailLang, token: string) =>
    `${siteUrl(env)}/${lang}/nouveau-mot-de-passe/?token=${token}`,
  forgotPassword: (env: Bindings, lang: EmailLang) => `${siteUrl(env)}/${lang}/mot-de-passe-oublie/`,
  confirmEmailChange: (env: Bindings, lang: EmailLang, token: string) =>
    `${siteUrl(env)}/${lang}/changement-email/?token=${token}`,
  account: (env: Bindings, lang: EmailLang) => `${siteUrl(env)}/${lang}/account/`,
  project: (env: Bindings, lang: EmailLang, projectId: string) =>
    `${siteUrl(env)}/${lang}/account/project/${projectId}/`,
};

// Lien vers un paiement dans le dashboard Stripe. Duplique volontairement (3 lignes)
// pour ne pas importer le SDK Stripe dans le chemin des emails.
function stripePaymentUrl(env: Bindings, paymentIntentId: string | null): string | null {
  if (!paymentIntentId) return null;
  const live = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? '');
  return `https://dashboard.stripe.com/${live ? '' : 'test/'}payments/${paymentIntentId}`;
}

// ---------- Vue d'une commande pour les emails ----------

export function buildOrderView(env: Bindings, order: Order): OrderView {
  const lang = asLang(order.lang);

  // Libelles de la configuration (acompte du configurateur uniquement)
  let configLabel: string | null = null;
  let serviceTitle: string | null = null;
  if (order.service_type && isServiceId(order.service_type)) {
    serviceTitle = CATALOG[order.service_type].title[lang];
    try {
      const config = JSON.parse(order.config ?? '{}') as { base?: string; options?: string[] };
      if (config.base) {
        const priced = priceConfiguration(order.service_type, config.base, config.options ?? []);
        if (priced.ok) configLabel = describeConfiguration(priced.value, lang);
      }
    } catch {
      // config illisible : on se rabat sur la description de la commande
    }
  }

  const remainingCents =
    order.kind === 'deposit' && order.project_total_cents !== null
      ? order.project_total_cents - order.amount_cents
      : null;

  return {
    id: order.id,
    reference: order.id.slice(0, 8).toUpperCase(),
    kind: order.kind,
    description: order.description,
    amount: formatEuros(order.amount_cents, lang),
    projectTotal: order.project_total_cents !== null ? formatEuros(order.project_total_cents, lang) : null,
    remaining: remainingCents !== null && remainingCents > 0 ? formatEuros(remainingCents, lang) : null,
    serviceTitle,
    configLabel,
    customerName: order.customer_name ?? '',
    customerEmail: order.customer_email,
    date: new Date(order.paid_at ?? order.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB'),
    status: order.status,
    paymentIntentId: order.stripe_payment_intent_id,
    receiptUrl: order.receipt_url,
    projectUrl:
      order.project_id && (order.kind === 'milestone' || order.status === 'paid')
        ? publicUrls.project(env, lang, order.project_id)
        : null,
    stripeUrl: stripePaymentUrl(env, order.stripe_payment_intent_id),
  };
}

// ---------- Emails de compte ----------

export async function sendAccountVerification(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  token: string,
  expiresHours: number,
  lang: EmailLang,
  variant: 'welcome' | 'resend'
): Promise<void> {
  const url = publicUrls.verifyEmail(env, lang, token);
  const email =
    variant === 'welcome'
      ? authEmails.welcomeVerify({ lang, firstName: firstName(user), verifyUrl: url, siteUrl: siteUrl(env), expiresHours })
      : authEmails.emailVerification({ lang, firstName: firstName(user), verifyUrl: url, siteUrl: siteUrl(env), expiresHours });

  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: variant === 'welcome' ? 'welcome_verify' : 'email_verification',
    userId: user.id,
  });
}

export async function sendPasswordReset(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  token: string,
  expiresHours: number,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.passwordReset({
    lang,
    firstName: firstName(user),
    resetUrl: publicUrls.resetPassword(env, lang, token),
    siteUrl: siteUrl(env),
    expiresHours,
  });
  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'password_reset',
    userId: user.id,
  });
}

export async function notifyPasswordChanged(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  ip: string | null,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.passwordChanged({
    lang,
    firstName: firstName(user),
    siteUrl: siteUrl(env),
    when: new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB'),
    ip,
  });
  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'password_changed',
    userId: user.id,
  });
}

export async function sendEmailChangeConfirmation(
  env: Bindings,
  user: Pick<User, 'id' | 'first_name'>,
  newEmail: string,
  token: string,
  expiresHours: number,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.emailChangeConfirm({
    lang,
    firstName: firstName(user),
    newEmail,
    confirmUrl: publicUrls.confirmEmailChange(env, lang, token),
    siteUrl: siteUrl(env),
    expiresHours,
  });
  await sendEmail(env, {
    to: newEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'email_change_confirm',
    userId: user.id,
  });
}

// Alerte vers l'ANCIENNE adresse : si un attaquant change l'email, le proprietaire
// legitime en est informe tant qu'il controle encore son ancienne boite.
export async function notifyEmailChanged(
  env: Bindings,
  user: Pick<User, 'id' | 'first_name'>,
  oldEmail: string,
  newEmail: string,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.emailChanged({ lang, firstName: firstName(user), newEmail, siteUrl: siteUrl(env) });
  await sendEmail(env, {
    to: oldEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'email_changed',
    userId: user.id,
  });
}

export async function notifyAccountDeleted(
  env: Bindings,
  user: Pick<User, 'email' | 'first_name'>,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.accountDeleted({ lang, firstName: firstName(user), siteUrl: siteUrl(env) });
  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'account_deleted',
  });
}

export async function notifyLoginLocked(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  minutes: number,
  lang: EmailLang
): Promise<void> {
  const email = authEmails.loginLocked({
    lang,
    firstName: firstName(user),
    siteUrl: siteUrl(env),
    minutes,
    resetUrl: publicUrls.forgotPassword(env, lang),
  });
  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'login_locked',
    userId: user.id,
    // Une seule alerte par compte et par tranche de 15 min, meme sous attaque continue.
    idempotencyKey: `login_locked:${user.id}:${Math.floor(Date.now() / (minutes * 60 * 1000))}`,
  });
}

export async function notifyNewUser(env: Bindings, user: User): Promise<void> {
  const config = getEmailConfig(env);
  const email = authEmails.adminNewUser({
    siteUrl: siteUrl(env),
    dashboardUrl: dashboardUrl(env, `/users/${user.id}`),
    email: user.email,
    name: fullName(user),
    username: user.username,
    provider: user.auth_provider,
    createdAt: new Date(user.created_at).toLocaleString('fr-FR'),
  });
  await sendEmail(env, {
    to: config.admin,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'admin_new_user',
    // Repondre a l'alerte ecrit directement au nouvel inscrit.
    replyTo: user.email,
    idempotencyKey: `admin_new_user:${user.id}`,
  });
}

// ---------- Emails de paiement ----------

// Chaque notification de paiement est idempotente (cle = evenement + commande) :
// Stripe rejoue ses webhooks, et la page de confirmation synchronise en parallele.

export async function notifyOrderPaid(env: Bindings, order: Order): Promise<void> {
  const view = buildOrderView(env, order);
  const lang = asLang(order.lang);
  const config = getEmailConfig(env);

  const client = orderEmails.orderPaid({ lang, order: view, siteUrl: siteUrl(env) });
  const admin = orderEmails.adminOrderPaid({
    order: view,
    dashboardUrl: dashboardUrl(env, '/payments'),
    siteUrl: siteUrl(env),
  });

  await Promise.all([
    sendEmail(env, {
      to: order.customer_email,
      subject: client.subject,
      html: client.html,
      text: client.text,
      template: 'order_paid',
      userId: order.user_id,
      idempotencyKey: `order_paid:${order.id}`,
    }),
    sendEmail(env, {
      to: config.admin,
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
      template: 'admin_order_paid',
      replyTo: order.customer_email,
      idempotencyKey: `admin_order_paid:${order.id}`,
    }),
  ]);
}

export async function notifyOrderProcessing(env: Bindings, order: Order): Promise<void> {
  const view = buildOrderView(env, order);
  const email = orderEmails.orderProcessing({ lang: asLang(order.lang), order: view, siteUrl: siteUrl(env) });
  await sendEmail(env, {
    to: order.customer_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'order_processing',
    userId: order.user_id,
    idempotencyKey: `order_processing:${order.id}`,
  });
}

export async function notifyOrderFailed(env: Bindings, order: Order): Promise<void> {
  const view = buildOrderView(env, order);
  const lang = asLang(order.lang);
  const config = getEmailConfig(env);

  // Une echeance echouee redevient payable depuis l'espace projet ; un acompte echoue
  // se reprend depuis le configurateur du service.
  const retryUrl =
    order.kind === 'milestone' && order.project_id
      ? publicUrls.project(env, lang, order.project_id)
      : order.service_type
        ? `${siteUrl(env)}/${lang}/services/${order.service_type}/`
        : null;

  const client = orderEmails.orderFailed({ lang, order: view, retryUrl, siteUrl: siteUrl(env) });
  const admin = orderEmails.adminOrderFailed({
    order: view,
    dashboardUrl: dashboardUrl(env, '/payments'),
    siteUrl: siteUrl(env),
  });

  await Promise.all([
    sendEmail(env, {
      to: order.customer_email,
      subject: client.subject,
      html: client.html,
      text: client.text,
      template: 'order_failed',
      userId: order.user_id,
      idempotencyKey: `order_failed:${order.id}`,
    }),
    sendEmail(env, {
      to: config.admin,
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
      template: 'admin_order_failed',
      replyTo: order.customer_email,
      idempotencyKey: `admin_order_failed:${order.id}`,
    }),
  ]);
}

export async function notifyOrderRefunded(env: Bindings, order: Order): Promise<void> {
  const view = buildOrderView(env, order);
  const lang = asLang(order.lang);
  const config = getEmailConfig(env);

  const client = orderEmails.orderRefunded({ lang, order: view, siteUrl: siteUrl(env) });
  const admin = orderEmails.adminOrderRefunded({
    order: view,
    dashboardUrl: dashboardUrl(env, '/payments'),
    siteUrl: siteUrl(env),
  });

  await Promise.all([
    sendEmail(env, {
      to: order.customer_email,
      subject: client.subject,
      html: client.html,
      text: client.text,
      template: 'order_refunded',
      userId: order.user_id,
      idempotencyKey: `order_refunded:${order.id}`,
    }),
    sendEmail(env, {
      to: config.admin,
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
      template: 'admin_order_refunded',
      idempotencyKey: `admin_order_refunded:${order.id}`,
    }),
  ]);
}

export async function notifyMilestoneRequested(
  env: Bindings,
  order: Order,
  projectName: string | null
): Promise<void> {
  const view = buildOrderView(env, order);
  const lang = asLang(order.lang);
  const payUrl = order.project_id
    ? publicUrls.project(env, lang, order.project_id)
    : publicUrls.account(env, lang);

  const email = orderEmails.milestoneRequested({ lang, order: view, payUrl, projectName, siteUrl: siteUrl(env) });
  await sendEmail(env, {
    to: order.customer_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'milestone_requested',
    userId: order.user_id,
    idempotencyKey: `milestone_requested:${order.id}`,
  });
}

// ---------- Emails de support ----------

export async function notifySupportTicket(env: Bindings, ticket: SupportTicket): Promise<void> {
  const config = getEmailConfig(env);
  // Le formulaire public n'expose pas la langue : le francais est la langue par defaut
  // du site, et la reponse humaine s'adaptera de toute facon.
  const lang: EmailLang = 'fr';

  let metadata: Record<string, string> | null = null;
  try {
    metadata = ticket.metadata ? (JSON.parse(ticket.metadata) as Record<string, string>) : null;
  } catch {
    metadata = null;
  }

  const client = supportEmails.supportReceived({
    lang,
    name: ticket.name,
    ticketId: ticket.id,
    category: ticket.category,
    priority: ticket.priority,
    message: ticket.message,
    siteUrl: siteUrl(env),
  });

  const admin = supportEmails.adminSupportReceived({
    ticketId: ticket.id,
    name: ticket.name,
    email: ticket.email,
    category: ticket.category,
    priority: ticket.priority,
    message: ticket.message,
    metadata,
    dashboardUrl: dashboardUrl(env, '/support'),
    siteUrl: siteUrl(env),
  });

  await Promise.all([
    sendEmail(env, {
      to: ticket.email,
      subject: client.subject,
      html: client.html,
      text: client.text,
      template: 'support_received',
      idempotencyKey: `support_received:${ticket.id}`,
    }),
    sendEmail(env, {
      to: config.admin,
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
      template: 'admin_support_received',
      // Repondre a l'alerte ecrit directement au demandeur : zero copier-coller.
      replyTo: ticket.email,
      idempotencyKey: `admin_support_received:${ticket.id}`,
    }),
  ]);
}

export async function notifySupportClosed(env: Bindings, ticket: SupportTicket): Promise<void> {
  const email = supportEmails.supportClosed({
    lang: 'fr',
    name: ticket.name,
    ticketId: ticket.id,
    category: ticket.category,
    siteUrl: siteUrl(env),
  });
  await sendEmail(env, {
    to: ticket.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'support_closed',
    idempotencyKey: `support_closed:${ticket.id}`,
  });
}

// ---------- Emails de projet ----------

export async function notifyProjectCreated(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  project: { id: string; name: string; service_type: string },
  lang: EmailLang
): Promise<void> {
  const serviceTitle = isServiceId(project.service_type)
    ? CATALOG[project.service_type].title[lang]
    : project.service_type;

  const email = projectEmails.projectCreated({
    lang,
    firstName: firstName(user),
    projectName: project.name,
    serviceTitle,
    projectUrl: publicUrls.project(env, lang, project.id),
    siteUrl: siteUrl(env),
  });

  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'project_created',
    userId: user.id,
    idempotencyKey: `project_created:${project.id}`,
  });
}

export async function notifyProjectFileAdded(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  project: { id: string; name: string },
  file: { id: string; filename: string; size: number },
  lang: EmailLang
): Promise<void> {
  const email = projectEmails.projectFileAdded({
    lang,
    firstName: firstName(user),
    projectName: project.name,
    filename: file.filename,
    fileSize: formatFileSize(file.size),
    projectUrl: publicUrls.project(env, lang, project.id),
    siteUrl: siteUrl(env),
  });

  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'project_file_added',
    userId: user.id,
    idempotencyKey: `project_file_added:${file.id}`,
  });
}

export async function notifyProjectCompleted(
  env: Bindings,
  user: Pick<User, 'id' | 'email' | 'first_name'>,
  project: { id: string; name: string },
  lang: EmailLang
): Promise<void> {
  const email = projectEmails.projectCompleted({
    lang,
    firstName: firstName(user),
    projectName: project.name,
    projectUrl: publicUrls.project(env, lang, project.id),
    siteUrl: siteUrl(env),
  });

  await sendEmail(env, {
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'project_completed',
    userId: user.id,
    idempotencyKey: `project_completed:${project.id}`,
  });
}

/**
 * Nouveau message sur un ticket de projet. Le destinataire est l'« autre partie » :
 * si c'est RaceUp qui ecrit, le client est prevenu ; si c'est le client, l'alerte part
 * vers la boite RaceUp. Personne ne recoit de notification pour son propre message.
 */
export async function notifyTicketMessage(
  env: Bindings,
  params: {
    authorIsStaff: boolean;
    authorName: string;
    message: string;
    messageId: string;
    ticketSubject: string;
    isNewTicket: boolean;
    project: { id: string; name: string };
    client: Pick<User, 'id' | 'email' | 'first_name'>;
    lang: EmailLang;
  }
): Promise<void> {
  const config = getEmailConfig(env);

  if (params.authorIsStaff) {
    const email = projectEmails.projectTicketMessage({
      lang: params.lang,
      firstName: firstName(params.client),
      projectName: params.project.name,
      ticketSubject: params.ticketSubject,
      authorName: params.authorName,
      message: params.message,
      ticketUrl: publicUrls.project(env, params.lang, params.project.id),
      siteUrl: siteUrl(env),
    });
    await sendEmail(env, {
      to: params.client.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      template: 'project_ticket_reply',
      userId: params.client.id,
      idempotencyKey: `ticket_message:${params.messageId}`,
    });
    return;
  }

  const email = projectEmails.adminProjectTicketActivity({
    kind: params.isNewTicket ? 'created' : 'message',
    projectName: params.project.name,
    ticketSubject: params.ticketSubject,
    authorName: params.authorName,
    authorEmail: params.client.email,
    message: params.message,
    dashboardUrl: dashboardUrl(env, `/projects/${params.project.id}`),
    siteUrl: siteUrl(env),
  });
  await sendEmail(env, {
    to: config.admin,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template: 'admin_project_ticket',
    replyTo: params.client.email,
    idempotencyKey: `ticket_message:${params.messageId}`,
  });
}
