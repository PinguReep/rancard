/**
 * Rôles, postes et permissions.
 *
 * Deux rôles seulement : le gérant a tous les droits et gère l'équipe ;
 * l'employé a des permissions à la carte, préremplies par son poste. Le
 * gérant peut ajouter d'autres gérants depuis son téléphone.
 */

import type { Membre, Permissions, Poste, Role } from './types';

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

/** Permissions effectives : un gérant a tout, quel que soit ce qui est stocké. */
export function permissionsDe(m: Pick<Membre, 'role' | 'permissions'>): Permissions {
  return m.role === 'gerant' ? TOUTES_PERMISSIONS : m.permissions;
}

export function peut(m: Pick<Membre, 'role' | 'permissions'>, p: keyof Permissions): boolean {
  return permissionsDe(m)[p];
}

export function estGerant(m: Pick<Membre, 'role'>): boolean {
  return m.role === 'gerant';
}

export function initiales(m: Pick<Membre, 'prenom' | 'nom'>): string {
  return `${m.prenom[0] ?? ''}${m.nom[0] ?? ''}`.toUpperCase();
}
