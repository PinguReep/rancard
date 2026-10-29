/**
 * Choix rapides de la nouvelle intervention : prestations courantes,
 * durées, jours à venir et créneaux calculés à partir des horaires du
 * garage. Sans aucun horaire renseigné, une plage par défaut (8h à 18h)
 * évite l'impasse « aucun créneau ». Aucune dépendance à l'interface.
 */

import { addDays, addMinutes, format, isSameDay, isToday, isTomorrow, setHours, setMinutes, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

import type { Garage } from '@/domain/types';

export const PRESTATIONS = [
  'Vidange',
  'Révision',
  'Freinage',
  'Pneus',
  'Diagnostic',
  'Climatisation',
  'Distribution',
  'Embrayage',
  'Carrosserie',
] as const;

export const DUREES: { min: number; label: string }[] = [
  { min: 30, label: '30 min' },
  { min: 60, label: '1 h' },
  { min: 120, label: '2 h' },
  { min: 240, label: 'Demi-journée' },
  { min: 480, label: 'Journée' },
];

export const DUREE_PAR_DEFAUT = 60;

/** Plage proposée quand le garage n'a renseigné aucun horaire. */
export const PLAGE_PAR_DEFAUT = { de: '08:00', a: '18:00' } as const;

export type Jour = {
  /** Clé stable « yyyy-MM-dd » */
  cle: string;
  date: Date;
  /** « Aujourd’hui », « Demain », « jeu. 21 sept. » */
  label: string;
  ferme: boolean;
};

export type Creneau = { iso: string; label: string; passe: boolean };

const cleDe = (d: Date) => format(d, 'yyyy-MM-dd');

function libelleJour(d: Date): string {
  if (isToday(d)) return 'Aujourd’hui';
  if (isTomorrow(d)) return 'Demain';
  return format(d, 'EEE d MMM', { locale: fr });
}

/** Au moins un jour d'ouverture est renseigné. */
export function horairesRenseignes(horaires: Garage['horaires']): boolean {
  return Object.values(horaires).some((h) => h !== null && h !== undefined);
}

/** Plage d'ouverture d'un jour : celle du garage, ou la plage par défaut s'il n'en a renseigné aucune. */
export function plageDuJour(horaires: Garage['horaires'], jour: Date): { de: string; a: string } | null {
  const h = horaires[jour.getDay()];
  if (h) return h;
  return horairesRenseignes(horaires) ? null : PLAGE_PAR_DEFAUT;
}

/** Les n prochains jours à partir d'aujourd'hui, fermés inclus (désactivés). */
export function joursProchains(horaires: Garage['horaires'], n = 7, depuis = new Date()): Jour[] {
  const debut = startOfDay(depuis);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(debut, i);
    return { cle: cleDe(date), date, label: libelleJour(date), ferme: !plageDuJour(horaires, date) };
  });
}

const aHeure = (jour: Date, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return setMinutes(setHours(startOfDay(jour), h ?? 0), m ?? 0);
};

/** Créneaux d'un jour par pas de 30 min entre l'ouverture et la fermeture (exclue). */
export function creneauxDuJour(jour: Date, horaires: Garage['horaires'], maintenant = new Date(), pas = 30): Creneau[] {
  const h = plageDuJour(horaires, jour);
  if (!h) return [];
  const fin = aHeure(jour, h.a);
  const liste: Creneau[] = [];
  for (let d = aHeure(jour, h.de); d < fin; d = addMinutes(d, pas)) {
    liste.push({ iso: d.toISOString(), label: format(d, "H'h'mm"), passe: isSameDay(d, maintenant) && d <= maintenant });
  }
  return liste;
}

/** Premier créneau encore à venir d'un jour, pour proposer une valeur par défaut. */
export function premierCreneauLibre(jour: Date, horaires: Garage['horaires'], maintenant = new Date()): Creneau | undefined {
  return creneauxDuJour(jour, horaires, maintenant).find((c) => !c.passe);
}

/** Premier jour (dans la liste) qui a encore un créneau à venir. */
export function premierJourDisponible(jours: Jour[], horaires: Garage['horaires'], maintenant = new Date()): Jour | undefined {
  return jours.find((j) => !j.ferme && premierCreneauLibre(j.date, horaires, maintenant));
}

// ── v2c (E5) : ajouts seulement, les signatures ci-dessus ne changent pas.

/** Clé « yyyy-MM-dd » d'un jour (heure locale). */
export const cleJour = (d: Date) => cleDe(d);

/** Jour (minuit, heure locale) d'une clé « yyyy-MM-dd » ; invalide : aujourd'hui. */
export function jourDeCle(cle: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cle);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : startOfDay(new Date());
}

/**
 * Arrivée d'une voiture « Déjà au garage » : l'heure réelle, arrondie au
 * quart d'heure inférieur (10:52 → 10:45). Jamais un créneau à venir.
 */
export function arriveeMaintenant(maintenant = new Date()): string {
  const d = new Date(maintenant);
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 15), 0, 0);
  return d.toISOString();
}

/** ISO d'un jour à « HH:mm » (heure locale). */
export const aHeureIso = (jour: Date, hm: string) => aHeure(jour, hm).toISOString();

/** Fermeture d'un jour (ISO), ou null s'il est fermé. */
export function fermetureDu(horaires: Garage['horaires'], jour: Date): string | null {
  const h = plageDuJour(horaires, jour);
  return h ? aHeureIso(jour, h.a) : null;
}

/** Premier jour ouvert strictement après `jour` (deux semaines au plus), à minuit. */
export function jourOuvertSuivant(horaires: Garage['horaires'], jour: Date): Date | null {
  for (let k = 1; k <= 14; k++) {
    const d = addDays(startOfDay(jour), k);
    if (plageDuJour(horaires, d)) return d;
  }
  return null;
}

/**
 * Heures libres d'un jour pour le retour prévu : 12:00, 14:00, 17:00 et la
 * fermeture, dans la plage d'ouverture (ou la plage par défaut) et
 * strictement après `apres` (l'arrivée de la voiture, ou maintenant).
 */
export function heuresRetour(horaires: Garage['horaires'], jour: Date, apres: Date): string[] {
  const h = plageDuJour(horaires, jour);
  if (!h) return [];
  const de = aHeure(jour, h.de);
  const a = aHeure(jour, h.a);
  return [...new Set(['12:00', '14:00', '17:00', h.a])]
    .map((hm) => ({ hm, d: aHeure(jour, hm) }))
    .filter(({ d }) => d >= de && d <= a && d > apres)
    .sort((x, y) => x.d.getTime() - y.d.getTime())
    .map(({ hm }) => hm);
}
