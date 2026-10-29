/**
 * Appel en direct du réceptionniste : quand un appel « en cours » l'est
 * vraiment, et comment nommer ses étapes.
 */

import type { Appel, EtapeAppel, EtatTransfert } from './types';

/**
 * Au-delà de 15 minutes après son début, un appel n'est plus en direct,
 * même si le compte rendu de fin d'appel n'est jamais arrivé : durée
 * maximale d'un appel du réceptionniste (5 minutes) plus le temps
 * d'analyse, avec de la marge. Même règle côté serveur (migration 0012,
 * fonction Edge agent-outils), qui referme ces appels au début du suivant.
 */
export const APPEL_EN_DIRECT_MAX_MIN = 15;

/**
 * Appel passé à l'équipe (0016) : la sonnerie dure une vingtaine de secondes
 * (au-delà de 2 minutes sans nouvelle, elle est finie) ; une conversation
 * avec l'équipe reste « en direct » 2 heures au plus sans compte rendu de fin.
 */
export const SONNERIE_MAX_MIN = 2;
export const APPEL_EQUIPE_MAX_MIN = 120;

const depuis = (iso: string | undefined, maintenant: number) => {
  const t = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(t) ? maintenant - t : Number.POSITIVE_INFINITY;
};

/** Les téléphones de l'équipe sonnent, ou un membre parle au client. */
export function transfertEnDirect(a: Pick<Appel, 'transfert'>, maintenant = Date.now()): boolean {
  const t = a.transfert;
  if (!t) return false;
  if (t.etat === 'sonne') return depuis(t.le, maintenant) < SONNERIE_MAX_MIN * 60_000;
  if (t.etat === 'en_ligne') return depuis(t.prisLe ?? t.le, maintenant) < APPEL_EQUIPE_MAX_MIN * 60_000;
  return false;
}

export function appelEnDirect(a: Pick<Appel, 'enCours' | 'debut' | 'transfert'>, maintenant = Date.now()): boolean {
  // Le compte rendu du réceptionniste arrive pendant la conversation avec l'équipe : le transfert prime.
  if (transfertEnDirect(a, maintenant)) return true;
  if (!a.enCours || (a.transfert && a.transfert.etat !== 'echec')) return false;
  const debut = new Date(a.debut).getTime();
  return Number.isFinite(debut) && maintenant - debut < APPEL_EN_DIRECT_MAX_MIN * 60_000;
}

/**
 * Conservation de la conversation d'un appel (transcription et
 * enregistrement) : 90 jours, puis effacement. Même valeur côté serveur
 * (migration 0018, `ecoute_conservation()`).
 */
export const CONSERVATION_ECOUTE_JOURS = 90;

/**
 * Juste après l'appel, l'enregistrement est récupéré en quelques secondes.
 * Au-delà de 10 minutes, une récupération qui n'a pas abouti ne le fera
 * plus : l'enregistrement est indisponible.
 */
export const ATTENTE_AUDIO_MAX_MIN = 10;

export const LIBELLES_TRANSFERT: Record<EtatTransfert, string> = {
  sonne: 'Sonnerie de l’équipe',
  en_ligne: 'En ligne avec l’équipe',
  termine: 'Pris par l’équipe',
  sans_reponse: 'Personne n’a décroché',
  echec: 'Passage à l’équipe impossible',
};

export const LIBELLES_ETAPE: Record<EtapeAppel, string> = {
  accueil: 'Accueil',
  identification: 'Identification',
  vehicule: 'Véhicule',
  motif: 'Motif de l’appel',
  reformulation: 'Reformulation',
  transfert: 'Transfert vers l’équipe',
  cloture: 'Fin de l’appel',
};
