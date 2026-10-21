/**
 * Mise en forme française : dates relatives, heures, plaques, téléphones,
 * montants. Aucune dépendance à l'interface.
 */

import { differenceInCalendarDays, format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';

export const heure = (iso: string) => format(new Date(iso), 'HH:mm');

/** « aujourd’hui », « demain », « hier », « lundi 21 juil. » */
export function jourRelatif(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return 'aujourd’hui';
  if (isTomorrow(d)) return 'demain';
  if (isYesterday(d)) return 'hier';
  const ecart = Math.abs(differenceInCalendarDays(d, new Date()));
  return ecart < 7 ? format(d, 'EEEE d MMM', { locale: fr }) : format(d, 'd MMM yyyy', { locale: fr });
}

/** « aujourd’hui 11h00 », « demain 8h30 » */
export function quand(iso: string): string {
  return `${jourRelatif(iso)} ${format(new Date(iso), "H'h'mm")}`;
}

export const dateLongue = (iso: string) => format(new Date(iso), 'EEEE d MMMM yyyy', { locale: fr });
export const dateCourte = (iso: string) => format(new Date(iso), 'dd/MM/yyyy');

/** « il y a 4 min », « il y a 2 h », « hier », « 12/02/2026 » */
export function ilYA(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24 && isToday(new Date(iso))) return `il y a ${h} h`;
  if (isYesterday(new Date(iso))) return 'hier';
  return dateCourte(iso);
}

export function duree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (minutes >= 480) return `${Math.round(minutes / 60 / 8)} j`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function dureeSecondes(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** AA-008-AA à partir d'une saisie libre ; renvoie la saisie nettoyée sinon. */
export function formaterPlaque(saisie: string): string {
  const brut = saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{2})(\d{3})([A-Z]{2})$/.exec(brut);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : saisie.toUpperCase().trim();
}

export const PLAQUE_SIV = /^[A-HJ-NP-TV-Z]{2}-\d{3}-[A-HJ-NP-TV-Z]{2}$/;

/** 06 39 98 00 11 */
export function formaterTelephone(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '').replace(/^33/, '0');
  if (chiffres.length !== 10) return saisie.trim();
  return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
}

export const telHref = (tel: string) => `tel:${tel.replace(/\s/g, '')}`;

export const kilometrage = (km?: number) => (km == null ? '' : `${km.toLocaleString('fr-FR')} km`);

export const euros = (n?: number) =>
  n == null ? '' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Remplace {prenom} et {garage} dans un gabarit de SMS. */
export function gabaritSms(texte: string, v: { prenom: string; garage: string }): string {
  return texte.replace(/\{prenom\}/g, v.prenom).replace(/\{garage\}/g, v.garage);
}
