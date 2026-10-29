/**
 * Échéances et repères (v2c, repris de la v2b et corrigé) : ce que la carte
 * du planning, la ligne de recherche et le bandeau « À traiter » disent
 * d’une intervention sans ouvrir la fiche. Depuis quand elle est bloquée ou
 * prête, pour quand elle est promise, si le client est prévenu, si elle est
 * en retard, et la charge d’un mécanicien un jour donné.
 *
 * Fonctions pures : l’heure arrive par `maintenant` (jamais lue ici), les
 * dates de changement par le journal des événements. Le pourquoi et le
 * quand viennent des colonnes du serveur (`detailBlocage`, `prevenu`,
 * `devisEnvoyeLe`, `restitutionPrevue`).
 */

import { addDays, endOfDay, format, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

import { heure, jourProche, jourProcheLong, memeJour, sansHeure } from '@/lib/format';

import { estBloquee } from './statuts';
import type { CanalPrevenu, Evenement, Garage, Intervention, Notification, Prevenu, Statut, Vehicule } from './types';

export type Ton = 'danger' | 'warn' | 'ok' | 'muted';

/** Une ligne de repère : texte court à « · », ton du thème, phrase pour le lecteur d’écran. */
export type Repere = { texte: string; ton: Ton; label: string };

export type CtxEcheance = {
  maintenant: Date;
  evenements: Evenement[] /* de l’intervention */;
  /** Jour affiché par le planning : un autre jour qu’aujourd’hui, une heure d’aujourd’hui se lit « auj. 11:00 » */
  jour?: Date;
};

/** Début de créneau dépassé de plus de 15 minutes sans réception : « pas arrivée ». */
export const RETARD_ARRIVEE_MIN = 15;

/** Statuts où la voiture est à l’atelier sans être prête. */
const A_L_ATELIER: Statut[] = ['recu', 'en_cours'];

const temps = (iso: string) => new Date(iso).getTime();

// ── Journal

/** Date du dernier événement de l’intervention qui répond au critère. */
function dernier(i: Intervention, e: Evenement[], critere: (x: Evenement) => boolean): string | null {
  let d: string | null = null;
  for (const x of e) if (x.interventionId === i.id && critere(x) && (!d || temps(x.creeLe) > temps(d))) d = x.creeLe;
  return d;
}

/**
 * Date de la pose du blocage actuel : dernier événement qui pose ce blocage
 * (une précision, même blocage avant et après, ne remet pas le compteur à
 * zéro). `null` sans blocage ou sans trace.
 */
export function bloqueeDepuis(i: Intervention, e: Evenement[]): string | null {
  if (!i.blocage) return null;
  return dernier(i, e, (x) => x.type === 'blocage' && x.valeur === i.blocage && (x.avant ?? null) !== x.valeur);
}

/** Date du dernier passage en « Véhicule prêt » (quel que soit le statut actuel). */
export function preteDepuis(i: Intervention, e: Evenement[]): string | null {
  return dernier(i, e, estPassagePret);
}

/**
 * Vrai passage en « Véhicule prêt ». L’annulation d’une livraison (gérant,
 * le jour même) n’en est pas un : la voiture l’était déjà, son ancienneté
 * et le client prévenu continuent.
 */
export function estPassagePret(x: Evenement): boolean {
  return x.type === 'statut' && x.valeur === 'termine' && !x.details?.livraisonAnnulee;
}

/**
 * Le client prévenu, colonne `prevenu` comprise après une livraison
 * annulée : le passage en Livré vide la colonne (gardée dans
 * `details.prevenuAvant` de l’événement Livré) et l’annulation de la
 * livraison ne la rétablit pas. On remonte donc, livraison annulée après
 * livraison annulée, jusqu’au « prévenu » d’avant le Livré.
 */
function prevenuActuel(i: Intervention, e: Evenement[]): Prevenu | null {
  if (i.prevenu) return i.prevenu;
  if (i.statut !== 'termine') return null;
  const statuts = e.filter((x) => x.interventionId === i.id && x.type === 'statut').sort((a, b) => temps(a.creeLe) - temps(b.creeLe));
  let k = statuts.length - 1;
  while (k >= 0 && statuts[k].valeur === 'termine' && statuts[k].details?.livraisonAnnulee) {
    // L’événement Livré que cette annulation défait.
    let j = k - 1;
    while (j >= 0 && statuts[j].valeur !== 'livre') j -= 1;
    if (j < 0) return null;
    const avant = statuts[j].details?.prevenuAvant;
    if (avant) return avant;
    k = j - 1;
  }
  return null;
}

/** SMS « prêt » envoyé depuis le dernier passage en « Véhicule prêt » (sans passage tracé : n’importe quel SMS). */
function dernierSmsPret(i: Intervention, e: Evenement[]): string | null {
  const pret = preteDepuis(i, e);
  const depuis = pret ? temps(pret) : -Infinity;
  return dernier(i, e, (x) => x.type === 'sms' && temps(x.creeLe) >= depuis);
}

/**
 * Le SMS « prêt » est déjà parti pour ce passage en « Véhicule prêt » : celui
 * de Rencar, ou un message écrit depuis l’app SMS du téléphone (trace
 * « prévenu » par SMS), comme `sms_pret_parti`.
 */
export function smsPretParti(i: Intervention, e: Evenement[]): boolean {
  if (dernierSmsPret(i, e) !== null) return true;
  const pret = preteDepuis(i, e);
  const depuis = pret ? temps(pret) : -Infinity;
  return dernier(i, e, (x) => x.type === 'prevenu' && x.valeur === 'sms' && temps(x.creeLe) >= depuis) !== null;
}

/**
 * Le client prévenu d’une voiture prête : par le SMS de Rencar (événement
 * `sms` après le dernier passage en Prêt, `parRencar`) ou par la colonne
 * `prevenu` (appel, répondeur, SMS écrit depuis le téléphone) ; le plus
 * récent des deux.
 */
export function prevenuDe(
  i: Intervention,
  e: Evenement[],
): { canal: CanalPrevenu; le: string; par: string | null; parRencar?: boolean } | null {
  // Une livraison annulée ne remet pas la voiture « à prévenir » (voir `prevenuActuel`).
  const sms = i.statut === 'termine' ? dernierSmsPret(i, e) : null;
  const p = prevenuActuel(i, e);
  const col = p ? { canal: p.canal, le: p.le, par: p.par ?? null } : null;
  // `parRencar` : le SMS « prêt » envoyé par Rencar ; sans lui, canal « sms » = écrit depuis le téléphone.
  if (sms && (!col || temps(sms) >= temps(col.le))) return { canal: 'sms', le: sms, par: null, parRencar: true };
  return col;
}

/** Prête, et personne n’a eu le client (ou seulement son répondeur). */
export function aPrevenir(i: Intervention, e: Evenement[]): boolean {
  if (i.statut !== 'termine') return false;
  const p = prevenuDe(i, e);
  return !p || p.canal === 'repondeur';
}

// ── Kilométrage au dépôt (D7)

/**
 * Dernier relevé du compteur d’un véhicule : son kilométrage et, quand une
 * intervention (autre que `sauf`) l’a relevé, le jour de ce dépôt. Il
 * préremplit le relevé du dépôt, jamais obligatoire.
 */
export function dernierReleve(
  v: Pick<Vehicule, 'id' | 'km'> | undefined,
  interventions: Pick<Intervention, 'id' | 'vehiculeId' | 'kmDepot' | 'debut'>[],
  sauf?: string,
): { km: number; le?: string } | null {
  if (v?.km == null) return null;
  let le: string | undefined;
  for (const i of interventions) {
    if (i.vehiculeId !== v.id || i.id === sauf || i.kmDepot !== v.km) continue;
    if (!le || temps(i.debut) > temps(le)) le = i.debut;
  }
  return { km: v.km, le };
}

/** « Relevé du 14 avril 2026 repris : lisez le compteur. » sous un kilométrage prérempli. */
export function aideReleveRepris(le?: string): string {
  const quand = le ? `Relevé du ${format(new Date(le), 'd MMMM yyyy', { locale: fr })} repris` : 'Dernier relevé repris';
  return `${quand} : lisez le compteur.`;
}

// ── Échéances

/** Échéance d’une date : l’heure dite, ou la fin de la journée pour une date sans heure. */
const echeance = (iso: string) => (sansHeure(iso) ? endOfDay(new Date(iso)) : new Date(iso));

function pieceEchue(i: Intervention, maintenant: Date): boolean {
  const pour = i.detailBlocage?.pour;
  return Boolean(i.blocage === 'attente_piece' && pour && estBloquee(i) && echeance(pour) < maintenant);
}

function rappelEchu(i: Intervention, maintenant: Date): boolean {
  const pour = i.detailBlocage?.pour;
  return Boolean(i.blocage === 'rappeler_client' && pour && estBloquee(i) && echeance(pour) < maintenant);
}

/** Retour prévu dépassé d’une voiture reçue ou en cours (la fiche le dit sous l’horaire). */
export function retourEchu(i: Intervention, maintenant: Date): boolean {
  return Boolean(A_L_ATELIER.includes(i.statut) && i.restitutionPrevue && echeance(i.restitutionPrevue) < maintenant);
}

/** Retour prévu dépassé (voiture reçue ou en cours), ou échéance de la pièce dépassée. */
export function enRetard(i: Intervention, maintenant: Date): boolean {
  return retourEchu(i, maintenant) || pieceEchue(i, maintenant);
}

/**
 * Rendez-vous confirmé dont le créneau a commencé depuis plus de
 * RETARD_ARRIVEE_MIN, voiture pas reçue : le jour même, ou un jour passé
 * (rendez-vous manqué, jamais reçu ni annulé ni déplacé). Ce dernier reste
 * sur le planning d’aujourd’hui jusqu’à ce qu’on en décide (`manque`).
 */
export function pasArrivee(i: Intervention, maintenant: Date): boolean {
  return i.statut === 'planifie' && temps(i.debut) + RETARD_ARRIVEE_MIN * 60_000 < maintenant.getTime();
}

/** Rendez-vous confirmé d’un jour passé, jamais reçu : il ne disparaît pas du planning le lendemain. */
export function manque(i: Pick<Intervention, 'statut' | 'debut'>, maintenant: Date): boolean {
  return i.statut === 'planifie' && temps(i.debut) < startOfDay(maintenant).getTime();
}

// ── Repère de la carte

/** Morceau de repère : texte affiché, et sa forme parlée si elle diffère. */
type Morceau = string | { texte: string; parle: string } | null | undefined | false;

const majusculeInitiale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minusculeInitiale = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function repere(ton: Ton, prefixeParle: string | null, ...morceaux: Morceau[]): Repere | null {
  const m = morceaux.filter((x): x is string | { texte: string; parle: string } => Boolean(x));
  if (!m.length) return null;
  const texte = majusculeInitiale(m.map((x) => (typeof x === 'string' ? x : x.texte)).join(' · '));
  const parle = m.map((x) => minusculeInitiale(typeof x === 'string' ? x : x.parle));
  return { texte, ton, label: [prefixeParle, ...parle].filter(Boolean).join(', ') };
}

/**
 * « 15:00 » le jour même, « jeu. 29 15:00 » un autre jour, le jour seul
 * (« jeu. 29 », « aujourd’hui ») pour une date sans heure.
 */
function moment(iso: string, m: Date, jour?: Date): { texte: string; parle: string } {
  const auj = memeJour(new Date(iso), m);
  // Planning d’un autre jour : « Promise 11:00 » se lirait comme l’heure de ce jour-là.
  if (auj && jour && !memeJour(jour, m) && !sansHeure(iso)) return { texte: `auj. ${heure(iso)}`, parle: `aujourd’hui ${heure(iso)}` };
  if (sansHeure(iso)) return auj ? { texte: 'aujourd’hui', parle: 'aujourd’hui' } : { texte: jourProche(iso, m), parle: jourProcheLong(iso, m) };
  if (auj) return { texte: heure(iso), parle: heure(iso) };
  return { texte: `${jourProche(iso, m)} ${heure(iso)}`, parle: `${jourProcheLong(iso, m)} ${heure(iso)}` };
}

/** Échéance d’une pièce : « hier », « aujourd’hui », « jeu. 29 », plus l’heure si elle est posée. */
function quandPiece(pour: string, m: Date, jour?: Date): { texte: string; parle: string } {
  if (isSameDay(new Date(pour), addDays(startOfDay(m), -1))) {
    const h = sansHeure(pour) ? '' : ` ${heure(pour)}`;
    return { texte: `hier${h}`, parle: `hier${h}` };
  }
  return moment(pour, m, jour);
}

const quoiDe = (i: Intervention) => {
  const q = i.detailBlocage?.quoi?.trim();
  return q ? q : null;
};

/**
 * Ligne repère de la carte (une ligne, couleur du ton), première règle qui
 * s’applique :
 * - attente pièce, échéance dépassée : « Sonde lambda · prévue hier · en
 *   retard » (sans quoi : « Pièce prévue hier · en retard »), danger ;
 * - attente pièce avec échéance : « Sonde lambda · prévue jeu. 29 » (+ « 14:00 »
 *   si une heure est posée), warn ; quoi sans échéance : « Sonde lambda », warn ;
 * - attente d’accord : « Plaquettes avant · devis envoyé 09:47 » ou
 *   « Plaquettes avant · devis à envoyer », warn ;
 * - à rappeler : « Rappel 15:00 », warn ; passée : « Rappel 15:00 · en retard », danger ;
 * - prête : « SMS 10:35 » ok, « Prévenu 16:35 » ok, « Répondeur 16:40 » warn,
 *   « À prévenir » warn ;
 * - reçue ou en cours : « Promise 11:00 · en retard » danger, « Promise 17:00 »,
 *   « Promise jeu. 29 18:00 » muted ;
 * - sinon `null`.
 * L’ancienneté (« Attente pièce · 2 j », « Prêt · 3 h ») reste dans la
 * pastille d’état. Le libellé parlé reprend le blocage en toutes lettres :
 * « attente pièce, sonde lambda, prévue jeudi 29 ».
 */
export function repereCarte(i: Intervention, ctx: CtxEcheance): Repere | null {
  const m = ctx.maintenant;
  if (i.statut === 'livre' || i.statut === 'annule' || i.statut === 'a_valider') return null;
  const quoi = quoiDe(i);

  if (i.blocage && estBloquee(i) && i.statut !== 'termine') {
    const d = i.detailBlocage;
    switch (i.blocage) {
      case 'attente_piece': {
        if (d?.pour) {
          const echu = pieceEchue(i, m);
          const q = quandPiece(d.pour, m, ctx.jour);
          const prevue = { texte: `prévue ${q.texte}`, parle: `prévue ${q.parle}` };
          // Échéance dépassée : « en retard » en toutes lettres, pas seulement par la couleur.
          return quoi
            ? repere(echu ? 'danger' : 'warn', 'attente pièce', quoi, prevue, echu && 'en retard')
            : repere(echu ? 'danger' : 'warn', 'attente pièce', { texte: `Pièce prévue ${q.texte}`, parle: `pièce prévue ${q.parle}` }, echu && 'en retard');
        }
        return quoi ? repere('warn', 'attente pièce', quoi) : null;
      }
      case 'attente_accord': {
        const devis = i.devisEnvoyeLe ? moment(i.devisEnvoyeLe, m, ctx.jour) : null;
        return repere(
          'warn',
          'attente d’accord',
          quoi,
          devis ? { texte: `devis envoyé ${devis.texte}`, parle: `devis envoyé ${devis.parle}` } : 'devis à envoyer',
        );
      }
      case 'rappeler_client': {
        const echu = rappelEchu(i, m);
        const q = d?.pour ? moment(d.pour, m, ctx.jour) : null;
        return repere(
          echu ? 'danger' : 'warn',
          'client à rappeler',
          q && { texte: `Rappel ${q.texte}`, parle: `rappel ${q.parle}` },
          quoi,
          echu && 'en retard',
        );
      }
      default:
        return null;
    }
  }

  if (i.statut === 'termine') {
    const p = prevenuDe(i, ctx.evenements);
    if (!p) return repere('warn', null, 'À prévenir');
    const q = moment(p.le, m, ctx.jour);
    if (p.canal === 'repondeur') return repere('warn', null, { texte: `Répondeur ${q.texte}`, parle: `répondeur ${q.parle}` });
    if (p.canal === 'sms') return repere('ok', null, { texte: `SMS ${q.texte}`, parle: `SMS envoyé ${q.parle}` });
    return repere('ok', null, { texte: `Prévenu ${q.texte}`, parle: `client prévenu ${q.parle}` });
  }

  if (A_L_ATELIER.includes(i.statut) && i.restitutionPrevue) {
    const echu = retourEchu(i, m);
    const q = moment(i.restitutionPrevue, m, ctx.jour);
    return repere(echu ? 'danger' : 'muted', null, { texte: `Promise ${q.texte}`, parle: `promise ${q.parle}` }, echu && 'en retard');
  }
  return null;
}

// ── Bandeau « À traiter » et charge

/** Voiture immobilisée au garage depuis un jour antérieur à `jour`. */
const immobiliseeAvant = (i: Intervention, jour: Date) => A_L_ATELIER.includes(i.statut) && temps(i.debut) < startOfDay(jour).getTime();

/**
 * Comptes du bandeau « À traiter » (identifiants), sur la liste que le
 * planning montre (interventions visibles du membre). Une voiture peut être
 * dans deux listes (en retard et à prévenir) ; livrées et annulées jamais.
 * « À attribuer » : créneau du jour affiché, immobilisées comprises, hors
 * prêtes, plus les demandes à valider (la section « À valider » les montre
 * chaque jour avec leur pastille « À attribuer » : le bandeau ne dit plus
 * « Rien à traiter » au-dessus). « En retard », « À prévenir », « Pas
 * arrivées » : pour aujourd’hui seulement (vides un autre jour) ; « Pas
 * arrivées » compte aussi les rendez-vous manqués des jours passés.
 */
export function aTraiter(
  liste: Intervention[],
  ctx: { maintenant: Date; jour: Date; evenementsDe: (id: string) => Evenement[] },
): { aAttribuer: string[]; enRetard: string[]; aPrevenir: string[]; pasArrivees: string[] } {
  const vivantes = liste.filter((i) => i.statut !== 'livre' && i.statut !== 'annule');
  const ids = (l: Intervention[]) => l.map((i) => i.id);
  const duJour = (i: Intervention) => i.statut === 'a_valider' || memeJour(new Date(i.debut), ctx.jour) || immobiliseeAvant(i, ctx.jour);
  const aujourdhui = memeJour(ctx.jour, ctx.maintenant);
  return {
    aAttribuer: ids(vivantes.filter((i) => i.membreId === null && i.statut !== 'termine' && duJour(i))),
    enRetard: aujourdhui ? ids(vivantes.filter((i) => enRetard(i, ctx.maintenant))) : [],
    aPrevenir: aujourdhui ? ids(vivantes.filter((i) => aPrevenir(i, ctx.evenementsDe(i.id)))) : [],
    pasArrivees: aujourdhui ? ids(vivantes.filter((i) => pasArrivee(i, ctx.maintenant))) : [],
  };
}

/** Statuts comptés dans la charge d’un créneau. */
const CHARGE_CRENEAU: Statut[] = ['a_valider', 'planifie', 'recu', 'en_cours'];

/**
 * Charge d’un membre le jour donné : voitures dont le créneau tombe ce
 * jour-là (à valider, planifiées, reçues, en cours), plus les voitures
 * immobilisées depuis un jour antérieur (reçues, en cours, bloquées
 * comprises) ; jamais les prêtes, livrées, annulées. Minutes : somme des
 * durées prévues des voitures comptées.
 */
export function chargeDuJour(liste: Intervention[], membreId: string, jour: Date): { nb: number; minutes: number } {
  const comptees = liste.filter(
    (i) =>
      i.membreId === membreId &&
      ((CHARGE_CRENEAU.includes(i.statut) && memeJour(new Date(i.debut), jour)) || immobiliseeAvant(i, jour)),
  );
  return { nb: comptees.length, minutes: comptees.reduce((t, i) => t + (i.dureeMin || 0), 0) };
}

// ── Jours et heures proposés (feuilles Bloquer, Retour prévu, Déplacer)

const plageDu = (horaires: Garage['horaires'] | null | undefined, d: Date) => horaires?.[d.getDay()] ?? null;

const minutesDe = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Les `n` prochains jours ouverts à partir de `depuis` (compris), à minuit
 * local. Sans horaires connus, tous les jours comptent.
 */
export function joursOuvres(horaires: Garage['horaires'], depuis: Date, n: number): Date[] {
  const connus = Boolean(horaires && Object.values(horaires).some(Boolean));
  const res: Date[] = [];
  for (let k = 0; k < 60 && res.length < n; k++) {
    const j = addDays(startOfDay(depuis), k);
    if (!connus || plageDu(horaires, j)) res.push(j);
  }
  return res;
}

/**
 * Heures libres proposées pour un jour : « 12:00 », « 14:00 », « 17:00 » et
 * la fermeture, dans la plage d’ouverture et à venir (le jour même). Vide
 * pour un jour fermé.
 */
export function heuresProposees(horaires: Garage['horaires'], jour: Date, maintenant: Date): string[] {
  const plage = plageDu(horaires, jour);
  if (!plage) return [];
  const de = minutesDe(plage.de);
  const a = minutesDe(plage.a);
  if (!Number.isFinite(de) || !Number.isFinite(a)) return [];
  const auj = memeJour(jour, maintenant);
  const actuelle = maintenant.getHours() * 60 + maintenant.getMinutes();
  const candidates = [12 * 60, 14 * 60, 17 * 60, a];
  return [...new Set(candidates)]
    .filter((x) => x >= de && x <= a && (!auj || x > actuelle))
    .sort((x, y) => x - y)
    .map(hhmm);
}

/** Garage fermé à cet instant (jour fermé, avant l’ouverture ou après la fermeture). Sans horaires connus : non. */
export function fermeA(horaires: Garage['horaires'], maintenant: Date): boolean {
  if (!horaires || !Object.values(horaires).some(Boolean)) return false;
  const plage = plageDu(horaires, maintenant);
  if (!plage) return true;
  const t = maintenant.getHours() * 60 + maintenant.getMinutes();
  return t < minutesDe(plage.de) || t >= minutesDe(plage.a);
}

/**
 * Toutes les heures pleines du jour dans la plage d’ouverture (à venir le
 * jour même), pour « Autre heure… » : une tournée de pièces à 15:00, un rappel
 * promis à 16:00. Vide pour un jour fermé.
 */
export function heuresDuJour(horaires: Garage['horaires'], jour: Date, maintenant: Date): string[] {
  const plage = plageDu(horaires, jour);
  if (!plage) return [];
  const de = minutesDe(plage.de);
  const a = minutesDe(plage.a);
  if (!Number.isFinite(de) || !Number.isFinite(a)) return [];
  const auj = memeJour(jour, maintenant);
  const actuelle = maintenant.getHours() * 60 + maintenant.getMinutes();
  const res: string[] = [];
  for (let x = Math.ceil(de / 60) * 60; x <= a; x += 60) if (!auj || x > actuelle) res.push(hhmm(x));
  return res;
}

// ── Pastille « Nouvelle »

/**
 * Voiture vraiment nouvelle pour ce membre : une notification non lue qui
 * lui est adressée, liée à l’événement qui la lui attribue (affectation, ou
 * création déjà attribuée). Une autre notification non lue (pièce, accord)
 * ne fait pas une voiture nouvelle.
 */
export function estNouvellePour(i: Intervention, notifications: Notification[], evenements: Evenement[], membreId: string): boolean {
  if (i.membreId !== membreId) return false;
  return notifications.some((n) => {
    if (n.lue || n.membreId !== membreId || n.cible?.type !== 'intervention' || n.cible.id !== i.id || !n.evenementId) return false;
    const e = evenements.find((x) => x.id === n.evenementId);
    if (!e) return false;
    return (e.type === 'affectation' && e.valeur === membreId) || e.type === 'creation';
  });
}
