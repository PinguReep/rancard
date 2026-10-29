/**
 * Mise en forme française : dates relatives, heures, plaques, téléphones,
 * montants. Aucune dépendance à l'interface.
 */

import { differenceInCalendarDays, format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { fr } from 'date-fns/locale';

export const heure = (iso: string) => format(new Date(iso), 'HH:mm');

/** « aujourd’hui », « demain », « hier », « lundi 21 juil. » */
export function jourRelatif(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return 'aujourd’hui';
  if (isTomorrow(d)) return 'demain';
  if (isYesterday(d)) return 'hier';
  const ecart = Math.abs(differenceInCalendarDays(d, new Date()));
  return ecart < 7 ? format(d, 'EEEE d MMM', { locale: fr }) : format(d, 'd MMM yyyy', { locale: fr });
}

/** « aujourd’hui 11h00 », « demain 8h30 » */
export function quand(iso: string): string {
  return `${jourRelatif(iso)} ${format(new Date(iso), "H'h'mm")}`;
}

export const dateLongue = (iso: string) => format(new Date(iso), 'EEEE d MMMM yyyy', { locale: fr });
export const dateCourte = (iso: string) => format(new Date(iso), 'dd/MM/yyyy');

/** « il y a 4 min », « il y a 2 h », « hier », « 12/02/2026 » */
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

/**
 * Ancienneté d’un état : « 20 min », « 3 h », « 2 j ». `entier` donne la
 * forme lue par VoiceOver (« 20 minutes », « 3 heures », « 2 jours »).
 */
export function depuis(iso: string, maintenant: Date = new Date(), entier = false): string {
  const min = Math.max(1, Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 60_000));
  const [n, court, long]: [number, string, string] =
    min < 60 ? [min, 'min', 'minute'] : min < 1440 ? [Math.floor(min / 60), 'h', 'heure'] : [Math.floor(min / 1440), 'j', 'jour'];
  return entier ? `${n} ${long}${n > 1 ? 's' : ''}` : `${n} ${court}`;
}

// ── v2c : formats du § 1.6 de la spécification (heure locale de l’appareil, Europe/Paris au garage)

/** Même jour calendaire (heure locale). */
export const memeJour = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Minuit pile en heure locale : une date saisie sans heure (« pièce jeudi », « retour jeudi »). */
export function sansHeure(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0;
}

/** « mar. 27 oct. » : jour court absolu (fil, notifications, avis). */
export const jourCourt = (iso: string) => format(new Date(iso), 'EEE d MMM', { locale: fr });

/** « mar. 27 oct. 11:00 » */
export const jourHeure = (iso: string) => `${jourCourt(iso)} ${heure(iso)}`;

/**
 * Horodatage absolu d’une ligne du fil : « 11:05 » aujourd’hui, « hier 11:05 »,
 * « lun. 26 oct. 11:05 » sinon (fin du relatif « il y a 2 h »).
 */
export function horodatageFil(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  if (memeJour(d, maintenant)) return heure(iso);
  if (differenceInCalendarDays(d, maintenant) === -1) return `hier ${heure(iso)}`;
  return jourHeure(iso);
}

/** Minutes écoulées entre `iso` et `maintenant`, au moins 1. */
const minutesDepuis = (iso: string, maintenant: Date) =>
  Math.max(1, Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 60_000));

/** Ancienneté : « 20 min », « 1 h 20 », « 3 h », « 2 j » (au-delà de 24 h, en jours). */
export function depuisCourt(iso: string, maintenant: Date = new Date()): string {
  const min = minutesDepuis(iso, maintenant);
  if (min < 60) return `${min} min`;
  if (min < 1440) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  return `${Math.floor(min / 1440)} j`;
}

