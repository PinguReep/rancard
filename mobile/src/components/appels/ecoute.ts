/**
 * Règles du lecteur et du fil de la conversation d'un appel : réplique en
 * cours, instant de départ d'une réplique touchée, minutage affiché et lu,
 * vitesses.
 */

import type { Replique } from '@/domain/types';

/** Recul et avance des boutons du lecteur, en secondes. */
export const SAUT_S = 10;

/** Vitesses proposées, dans l'ordre du bouton. */
export const VITESSES = [1, 1.5, 2] as const;
export type Vitesse = (typeof VITESSES)[number];

/**
 * Une réplique touchée se lit un peu avant son instant : l'instant
 * d'ElevenLabs est celui du début du tour, arrondi à la seconde.
 */
const AVANCE_S = 0.4;

/**
 * Tolérance de la mise en évidence : la réplique devient « en cours »
 * un instant avant son début, pour que le surlignage n'arrive pas en retard.
 */
const ANTICIPATION_S = 0.2;

/** Index de la réplique en cours à cette position (la dernière commencée), -1 avant la première. */
export function repliqueCourante(repliques: readonly Replique[], position: number): number {
  let courante = -1;
  for (let i = 0; i < repliques.length; i++) {
    if (repliques[i].t <= position + ANTICIPATION_S) courante = i;
    else break;
  }
  return courante;
}

export function departDe(r: Replique): number {
  return Math.max(0, r.t - AVANCE_S);
}

/** « 0:05 », « 1:42 », « 12:03 ». */
export function minutage(secondes: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(secondes) ? secondes : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pour VoiceOver : « 1 minute 42 secondes », « 5 secondes », « 0 seconde ». */
export function minutageParle(secondes: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(secondes) ? secondes : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const sec = `${r} seconde${r > 1 ? 's' : ''}`;
  if (!m) return sec;
  const min = `${m} minute${m > 1 ? 's' : ''}`;
  return r ? `${min} ${sec}` : min;
}

/** « 1× », « 1,5× », « 2× ». */
export function libelleVitesse(v: number): string {
  return `${String(v).replace('.', ',')}×`;
}

export function vitesseSuivante(v: number): Vitesse {
  const i = VITESSES.indexOf(v as Vitesse);
  return VITESSES[(i + 1) % VITESSES.length];
}

/** Prénom de l'appelant pour le fil (« Nicolas »), sinon « Appelant ». */
export function nomDansLeFil(appelant: string | undefined): string {
  const prenom = appelant?.trim().split(/\s+/)[0];
  return prenom || 'Appelant';
}
