/**
 * Règles d’affichage du planning : ce qu’un jour donné montre, dans quelle
 * section, dans quel ordre, et le compteur de l’en-tête. Fonctions pures,
 * sans dépendance à l’interface.
 */

import { isSameDay } from 'date-fns';

import { estBloquee } from '@/domain/statuts';
import type { Evenement, Intervention, Statut } from '@/domain/types';
import { jourRelatif } from '@/lib/format';

export type CleSection = 'a_valider' | 'bloquees' | 'atelier' | 'pretes' | 'livrees';

export const ORDRE_SECTIONS: CleSection[] = ['a_valider', 'bloquees', 'atelier', 'pretes', 'livrees'];

/** Statuts pour lesquels le véhicule est physiquement au garage. */
const IMMOBILISE: Statut[] = ['recu', 'en_cours', 'termine'];

export const estImmobilisee = (i: Pick<Intervention, 'statut'>) => IMMOBILISE.includes(i.statut);

/** Date de livraison : l’événement « livré » le plus récent, sinon la dernière mise à jour. */
export function dateLivraison(i: Intervention, evenements: Evenement[]): string {
  let dernier: string | null = null;
  for (const e of evenements) {
    if (e.interventionId === i.id && e.type === 'statut' && e.valeur === 'livre' && (!dernier || e.creeLe > dernier)) {
      dernier = e.creeLe;
    }
  }
  return dernier ?? i.majLe;
}

/**
 * Une intervention apparaît le jour sélectionné si son créneau tombe ce
 * jour, ou si le véhicule est immobilisé (reçu, en cours, prêt, bloqué) :
 * il reste visible chaque jour jusqu’à la livraison. Les demandes à valider
 * restent visibles tant qu’elles attendent une réponse.
 */
export function visibleCeJour(i: Intervention, jour: Date, evenements: Evenement[]): boolean {
  if (i.statut === 'annule') return false;
  if (i.statut === 'livre') return isSameDay(new Date(dateLivraison(i, evenements)), jour);
  if (i.statut === 'a_valider') return true;
  if (estImmobilisee(i) || estBloquee(i)) return true;
  return isSameDay(new Date(i.debut), jour);
}

export function sectionDe(i: Intervention): CleSection {
  if (i.statut === 'a_valider') return 'a_valider';
  if (estBloquee(i)) return 'bloquees';
  if (i.statut === 'termine') return 'pretes';
  if (i.statut === 'livre') return 'livrees';
  return 'atelier';
}

/** Prioritaires d’abord, puis par heure de début. */
export function trier(a: Intervention, b: Intervention): number {
  if (a.prioritaire !== b.prioritaire) return a.prioritaire ? -1 : 1;
  return a.debut.localeCompare(b.debut);
}

export function pluriel(n: number, un: string, plusieurs = `${un}s`): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

export type Compteur = { atelier: number; bloquees: number };

export function compteur(interventions: Intervention[]): Compteur {
  let atelier = 0;
  let bloquees = 0;
  for (const i of interventions) {
    if (estImmobilisee(i)) atelier += 1;
    if (estBloquee(i)) bloquees += 1;
  }
  return { atelier, bloquees };
}

export function sousTitreCompteur({ atelier, bloquees }: Compteur): string {
  const base = atelier === 0 ? 'Aucun véhicule à l’atelier' : `${pluriel(atelier, 'véhicule')} à l’atelier`;
  return bloquees ? `${base} · ${pluriel(bloquees, 'bloquée')}` : base;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Aujourd’hui », « Demain », « Lundi 21 sept. » */
export function libelleJour(jour: Date): string {
  return majuscule(jourRelatif(jour.toISOString()));
}

export function titreSection(cle: CleSection, jour: Date): string {
  switch (cle) {
    case 'a_valider':
      return 'À valider';
    case 'bloquees':
      return 'Bloquées, action requise';
    case 'atelier':
      return `${libelleJour(jour)} à l’atelier`;
    case 'pretes':
      return 'Prêtes à livrer';
    case 'livrees':
      return 'Livrées';
  }
}
