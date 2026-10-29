/**
 * Contrôles communs aux écrans de compte : code reçu par e-mail (activation
 * d'un compte invité, mot de passe oublié, confirmation d'inscription) et
 * formulaire « Créer un compte ». La longueur minimale suit
 * `minimum_password_length` de supabase/config.toml ; les autres règles,
 * celles de la fonction Edge `inscription` (qui reste juge).
 */

import type { NouvelleInscription } from '@/data/repo';

export const LONGUEUR_MOT_DE_PASSE = 8;
/** bcrypt ne lit que 72 octets : au-delà, GoTrue refuse le mot de passe. */
const OCTETS_MOT_DE_PASSE_MAX = 72;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mot de passe choisi à l'inscription (posé sur le compte après la saisie du code) ; null s'il convient. */
export function erreurMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) return `Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  if (new TextEncoder().encode(motDePasse).length > OCTETS_MOT_DE_PASSE_MAX) return 'Le mot de passe est trop long : 72 caractères au plus.';
  return null;
}

export function erreurSaisieCode(email: string, code: string, motDePasse: string): string | null {
  if (!email.trim()) return 'Renseignez votre adresse e-mail.';
  if (code.replace(/\D/g, '').length !== 6) return 'Le code reçu par e-mail fait 6 chiffres.';
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) return `Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  return null;
}

/** Première erreur du formulaire « Créer un compte », dans l'ordre des champs ; null si tout est bon. */
export function erreurInscription(n: NouvelleInscription): string | null {
  if (!n.prenom.trim() || !n.nom.trim()) return 'Renseignez votre prénom et votre nom.';
  if (!EMAIL.test(n.email.trim())) return 'Renseignez une adresse e-mail valide.';
  const mdp = erreurMotDePasse(n.motDePasse);
  if (mdp) return mdp;
  if (!n.garage.nom.trim()) return 'Renseignez le nom du garage.';
  if (!n.garage.adresse.trim()) return 'Renseignez l’adresse du garage.';
  if (n.garage.telephone.replace(/\D/g, '').length < 8) return 'Renseignez le téléphone du garage.';
  return null;
}
