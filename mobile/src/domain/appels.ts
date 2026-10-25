/**
 * Appel en direct du réceptionniste : quand un appel « en cours » l'est
 * vraiment, et comment nommer ses étapes.
 */

import type { Appel, EtapeAppel } from './types';

/**
 * Au-delà de 15 minutes après son début, un appel n'est plus en direct,
 * même si le compte rendu de fin d'appel n'est jamais arrivé : durée
 * maximale d'un appel du réceptionniste (5 minutes) plus le temps
 * d'analyse, avec de la marge. Même règle côté serveur (migration 0012,
 * fonction Edge agent-outils), qui referme ces appels au début du suivant.
 */
export const APPEL_EN_DIRECT_MAX_MIN = 15;

export function appelEnDirect(a: Pick<Appel, 'enCours' | 'debut'>, maintenant = Date.now()): boolean {
  if (!a.enCours) return false;
  const debut = new Date(a.debut).getTime();
  return Number.isFinite(debut) && maintenant - debut < APPEL_EN_DIRECT_MAX_MIN * 60_000;
}

export const LIBELLES_ETAPE: Record<EtapeAppel, string> = {
  accueil: 'Accueil',
  identification: 'Identification',
  vehicule: 'Véhicule',
  motif: 'Motif de l’appel',
  reformulation: 'Reformulation',
  transfert: 'Transfert vers l’équipe',
  cloture: 'Fin de l’appel',
};