/** Forme parlée de `depuisCourt` (lecteur d’écran) : « 20 minutes », « 1 heure 20 », « 2 jours ». */
export function depuisLong(iso: string, maintenant: Date = new Date()): string {
  const min = minutesDepuis(iso, maintenant);
  const s = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  if (min < 60) return s(min, 'minute');
  if (min < 1440) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${s(h, 'heure')} ${m}` : s(h, 'heure');
  }
  return s(Math.floor(min / 1440), 'jour');
}

const procheDe = (iso: string, maintenant: Date) => Math.abs(differenceInCalendarDays(new Date(iso), maintenant)) <= 6;

/** Repère de carte : « jeu. 29 » dans les 6 jours (avant ou après), « 24 oct. » au-delà (jamais un jour abrégé seul). */
export function jourProche(iso: string, maintenant: Date = new Date()): string {
  return format(new Date(iso), procheDe(iso, maintenant) ? 'EEE d' : 'd MMM', { locale: fr });
}

/** Forme parlée de `jourProche` : « jeudi 29 », « 24 octobre ». */
export function jourProcheLong(iso: string, maintenant: Date = new Date()): string {
  return format(new Date(iso), procheDe(iso, maintenant) ? 'EEEE d' : 'd MMMM', { locale: fr });
}

/**
 * Page du client : « mardi 3 novembre », « jeudi 1er octobre », avec l’année
 * si elle diffère de celle de `maintenant`. Copie de `dateLongueFr`
 * (supabase/functions/_partage/dates.ts).
 */
export function jourLongClient(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  const jour = d.getDate() === 1 ? '1er' : String(d.getDate());
  const annee = d.getFullYear() !== maintenant.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${format(d, 'EEEE', { locale: fr })} ${jour} ${format(d, 'MMMM', { locale: fr })}${annee}`;
}

/** Page du client : « 8h30 », « 14h ». Copie de `heureFr`. */
export function heureClient(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
}

type VoitureNommee = { marque?: string; modele?: string; plaque?: string } | null | undefined;

/** « Volkswagen Polo » ; « Véhicule » quand rien n’est saisi (comme `voiture_de` en SQL). */
export function voiture(v?: VoitureNommee): string {
  const nom = [v?.marque, v?.modele].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
  return nom || 'Véhicule';
}

/** Avis et libellés d’accessibilité : « Volkswagen Polo AA-004-AA ». */
export function voitureEtPlaque(v?: VoitureNommee): string {
  const plaque = v?.plaque?.trim();
  return plaque ? `${voiture(v)} ${plaque}` : voiture(v);
}

/** Titre de feuille : « Volkswagen Polo · AA-004-AA ». */
export function titreVoiture(v?: VoitureNommee): string {
  const plaque = v?.plaque?.trim();
  return plaque ? `${voiture(v)} · ${plaque}` : voiture(v);
}

/** Kilométrage saisi (« 113 450 », « 113.450 km ») : les chiffres seuls, `undefined` si aucun. */
export function chiffresKm(saisie: string): number | undefined {
  const chiffres = saisie.replace(/\D/g, '');
  if (!chiffres) return undefined;
  const n = Number(chiffres);
  return Number.isSafeInteger(n) ? n : undefined;
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

/** AA-008-AA à partir d'une saisie libre ; renvoie la saisie nettoyée sinon. */
export function formaterPlaque(saisie: string): string {
  const brut = saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{2})(\d{3})([A-Z]{2})$/.exec(brut);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : saisie.toUpperCase().trim();
}

export const PLAQUE_SIV = /^[A-HJ-NP-TV-Z]{2}-\d{3}-[A-HJ-NP-TV-Z]{2}$/;

/**
 * Une plaque (« AA-004-AA ») ne se coupe jamais à ses tirets dans une phrase
 * qui passe à la ligne : un gluon invisible (U+2060) de part et d’autre.
 * Pour l’affichage seulement ; les libellés accessibles gardent le texte brut.
 */
export const plaquesInsecables = (texte: string) => texte.replace(/([A-Z0-9])-(?=[A-Z0-9])/g, '$1⁠-⁠');

/** 06 39 98 00 11 */
export function formaterTelephone(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '').replace(/^33/, '0');
  if (chiffres.length !== 10) return saisie.trim();
  return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/** Numéro réduit à [0-9+] : rien d'autre ne passe dans un lien `tel:` ou `sms:` (pas de « ;ext= », « ?body= »). */
export const numeroLien = (tel: string) => tel.replace(/[^0-9+]/g, '');

export const telHref = (tel: string) => `tel:${numeroLien(tel)}`;

/**
 * Lien `mailto:` dont l'adresse est encodée partie par partie : un « ? »,
 * « & » ou « = » saisi dans la fiche ne peut pas ajouter de destinataire
 * (cc, bcc) ni de corps au message.
 */
