import type { Hono } from 'hono';

export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
  GOOGLE_CLIENT_ID: string;
  APPLE_CLIENT_ID: string;
  CONSENT_SALT: string;
  POLICY_VERSION: string;
  // Paiements Stripe — secrets optionnels : sans eux, le paiement en ligne est desactive
  // proprement (PAYMENTS_UNAVAILABLE) et le front bascule sur la demande de devis.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SITE_URL: string; // URL publique du site (retour de Stripe Checkout)
  STRIPE_INVOICE_CREATION?: string; // "true" = facture Stripe generee pour chaque paiement
  // Emails transactionnels Resend — RESEND_API_KEY est un secret OPTIONNEL : sans lui,
  // les envois sont desactives proprement (journalises en 'skipped') et aucun flux metier
  // n'echoue. Le domaine d'envoi doit etre verifie dans Resend (race-up.net).
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string; // signature Svix du webhook Resend (statuts de livraison)
  EMAIL_FROM?: string; // adresse d'expedition (defaut : no-reply@race-up.net)
  EMAIL_FROM_NAME?: string; // nom affiche (defaut : RaceUp)
  EMAIL_REPLY_TO?: string; // adresse de reponse proposee au client (defaut : support@race-up.net)
  EMAIL_ADMIN?: string; // destinataire des notifications internes (defaut : raceup.co@gmail.com)
  DASHBOARD_URL?: string; // base des liens vers le dashboard dans les emails internes
  // Limitation de debit (Workers Rate Limiting) — optionnels : absents en dev/tests
  AUTH_RATE_LIMITER?: RateLimiter;
  FORMS_RATE_LIMITER?: RateLimiter;
};

// Binding Workers Rate Limiting (type minimal, independant de la version de workers-types)
export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type RateLimiterName = 'AUTH_RATE_LIMITER' | 'FORMS_RATE_LIMITER';

export type Variables = {
  jwtPayload: {
    sub: string;
    email: string;
    username: string;
    iat: number;
    exp: number;
  };
  currentUser: User;
  dashboardSession: DashboardSession;
};

export type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};

export type User = {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  auth_provider: string;
  role: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RefreshToken = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: 'in_progress' | 'completed' | 'paused';
  service_type: string;
  tier: string | null;
  start_date: string;
  end_date: string | null;
  progress: number;
  last_update: string | null;
  deliverables_url: string | null;
  is_archived: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Ticket = {
  id: string;
  project_id: string;
  subject: string;
  status: 'open' | 'resolved';
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type ProjectFileRecord = {
  id: string;
  project_id: string;
  uploaded_by: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  r2_key: string;
  created_at: string;
};

export type PageView = {
  id: number;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
};

export type DashboardSession = {
  userId: string;
  email: string;
  role: string;
  exp: number;
};

// ---------- Paiements / commandes ----------

export type OrderKind = 'deposit' | 'milestone';

export type OrderStatus =
  | 'awaiting_payment' // echeance demandee par un admin, pas encore de session Stripe
  | 'pending' // session Stripe Checkout ouverte
  | 'processing' // paiement differe en cours de confirmation (ex : SEPA)
  | 'paid'
  | 'failed'
  | 'expired' // session d'acompte expiree sans paiement
  | 'refunded'
  | 'canceled'; // echeance annulee par un admin

export type Order = {
  id: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string | null;
  project_id: string | null;
  kind: OrderKind;
  service_type: string | null;
  config: string | null;
  description: string;
  amount_cents: number;
  project_total_cents: number | null;
  currency: string;
  status: OrderStatus;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  receipt_url: string | null;
  lang: string;
  terms_accepted_at: string | null;
  created_by: 'user' | 'admin';
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  refunded_at: string | null;
};

// ---------- Avis clients ----------

export type Review = {
  id: string;
  project_id: string;
  user_id: string;
  author_company: string;
  author_role: string;
  rating: number;
  comment_fr: string;
  comment_en: string | null;
  link: string | null;
  is_visible: number; // 0 = en attente de moderation (stocke en INTEGER SQLite)
  created_at: string;
  updated_at: string;
};

// Avis enrichi des donnees affichees par le front, qui vivent dans d'autres tables.
export type ReviewWithContext = Review & {
  author_name: string; // prenom + initiale (users)
  project_name: string; // nom du projet (projects)
};

// ---------- Maintenance ----------

export type MaintenanceState = {
  id: number;
  is_enabled: number; // 0 | 1 (stocke en INTEGER SQLite)
  starts_at: string | null;
  ends_at: string | null;
  message: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

// Statut effectif expose au front
export type MaintenanceStatus = {
  active: boolean;
  is_enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  message: string | null;
};

export type SupportTicket = {
  id: string;
  email: string;
  name: string;
  category: string;
  priority: string;
  subject: string;
  message: string;
  metadata: string | null;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
};

// ---------- Cookie consent types ----------

export type ConsentCategories = {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentMethod = 'accept_all' | 'reject_all' | 'custom' | 'banner_dismiss';
export type WithdrawReason = 'user_request' | 'policy_change' | 'expired';

export type Consent = {
  id: string;
  consent_id: string;
  user_id: string | null;
  ip_hash: string;
  user_agent: string | null;
  country: string | null;

  necessary: 1;
  functional: 0 | 1;
  analytics: 0 | 1;
  marketing: 0 | 1;

  policy_version: string;
  consent_method: ConsentMethod;
  source_url: string | null;

  created_at: string;
  expires_at: string;
  withdrawn_at: string | null;
  withdrawn_reason: WithdrawReason | null;
};

export type ConsentFilters = {
  page?: number;
  limit?: number;
  policy_version?: string;
  user_id?: string;
  consent_method?: ConsentMethod;
  country?: string;
  date_from?: string;
  date_to?: string;
  status?: 'active' | 'withdrawn' | 'expired';
};

export type ConsentStats = {
  total: number;
  accept_all: number;
  reject_all: number;
  custom: number;
  functional_accepted: number;
  analytics_accepted: number;
  marketing_accepted: number;
  acceptance_rate: number;
  period_days: number;
};

// Un point de la série temporelle (consentements par jour, ventilés par méthode).
export type ConsentTimePoint = {
  day: string; // YYYY-MM-DD
  total: number;
  accept_all: number;
  reject_all: number;
  custom: number;
};

// Répartitions agrégées pour le dashboard (pays, policy, retraits/expirations).
export type ConsentBreakdown = {
  by_country: { label: string; value: number }[];
  by_policy: { label: string; value: number }[];
  total: number;
  withdrawn: number;
  expired: number;
  active: number;
  withdrawal_rate: number; // [0..1]
};
