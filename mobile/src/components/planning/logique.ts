/**
 * Règles d’affichage du planning : ce qu’un jour donné montre, dans quelle
 * section, dans quel ordre, et le compteur de l’en-tête. Fonctions pures,
 * sans dépendance à l’interface.
 */

import { differenceInCalendarDays, format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

import { estPassagePret, manque, pasArrivee, type aTraiter } from '@/domain/echeances';
import { estBloquee } from '@/domain/statuts';
import type { Evenement, Intervention, Statut } from '@/domain/types';
import { duree, heure, jourRelatif } from '@/lib/format';

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

/** Événements regroupés par intervention : une seule passe pour toutes les cartes. */
export function evenementsParIntervention(evenements: Evenement[]): Map<string, Evenement[]> {
  const table = new Map<string, Evenement[]>();
  for (const e of evenements) {
    const liste = table.get(e.interventionId);
    if (liste) liste.push(e);
    else table.set(e.interventionId, [e]);
  }
  return table;
}

/**
 * Date du plus récent événement de ce type (et de cette valeur) pour
 * l’intervention. Un événement daté après `maintenant` (horloge du téléphone
 * en retard, jeu de démonstration) est ignoré : jamais d’ancienneté négative.
 */
function dernierEvenement(i: Intervention, evenements: Evenement[], type: Evenement['type'], valeur: string | undefined, maintenant: Date): string | null {
  const limite = maintenant.getTime();
  let dernier: string | null = null;
  for (const e of evenements) {
    if (e.interventionId !== i.id || e.type !== type || (valeur !== undefined && e.valeur !== valeur)) continue;
    if (new Date(e.creeLe).getTime() > limite) continue;
    if (!dernier || e.creeLe > dernier) dernier = e.creeLe;
  }
  return dernier;
}

/** Arrivée au garage : le passage en « Véhicule reçu » le plus récent, sinon le créneau. */
export function depuisReception(i: Intervention, evenements: Evenement[], maintenant: Date = new Date()): string {
  return dernierEvenement(i, evenements, 'statut', 'recu', maintenant) ?? i.debut;
}

/**
 * Début de l’état affiché sur la carte : le blocage en cours depuis qu’il a
 * été posé, « Prêt » depuis le passage en Prêt. null si rien n’est tracé
 * (fiche importée) : la carte s’affiche alors comme en v1.
 */
export function depuisEtat(i: Intervention, evenements: Evenement[], maintenant: Date = new Date()): string | null {
  if (estBloquee(i) && i.blocage) {
    // Une précision (même blocage avant et après) ne remet pas l’ancienneté à zéro.
    const poses = evenements.filter((e) => e.type !== 'blocage' || (e.avant ?? null) !== e.valeur);
    return dernierEvenement(i, poses, 'blocage', i.blocage, maintenant);
  }
  // Une livraison annulée n’est pas un nouveau passage en Prêt : l’ancienneté continue.
  if (i.statut === 'termine') return dernierEvenement(i, evenements.filter(estPassagePret), 'statut', 'termine', maintenant);
  return null;
}

/** Les jours à venir lus « jeu. 08:30 » sur la carte ; au-delà, la date. */
const JOURS_PROCHES = 6;

export type QuandCarte = {
  /** Colonne de droite de la carte : « 08:30 », « jeu. 08:30 », « depuis 3 j »… */
  texte: string;
  /** Retard ou créneau dépassé : affiché en ambre */
  alerte: boolean;
  /** Même information pour VoiceOver, en toutes lettres */
  lu: string;
  /** Ancienneté d’une voiture au garage depuis un jour passé (« depuis 3 j ») : la durée prévue ne s’affiche pas à côté */
  anciennete?: boolean;
};

/**
 * Quand, pour la carte : l’heure si le créneau tombe le jour affiché, le jour
 * et l’heure dans les six jours qui viennent, l’ancienneté pour une voiture
 * immobilisée dont le créneau est un jour passé (jamais un jour abrégé qui
 * ferait croire à un rendez-vous), et les retards en alerte. « en retard » :
 * même règle que la puce « Pas arrivées » du bandeau (`pasArrivee`, créneau
 * commencé depuis plus de 15 min), pour qu’une voiture comptée là le dise
 * aussi sur sa carte.
 */
export function quandCarte(i: Intervention, jour: Date, maintenant: Date, evenements: Evenement[]): QuandCarte {
  const debut = new Date(i.debut);
  const complet = format(debut, "EEEE d MMMM 'à' HH:mm", { locale: fr });
  if (i.statut === 'a_valider' && debut < maintenant) {
    return { texte: 'créneau dépassé', alerte: true, lu: `créneau du ${complet} dépassé` };
  }
  if (isSameDay(debut, jour)) {
    const enRetard = pasArrivee(i, maintenant);
    return enRetard
      ? { texte: `${heure(i.debut)} · en retard`, alerte: true, lu: `rendez-vous à ${heure(i.debut)}, en retard` }
      : { texte: heure(i.debut), alerte: false, lu: `rendez-vous ${complet}` };
  }
  const ecart = differenceInCalendarDays(debut, maintenant);
  // Rendez-vous manqué (jour passé, jamais reçu) : le jour et l’heure, « en retard » en toutes lettres.
  if (manque(i, maintenant)) {
    const j = ecart === -1 ? 'hier' : format(debut, 'EEE d', { locale: fr });
    return { texte: `${j} ${heure(i.debut)} · en retard`, alerte: true, lu: `rendez-vous ${complet}, pas arrivée` };
  }
  // Seul un véhicule physiquement au garage dit « depuis » : une pièce
  // commandée avant l’arrivée (planifié bloqué) n’immobilise rien.
  if (ecart < 0 && estImmobilisee(i)) {
    const arrivee = depuisReception(i, evenements, maintenant);
    const jours = differenceInCalendarDays(maintenant, new Date(arrivee));
    if (jours <= 0) return { texte: `depuis ${heure(arrivee)}`, alerte: false, lu: `au garage depuis ${heure(arrivee)}`, anciennete: true };
    if (jours === 1) return { texte: 'depuis hier', alerte: false, lu: 'au garage depuis hier', anciennete: true };
    return { texte: `depuis ${jours} j`, alerte: false, lu: `au garage depuis ${jours} jours`, anciennete: true };
  }
  if (ecart >= 0 && ecart <= JOURS_PROCHES) {
    const j = ecart === 0 ? 'auj.' : format(debut, 'EEE', { locale: fr });
    return { texte: `${j} ${heure(i.debut)}`, alerte: false, lu: `rendez-vous ${complet}` };
  }
  return { texte: format(debut, 'd MMM', { locale: fr }), alerte: false, lu: `rendez-vous ${complet}` };
}

/**
 * Une intervention apparaît le jour sélectionné si son créneau tombe ce
 * jour, ou si le véhicule est immobilisé (reçu, en cours, prêt, bloqué) :
 * il reste visible chaque jour jusqu’à la livraison. Les demandes à valider
 * restent visibles tant qu’elles attendent une réponse. Un rendez-vous
 * confirmé d’un jour passé, jamais reçu (`manque`), reste sur le planning
 * d’aujourd’hui, compté dans « Pas arrivées », jusqu’à ce qu’on le reçoive,
 * le déplace ou l’annule.
 */
export function visibleCeJour(i: Intervention, jour: Date, evenements: Evenement[], maintenant: Date = new Date()): boolean {
  if (i.statut === 'annule') return false;
  if (i.statut === 'livre') return isSameDay(new Date(dateLivraison(i, evenements)), jour);
  if (i.statut === 'a_valider') return true;
  if (estImmobilisee(i) || estBloquee(i)) return true;
  if (manque(i, maintenant) && isSameDay(jour, maintenant)) return true;
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

/**
 * « Votre journée » (charge du jour affiché, `chargeDuJour`) :
 * « 4 voitures · 4 h 45 prévues », « 1 voiture · 1 h prévue »,
 * « aucune voiture prévue ».
 */
export function texteJournee(c: { nb: number; minutes: number }): string {
  if (c.nb === 0) return 'aucune voiture prévue';
  if (c.minutes <= 0) return `${pluriel(c.nb, 'voiture')} prévue${c.nb > 1 ? 's' : ''}`;
  // L’accord se fait avec la durée : « 1 h prévue », « 45 min prévues », « 4 h 45 prévues ».
  return `${pluriel(c.nb, 'voiture')} · ${duree(c.minutes)} ${c.minutes === 60 ? 'prévue' : 'prévues'}`;
}

// ── Bandeau « À traiter » (v2c, repris de la v2b)

export type FiltreATraiter = keyof ReturnType<typeof aTraiter>;

/** Puces du bandeau, dans l’ordre de la tournée du chef : attribuer, rattraper, prévenir, relancer. */
export const FILTRES_A_TRAITER: { cle: FiltreATraiter; label: string; ton: 'warn' | 'danger' }[] = [
  { cle: 'aAttribuer', label: 'À attribuer', ton: 'warn' },
  { cle: 'enRetard', label: 'En retard', ton: 'danger' },
  { cle: 'aPrevenir', label: 'À prévenir', ton: 'warn' },
  { cle: 'pasArrivees', label: 'Pas arrivées', ton: 'warn' },
];

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
      return 'Bloquées';
    case 'atelier':
      return libelleJour(jour);
    case 'pretes':
      return 'Prêtes à livrer';
    case 'livrees':
      return 'Livrées';
  }
}
