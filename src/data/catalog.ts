// Catalogue tarifaire du configurateur de projet — SOURCE DE VERITE des prix.
// Le serveur recalcule TOUJOURS le total a partir de ce fichier : le montant envoye par le
// client n'est utilise que pour detecter un ecart d'affichage (PRICE_MISMATCH).
//
// ⚠️ Synchronisation : toute modification (id, prix, libelle) doit etre repercutee dans
// le front : RaceUp.com/src/data/pricing-catalog.ts (meme ids, memes prix).

export const DEPOSIT_RATE = 0.4; // Acompte de 40 % (cf. CGV, article 4)

export type ServiceId =
  | 'web-development'
  | 'applications'
  | 'data-analytics'
  | 'smart-contracts'
  | 'ui-ux-design'
  | 'intelligence-artificielle';

type Localized = { fr: string; en: string };

export type CatalogItem = {
  id: string;
  price: number; // euros, TVA non applicable (art. 293 B du CGI)
  label: Localized;
};

export type ServiceCatalog = {
  title: Localized;
  bases: CatalogItem[]; // type de projet (choix unique)
  options: CatalogItem[]; // modules additionnels (choix multiples)
};

export const CATALOG: Record<ServiceId, ServiceCatalog> = {
  'web-development': {
    title: { fr: 'Développement Web', en: 'Web Development' },
    bases: [
      { id: 'landing', price: 500, label: { fr: 'Landing page', en: 'Landing page' } },
      { id: 'showcase', price: 1500, label: { fr: 'Site vitrine', en: 'Showcase website' } },
      { id: 'ecommerce', price: 4000, label: { fr: 'Boutique e-commerce', en: 'E-commerce store' } },
      { id: 'platform', price: 8000, label: { fr: 'Plateforme / web app', en: 'Platform / web app' } },
    ],
    options: [
      { id: 'seo_plus', price: 700, label: { fr: 'SEO avancé', en: 'Advanced SEO' } },
      { id: 'multilingual', price: 600, label: { fr: 'Version multilingue', en: 'Multilingual version' } },
      { id: 'blog', price: 500, label: { fr: 'Blog & actualités', en: 'Blog & news' } },
      { id: 'motion', price: 900, label: { fr: 'Animations sur mesure', en: 'Custom animations' } },
      { id: 'integrations', price: 600, label: { fr: 'Intégrations métier', en: 'Business integrations' } },
      { id: 'branding', price: 1200, label: { fr: 'Identité visuelle', en: 'Visual identity' } },
      { id: 'care', price: 1200, label: { fr: 'Maintenance 12 mois', en: '12-month maintenance' } },
    ],
  },
  applications: {
    title: { fr: 'Applications & SaaS', en: 'Applications & SaaS' },
    bases: [
      { id: 'mvp', price: 2000, label: { fr: 'MVP', en: 'MVP' } },
      { id: 'mobile', price: 6000, label: { fr: 'Application mobile', en: 'Mobile app' } },
      { id: 'saas', price: 12000, label: { fr: 'Plateforme SaaS', en: 'SaaS platform' } },
      { id: 'internal_tool', price: 3500, label: { fr: 'Outil métier', en: 'Internal tool' } },
    ],
    options: [
      { id: 'social_login', price: 800, label: { fr: 'Connexion Google / Apple & rôles', en: 'Google / Apple sign-in & roles' } },
      { id: 'payments', price: 1500, label: { fr: 'Paiements & abonnements', en: 'Payments & subscriptions' } },
      { id: 'push', price: 700, label: { fr: 'Notifications push', en: 'Push notifications' } },
      { id: 'realtime', price: 1800, label: { fr: 'Temps réel', en: 'Real-time' } },
      { id: 'analytics', price: 900, label: { fr: 'Analytics produit', en: 'Product analytics' } },
      { id: 'ai', price: 2500, label: { fr: 'Fonctionnalité IA', en: 'AI feature' } },
      { id: 'admin', price: 1500, label: { fr: 'Back-office avancé', en: 'Advanced back-office' } },
      { id: 'quality', price: 1200, label: { fr: 'Tests automatisés & CI/CD', en: 'Automated tests & CI/CD' } },
    ],
  },
  'data-analytics': {
    title: { fr: 'Data Analytics', en: 'Data Analytics' },
    bases: [
      { id: 'dashboards', price: 500, label: { fr: 'Dashboards & KPIs', en: 'Dashboards & KPIs' } },
      { id: 'audit', price: 1500, label: { fr: 'Audit & stratégie data', en: 'Data audit & strategy' } },
      { id: 'etl', price: 2500, label: { fr: 'Pipeline de données', en: 'Data pipeline' } },
      { id: 'warehouse', price: 5000, label: { fr: 'Data warehouse', en: 'Data warehouse' } },
    ],
    options: [
      { id: 'sources', price: 600, label: { fr: '+3 sources de données', en: '+3 data sources' } },
      { id: 'alerts', price: 400, label: { fr: 'Alertes automatiques', en: 'Automatic alerts' } },
      { id: 'reports', price: 500, label: { fr: 'Rapports automatisés', en: 'Automated reports' } },
      { id: 'predictive', price: 2500, label: { fr: 'Modèle prédictif', en: 'Predictive model' } },
      { id: 'training', price: 500, label: { fr: 'Formation des équipes', en: 'Team training' } },
      { id: 'support', price: 600, label: { fr: 'Support 3 mois', en: '3-month support' } },
    ],
  },
  'smart-contracts': {
    title: { fr: 'Smart Contracts', en: 'Smart Contracts' },
    bases: [
      { id: 'token', price: 1000, label: { fr: 'Token ERC-20', en: 'ERC-20 token' } },
      { id: 'nft', price: 1500, label: { fr: 'Collection NFT', en: 'NFT collection' } },
      { id: 'audit', price: 2000, label: { fr: 'Audit de sécurité', en: 'Security audit' } },
      { id: 'defi', price: 8000, label: { fr: 'Protocole DeFi', en: 'DeFi protocol' } },
    ],
    options: [
      { id: 'staking', price: 1500, label: { fr: 'Staking & récompenses', en: 'Staking & rewards' } },
      { id: 'governance', price: 1800, label: { fr: 'Gouvernance (DAO)', en: 'Governance (DAO)' } },
      { id: 'dapp', price: 2500, label: { fr: 'Interface dApp', en: 'dApp interface' } },
      { id: 'multichain', price: 2000, label: { fr: 'Déploiement multi-chain', en: 'Multi-chain deployment' } },
      { id: 'vesting', price: 900, label: { fr: 'Vesting & airdrop', en: 'Vesting & airdrop' } },
      { id: 'monitoring', price: 900, label: { fr: 'Monitoring on-chain', en: 'On-chain monitoring' } },
    ],
  },
  'ui-ux-design': {
    title: { fr: 'UI/UX Design', en: 'UI/UX Design' },
    bases: [
      { id: 'mockups', price: 400, label: { fr: "Maquettes d'interface", en: 'Interface mockups' } },
      { id: 'ux_audit', price: 900, label: { fr: 'Audit UX', en: 'UX audit' } },
      { id: 'product', price: 2000, label: { fr: "Design d'application", en: 'App design' } },
      { id: 'design_system', price: 4000, label: { fr: 'Design system', en: 'Design system' } },
    ],
    options: [
      { id: 'prototype', price: 500, label: { fr: 'Prototype interactif', en: 'Interactive prototype' } },
      { id: 'screens', price: 600, label: { fr: '+10 écrans', en: '+10 screens' } },
      { id: 'research', price: 1200, label: { fr: 'UX research', en: 'UX research' } },
      { id: 'testing', price: 1000, label: { fr: 'Tests utilisateurs', en: 'User testing' } },
      { id: 'branding', price: 1200, label: { fr: 'Identité visuelle', en: 'Visual identity' } },
      { id: 'iteration', price: 300, label: { fr: 'Itération supplémentaire', en: 'Extra iteration' } },
    ],
  },
  'intelligence-artificielle': {
    title: { fr: 'Intelligence Artificielle', en: 'Artificial Intelligence' },
    bases: [
      { id: 'assistant', price: 1500, label: { fr: 'Chatbot / assistant IA', en: 'AI chatbot / assistant' } },
      { id: 'automation', price: 2500, label: { fr: 'Automatisation IA', en: 'AI automation' } },
      { id: 'knowledge', price: 4000, label: { fr: 'Base de connaissances (RAG)', en: 'Knowledge base (RAG)' } },
      { id: 'custom_model', price: 8000, label: { fr: 'Modèle sur mesure', en: 'Custom model' } },
    ],
    options: [
      { id: 'integrations', price: 800, label: { fr: 'Intégrations outils', en: 'Tool integrations' } },
      { id: 'monitoring', price: 900, label: { fr: 'Suivi qualité & coûts', en: 'Quality & cost monitoring' } },
      { id: 'voice', price: 1500, label: { fr: 'Interface vocale', en: 'Voice interface' } },
      { id: 'agents', price: 3000, label: { fr: 'Agents autonomes', en: 'Autonomous agents' } },
      { id: 'dedicated_hosting', price: 2500, label: { fr: 'Hébergement dédié', en: 'Dedicated hosting' } },
      { id: 'support', price: 700, label: { fr: 'Support 3 mois', en: '3-month support' } },
    ],
  },
};