export function mailtoHref(email: string): string {
  const propre = email.trim();
  const arobase = propre.lastIndexOf('@');
  if (arobase <= 0) return `mailto:${encodeURIComponent(propre)}`;
  return `mailto:${encodeURIComponent(propre.slice(0, arobase))}@${encodeURIComponent(propre.slice(arobase + 1))}`;
}

export const kilometrage = (km?: number) => (km == null ? '' : `${km.toLocaleString('fr-FR')} km`);

export const euros = (n?: number) =>
  n == null ? '' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// SMS (gabarit, texte tel qu’il part, nombre de SMS facturés) : dans
// `sms.ts`, copie conforme du serveur vérifiée par un test Deno.
export { gabaritSms, lettresRemplacees, mesureSms, normaliserSms, salutation, type MesureSms } from './sms';

// ── Noms

/** « de Hugo », « d’Clara », « d’Adrien » (élision devant une voyelle). */
export function dePrenom(nom: string): string {
  const n = nom.trim();
  return /^[aeiouyàâäéèêëîïôöùûüÿæœ]/i.test(n) ? `d’${n}` : `de ${n}`;
}

type NomPersonne = { prenom?: string | null; nom?: string | null };

/** Nom complet d’un client (« Hugo Bertin », « Arnaud » sans prénom), `repli` sans aucun nom. */
export function nomClient(c: NomPersonne | null | undefined, repli = 'Client inconnu'): string {
  return `${c?.prenom?.trim() ?? ''} ${c?.nom?.trim() ?? ''}`.trim() || repli;
}

/**
 * Le client dans une phrase (« Écrire à Hugo », « SMS envoyé à Arnaud ») :
 * son prénom, facultatif, sinon son nom, sinon `repli`.
 */
export function appelClient(c: NomPersonne | null | undefined, repli = 'le client'): string {
  return c?.prenom?.trim() || c?.nom?.trim() || repli;
}

/**
 * Mots relatifs d’un texte écrit une fois pour toutes (détail d’une
 * notification). Le groupe 1 garde le caractère qui précède : ni lettre ni
 * trait d’union, pour ne pas toucher « après-demain » par « demain ».
 */
const MOTS_RELATIFS = /(^|[^A-Za-zÀ-ÖØ-öø-ÿŒœ-])(aujourd[’']hui|ce matin|cet après-midi|ce soir|après-demain|demain|hier)(?![A-Za-zÀ-ÖØ-öø-ÿŒœ])/gi;

/** Décalage en jours, par rapport au jour de création, de chaque mot relatif, et ce qu’il garde de la journée. */
const SENS_RELATIF: Record<string, { jours: number; suite?: string }> = {
  'aujourd’hui': { jours: 0 },
  "aujourd'hui": { jours: 0 },
  'ce matin': { jours: 0, suite: 'au matin' },
  'cet après-midi': { jours: 0, suite: 'après-midi' },
  'ce soir': { jours: 0, suite: 'au soir' },
  'après-demain': { jours: 2 },
  demain: { jours: 1 },
  hier: { jours: -1 },
};

/**
 * Détail d’une notification relu au moment de l’affichage. Le texte est
 * écrit le jour de sa création (« Batterie · demain 8h30 ») ; lu un autre
 * jour, ses mots relatifs deviennent la date qu’ils désignaient
 * (« Batterie · mer. 28 oct. 8h30 »). Le jour même, il reste tel quel.
 */
export function detailLisible(detail: string, creeLe: string, maintenant: Date = new Date()): string {
  const cree = new Date(creeLe);
  if (Number.isNaN(cree.getTime()) || differenceInCalendarDays(cree, maintenant) === 0) return detail;
  return detail.replace(MOTS_RELATIFS, (_tout, avant: string, mot: string) => {
    const sens = SENS_RELATIF[mot.toLowerCase()];
    if (!sens) return `${avant}${mot}`;
    const jour = new Date(cree.getFullYear(), cree.getMonth(), cree.getDate() + sens.jours);
    const date = `${format(jour, 'EEE d MMM', { locale: fr })}${sens.suite ? ` ${sens.suite}` : ''}`;
    const majuscule = mot[0] !== mot[0].toLowerCase();
    return `${avant}${majuscule ? date.charAt(0).toUpperCase() + date.slice(1) : date}`;
  });
}
