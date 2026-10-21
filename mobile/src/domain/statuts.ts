/**
 * Cycle de vie d'une intervention : libellés, couleurs et transitions.
 * Les écrans n'inventent jamais un bouton : ils demandent `actionsPossibles`.
 */

import type { Blocage, Intervention, Origine, Statut } from './types';

export type StatutInfo = {
  label: string;
  /** Libellé court pour les pastilles */
  court: string;
  /** Clés de couleur du thème (voir tokens.ts) */
  couleur: 'accent' | 'ok' | 'warn' | 'muted' | 'danger';
  /** Phrase affichée au client sur sa page de suivi */
  client: string;
};

export const STATUTS: Record<Statut, StatutInfo> = {
  a_valider: {
    label: 'À valider',
    court: 'À valider',
    couleur: 'warn',
    client: 'Demande reçue, le garage vous confirme le créneau.',
  },
  planifie: {
    label: 'Rendez-vous confirmé',
    court: 'Planifié',
    couleur: 'accent',
    client: 'Rendez-vous confirmé.',
  },
  recu: {
    label: 'Véhicule reçu',
    court: 'Reçu',
    couleur: 'accent',
    client: 'Votre véhicule est au garage.',
  },
  en_cours: {
    label: 'En cours',
    court: 'En cours',
    couleur: 'accent',
    client: 'Intervention en cours.',
  },
  termine: {
    label: 'Véhicule prêt',
    court: 'Prêt',
    couleur: 'ok',
    client: 'Votre véhicule est prêt, vous pouvez venir le récupérer.',
  },
  livre: {
    label: 'Livré',
    court: 'Livré',
    couleur: 'muted',
    client: 'Véhicule restitué. Merci de votre confiance.',
  },
  annule: {
    label: 'Annulé',
    court: 'Annulé',
    couleur: 'muted',
    client: 'Rendez-vous annulé.',
  },
};

/** Ordre d'affichage dans les listes et le kanban. */
export const ORDRE_STATUTS: Statut[] = [
  'a_valider',
  'planifie',
  'recu',
  'en_cours',
  'termine',
  'livre',
  'annule',
];

/** Statuts « vivants » : ce qui occupe l'atelier aujourd'hui. */
export const STATUTS_ACTIFS: Statut[] = ['a_valider', 'planifie', 'recu', 'en_cours', 'termine'];

export const BLOCAGES: Record<Blocage, { label: string; client: string }> = {
  attente_piece: { label: 'Attente pièce', client: 'En attente d’une pièce.' },
  attente_accord: { label: 'Attente accord', client: 'Un devis vous attend, le garage a besoin de votre accord.' },
  rappeler_client: { label: 'Rappeler le client', client: 'Le garage va vous rappeler.' },
  client_sur_place: { label: 'Client sur place', client: 'Intervention en cours.' },
};

export const ORIGINES: Record<Origine, { label: string; court: string }> = {
  site: { label: 'Site internet', court: 'Site' },
  telephone: { label: 'Téléphone', court: 'Tél.' },
  ia: { label: 'Réceptionniste', court: 'IA' },
  comptoir: { label: 'Comptoir', court: 'Comptoir' },
};

/** Transitions autorisées depuis chaque statut. */
const TRANSITIONS: Record<Statut, Statut[]> = {
  a_valider: ['planifie', 'annule'],
  planifie: ['recu', 'en_cours', 'annule'],
  recu: ['en_cours', 'annule'],
  en_cours: ['termine', 'recu'],
  termine: ['livre', 'en_cours'],
  livre: [],
  annule: ['planifie'],
};

export type Action =
  | { type: 'statut'; vers: Statut; label: string; principal: boolean }
  | { type: 'blocage'; vers: Blocage | null; label: string; principal: false };

/** Libellé du bouton qui mène à un statut. */
const VERBES: Record<Statut, string> = {
  a_valider: 'Remettre à valider',
  planifie: 'Confirmer le rendez-vous',
  recu: 'Véhicule reçu',
  en_cours: 'Démarrer',
  termine: 'Véhicule prêt',
  livre: 'Livré au client',
  annule: 'Annuler',
};

/**
 * Boutons à proposer pour une intervention, le premier étant l'action
 * principale (le « geste suivant » évident).
 */
export function actionsPossibles(i: Pick<Intervention, 'statut' | 'blocage'>): Action[] {
  const suivants = TRANSITIONS[i.statut];
  const actions: Action[] = suivants.map((vers, idx) => ({
    type: 'statut',
    vers,
    label: VERBES[vers],
    principal: idx === 0 && vers !== 'annule',
  }));

  if (i.statut === 'recu' || i.statut === 'en_cours' || i.statut === 'planifie') {
    if (i.blocage) {
      actions.push({ type: 'blocage', vers: null, label: 'Débloquer', principal: false });
    } else {
      actions.push(
        { type: 'blocage', vers: 'attente_piece', label: 'Attente pièce', principal: false },
        { type: 'blocage', vers: 'attente_accord', label: 'Demander l’accord', principal: false },
        { type: 'blocage', vers: 'rappeler_client', label: 'À rappeler', principal: false },
      );
    }
  }
  return actions;
}

export function peutPasser(de: Statut, vers: Statut): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** Une intervention bloquée demande une action humaine. */
export function estBloquee(i: Pick<Intervention, 'blocage' | 'statut'>): boolean {
  return i.blocage !== null && i.statut !== 'livre' && i.statut !== 'annule';
}