export function isServiceId(value: string): value is ServiceId {
  return Object.prototype.hasOwnProperty.call(CATALOG, value);
}

export type PricedConfiguration = {
  service: ServiceId;
  base: CatalogItem;
  options: CatalogItem[];
  totalCents: number;
  depositCents: number;
};

export type PricingError = 'UNKNOWN_SERVICE' | 'UNKNOWN_BASE' | 'UNKNOWN_OPTION' | 'DUPLICATE_OPTION';

// Calcule le prix ferme d'une configuration. Rejette tout id inconnu ou duplique
// (un client ne peut ni inventer une option ni la compter deux fois).
export function priceConfiguration(
  service: string,
  baseId: string,
  optionIds: string[]
): { ok: true; value: PricedConfiguration } | { ok: false; error: PricingError } {
  if (!isServiceId(service)) return { ok: false, error: 'UNKNOWN_SERVICE' };
  const catalog = CATALOG[service];

  const base = catalog.bases.find((b) => b.id === baseId);
  if (!base) return { ok: false, error: 'UNKNOWN_BASE' };

  if (new Set(optionIds).size !== optionIds.length) return { ok: false, error: 'DUPLICATE_OPTION' };
  const options: CatalogItem[] = [];
  for (const id of optionIds) {
    const option = catalog.options.find((o) => o.id === id);
    if (!option) return { ok: false, error: 'UNKNOWN_OPTION' };
    options.push(option);
  }
  // Ordre canonique (celui du catalogue) : description et comparaison stables
  options.sort((a, b) => catalog.options.indexOf(a) - catalog.options.indexOf(b));

  const totalCents = (base.price + options.reduce((sum, o) => sum + o.price, 0)) * 100;
  const depositCents = Math.round(totalCents * DEPOSIT_RATE);

  return { ok: true, value: { service, base, options, totalCents, depositCents } };
}

// Libelle lisible d'une configuration : "Site vitrine + SEO avancé + Version multilingue"
export function describeConfiguration(config: PricedConfiguration, lang: 'fr' | 'en'): string {
  return [config.base, ...config.options].map((item) => item.label[lang]).join(' + ');
}
