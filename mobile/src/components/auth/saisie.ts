/**
 * Contrôles communs aux écrans à code reçu par e-mail (activation d'un
 * compte invité, mot de passe oublié). La longueur minimale suit
 * `minimum_password_length` de supabase/config.toml.
 */

export const LONGUEUR_MOT_DE_PASSE = 8;

export function erreurSaisieCode(email: string, code: string, motDePasse: string): string | null {
  if (!email.trim()) return 'Renseignez votre adresse e-mail.';
  if (code.replace(/\D/g, '').length !== 6) return 'Le code reçu par e-mail fait 6 chiffres.';
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) return `Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  return null;
}
