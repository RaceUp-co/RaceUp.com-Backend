// Formatage monetaire partage. Extrait de services/payment.ts pour que les emails
// puissent l'utiliser sans dependre du module de paiement (qui, lui, declenche les
// emails -> import circulaire).

export function formatEuros(cents: number, lang: 'fr' | 'en'): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// Taille de fichier lisible (emails de livrables).
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
