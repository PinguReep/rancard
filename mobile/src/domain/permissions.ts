/**
 * Rôles, postes et permissions.
 *
 * Deux rôles seulement : le gérant a tous les droits et gère l'équipe ;
 * l'employé a des permissions à la carte, préremplies par son poste. Le
 * gérant peut ajouter d'autres gérants depuis son téléphone.
 */

import { memeJour } from '@/lib/format';

import type { Commentaire, Membre, Permissions, Poste, Role, Statut } from './types';

export const ROLES: Record<Role, { label: string; description: string }> = {
  gerant: { label: 'Gérant', description: 'Tous les droits, gère l’équipe et les réglages.' },
  employe: { label: 'Employé', description: 'Accès selon les permissions cochées.' },
};

export const POSTES: Record<Poste, { label: string; permissions: Permissions }> = {
  mecanicien: {
    label: 'Mécanicien',
    permissions: { voirTout: false, voirPrix: false, creer: false, appels: false, activite: false },
  },
  receptionnaire: {
    label: 'Réceptionnaire',
    permissions: { voirTout: true, voirPrix: true, creer: true, appels: true, activite: false },
  },
  chef_atelier: {
    label: 'Chef d’atelier',
    permissions: { voirTout: true, voirPrix: true, creer: true, appels: true, activite: true },
  },
};

export const PERMISSIONS_LABELS: Record<keyof Permissions, { label: string; aide: string }> = {
  voirTout: { label: 'Voir tout le planning', aide: 'Sinon, seulement ses interventions.' },
  voirPrix: { label: 'Voir les montants', aide: 'Devis et prix sur les fiches.' },
  creer: { label: 'Créer des interventions', aide: 'Nouveau client, nouveau rendez-vous.' },
  appels: { label: 'Voir les appels', aide: 'Appels pris par le réceptionniste.' },
  activite: { label: 'Voir l’activité', aide: 'Chiffres de la semaine.' },
};

export const TOUTES_PERMISSIONS: Permissions = {
  voirTout: true,
  voirPrix: true,
  creer: true,
  appels: true,
  activite: true,
};

/** Permissions effectives : un gérant a tout, quel que soit ce qui est stocké. */
export function permissionsDe(m: Pick<Membre, 'role' | 'permissions'>): Permissions {
  return m.role === 'gerant' ? TOUTES_PERMISSIONS : m.permissions;
}

export function peut(m: Pick<Membre, 'role' | 'permissions'>, p: keyof Permissions): boolean {
  return permissionsDe(m)[p];
}

export function estGerant(m: Pick<Membre, 'role'>): boolean {
  return m.role === 'gerant';
}

// ── Gestes réservés (v2c) : mêmes règles que les refus R1 à R3 et R7 à R9 du serveur

/** Une note visible du client se retire pendant ce temps après sa publication (P1). Réexportée par journal.ts. */
export const FENETRE_RETRAIT_NOTE_MIN = 10;

type Qui = Pick<Membre, 'role' | 'permissions'>;

/** « Livré au client », « Livrer » : `voirPrix` (le poste Mécanicien ne l’a pas, D3). */
export function peutLivrer(m: Qui): boolean {
  return permissionsDe(m).voirPrix;
}

/** « Annuler l’intervention » : `creer` ; ignorer une fiche « À valider » : `appels` suffit. */
export function peutAnnulerIntervention(m: Qui, depuis: Statut): boolean {
  const p = permissionsDe(m);
  return p.creer || (p.appels && depuis === 'a_valider');
}

/** « Annuler la livraison » : un gérant, le jour même de la livraison (`livreLe`, ISO). */
export function peutAnnulerLivraison(m: Pick<Membre, 'role'>, livreLe: string | null | undefined, maintenant: Date = new Date()): boolean {
  return estGerant(m) && Boolean(livreLe) && memeJour(new Date(livreLe!), maintenant);
}

/**
 * Retirer une note de la page du client (P1) : son auteur ou un gérant, pour
 * une note visible du client écrite par un membre (pas une phrase
 * automatique liée à un événement), publiée il y a moins de
 * `FENETRE_RETRAIT_NOTE_MIN` minutes et jamais retirée.
 */
export function peutRetirerNote(
  m: Pick<Membre, 'id' | 'role'>,
  c: Pick<Commentaire, 'auteurId' | 'visibleClient' | 'evenementId' | 'automatique' | 'creeLe' | 'retireeLe'>,
  maintenant: Date = new Date(),
): boolean {
  // Phrase automatique (liée, ou écrite par « Annuler » après un SMS « prêt ») : jamais retirable.
  if (!c.visibleClient || c.evenementId || c.automatique || c.retireeLe || !c.auteurId) return false;
  if (c.auteurId !== m.id && !estGerant(m)) return false;
  return maintenant.getTime() - new Date(c.creeLe).getTime() < FENETRE_RETRAIT_NOTE_MIN * 60_000;
}

export function initiales(m: Pick<Membre, 'prenom' | 'nom'>): string {
  return `${m.prenom[0] ?? ''}${m.nom[0] ?? ''}`.toUpperCase();
}
