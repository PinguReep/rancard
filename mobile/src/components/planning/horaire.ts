/**
 * Logique pure de la grille horaire du planning (vues « Journée » et
 * « Équipe ») : bornes de l’axe du temps (un jour ou une semaine côte à
 * côte), placement des créneaux qui se chevauchent côte à côte, zoom lié
 * (un niveau qui règle à la fois la largeur des colonnes et la hauteur des
 * heures) et ancrage du point sous les doigts.
 *
 * Aucune dépendance (ni alias `@/`, ni date-fns, ni React Native) : Node lit
 * ce fichier tel quel (types effacés) pour les tests de
 * `scripts/horaire.test.mjs`.
 *
 * Placement : l’algorithme classique des agendas. Les créneaux sont triés
 * par début (le plus long d’abord à début égal), regroupés en grappes de
 * créneaux qui se recouvrent de proche en proche ; dans une grappe, chaque
 * créneau prend la première colonne libre ; une case s’élargit ensuite vers
 * la droite tant que les colonnes voisines sont libres sur toute sa durée.
 */

/** Hauteur minimale lisible d’une case, en points (une ligne de texte). */
export const HAUTEUR_MIN_CASE = 24;

/** Jour fermé (ou horaires inconnus) : 8 h à 18 h. */
const OUVERTURE_DEFAUT = 8 * 60;
const FERMETURE_DEFAUT = 18 * 60;

export type Plage = { de: string; a: string } | null | undefined;

export type Creneau = {
  id: string;
  /** minutes depuis minuit */ debut: number;
  /** minutes depuis minuit, > debut */ fin: number;
};

export type Place = Creneau & {
  /** Colonne de la case dans sa grappe (0 = la plus à gauche) */
  colonne: number;
  /** Nombre de colonnes de la grappe */
  nbColonnes: number;
  /** Colonnes occupées par la case (≥ 1) : élargie vers la droite quand la place est libre */
  etendue: number;
};

function minutesDe(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/**
 * Minutes depuis minuit de `iso` s’il tombe le jour civil (local) de `jour`,
 * sinon null. Heures locales lues directement : juste aussi les jours de
 * changement d’heure.
 */
export function minutesDansJour(iso: string, jour: Date): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== jour.getFullYear() || d.getMonth() !== jour.getMonth() || d.getDate() !== jour.getDate()) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Créneau d’une intervention le jour affiché (borné à minuit), ou null s’il tombe un autre jour. */
export function creneauDuJour(i: { id: string; debut: string; dureeMin: number }, jour: Date): Creneau | null {
  const debut = minutesDansJour(i.debut, jour);
  if (debut === null) return null;
  const fin = Math.min(24 * 60, debut + Math.max(0, i.dureeMin || 0));
  return { id: i.id, debut, fin: Math.max(fin, debut + 1) };
}

/** Ouverture et fermeture du jour en minutes, ou null (jour fermé, horaires illisibles). */
export function plageMinutes(plage: Plage): { de: number; a: number } | null {
  if (!plage) return null;
  const de = minutesDe(plage.de);
  const a = minutesDe(plage.a);
  return Number.isFinite(de) && Number.isFinite(a) && a > de ? { de, a } : null;
}

/**
 * Axe du temps du jour : de l’ouverture à la fermeture (arrondies à l’heure
 * pleine), 8 h à 18 h un jour fermé, élargi aux créneaux qui débordent.
 */
export function bornesJour(plage: Plage, creneaux: Creneau[]): { debut: number; fin: number } {
  return bornesJours([plage], creneaux);
}

/**
 * Axe du temps de plusieurs jours côte à côte : l’union de leurs horaires
 * d’ouverture (le samedi matin ne coupe pas le mardi soir), 8 h à 18 h si
 * tous sont fermés, élargie aux créneaux qui débordent, arrondie à l’heure.
 */
export function bornesJours(plages: Plage[], creneaux: Creneau[]): { debut: number; fin: number } {
  let debut = Infinity;
  let fin = -Infinity;
  for (const p of plages) {
    const m = plageMinutes(p);
    if (!m) continue;
    debut = Math.min(debut, m.de);
    fin = Math.max(fin, m.a);
  }
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) {
    debut = OUVERTURE_DEFAUT;
    fin = FERMETURE_DEFAUT;
  }
  for (const c of creneaux) {
    debut = Math.min(debut, c.debut);
    fin = Math.max(fin, c.fin);
  }
  debut = Math.max(0, Math.floor(debut / 60) * 60);
  fin = Math.min(24 * 60, Math.ceil(fin / 60) * 60);
  if (fin - debut < 60) fin = Math.min(24 * 60, debut + 60);
  return { debut, fin };
}

/** Heures pleines de l’axe (en minutes), bornes comprises. */
export function heuresAxe(debut: number, fin: number): number[] {
  const heures: number[] = [];
  for (let m = debut; m <= fin; m += 60) heures.push(m);
  return heures;
}

const recouvre = (a: Creneau, b: Creneau) => a.debut < b.fin && b.debut < a.fin;

/**
 * Places côte à côte des créneaux d’une colonne de temps. `dureeVisibleMin` :
 * durée minimale à l’écran (la hauteur minimale d’une case convertie en
 * minutes au zoom courant), pour que deux cases courtes qui se toucheraient
 * à l’écran passent aussi côte à côte.
 */
export function placer(creneaux: Creneau[], dureeVisibleMin = 0): Place[] {
  const visibles = creneaux
    .map((c) => ({ ...c, fin: Math.max(c.fin, c.debut + dureeVisibleMin) }))
    .sort((a, b) => a.debut - b.debut || b.fin - a.fin || a.id.localeCompare(b.id));
  const fins = new Map(creneaux.map((c) => [c.id, c.fin]));
  const places: Place[] = [];

  let grappe: (Creneau & { colonne: number })[] = [];
  let finGrappe = -Infinity;
  let colonnes: number[] = [];

  const clore = () => {
    const n = colonnes.length;
    for (const c of grappe) {
      let etendue = 1;
      for (let k = c.colonne + 1; k < n; k += 1) {
        if (grappe.some((o) => o.colonne === k && recouvre(o, c))) break;
        etendue += 1;
      }
      places.push({
        id: c.id,
        debut: c.debut,
        fin: fins.get(c.id) ?? c.fin,
        colonne: c.colonne,
        nbColonnes: n,
        etendue,
      });
    }
    grappe = [];
    colonnes = [];
    finGrappe = -Infinity;
  };

  for (const c of visibles) {
    if (c.debut >= finGrappe) clore();
    let colonne = colonnes.findIndex((f) => f <= c.debut);
    if (colonne < 0) {
      colonne = colonnes.length;
      colonnes.push(c.fin);
    } else colonnes[colonne] = c.fin;
    grappe.push({ ...c, colonne });
    finGrappe = Math.max(finGrappe, c.fin);
  }
  clore();
  return places;
}

// ── Zoom lié : un niveau `t` (0 à 1) règle à la fois la largeur d’une colonne et la hauteur d’une heure

/** Points par heure au niveau 0 et au niveau 1. */
export const H_MIN = 36;
export const H_MAX = 96;
/** « Journée » : la semaine du lundi au dimanche, toujours sept colonnes. */
export const COLONNES_JOURNEE = 7;
/** « Équipe » : largeur minimale d’une colonne de mécanicien, en points. */
export const LARGEUR_COLONNE_MIN = 64;

/** Niveau ramené entre 0 et 1 (0 pour une valeur illisible). */
export function bornerNiveau(t: number): number {
  'worklet';
  return t >= 0 ? (t <= 1 ? t : 1) : 0;
}

/**
 * Niveau par défaut d’une grille. « Journée » : un jour remplit l’écran en
 * portrait, la semaine entière en paysage. « Équipe » : entre les deux en
 * portrait, toutes les colonnes en paysage.
 */
export function niveauParDefaut(disposition: 'journee' | 'equipe', paysage: boolean): number {
  if (paysage) return 0;
  return disposition === 'equipe' ? 0.4 : 1;
}

/**
 * Bornes de la largeur d’une colonne : au plus la largeur disponible (une
 * colonne remplit l’écran), au moins ce qui fait tenir toutes les colonnes,
 * sans descendre sous `minimum`.
 */
export function bornesLargeur(disponible: number, nbColonnes: number, minimum = 0): { min: number; max: number } {
  'worklet';
  const max = Math.max(0, disponible);
  return { min: Math.min(max, Math.max(max / Math.max(1, nbColonnes), minimum)), max };
}

/** Largeur d’une colonne au niveau `t` : `min · (max / min)^t`. */
export function largeurDuNiveau(t: number, min: number, max: number): number {
  'worklet';
  return min > 0 && max > min ? min * Math.pow(max / min, bornerNiveau(t)) : max;
}

/** Hauteur d’une heure au niveau `t` : `H_MIN · (H_MAX / H_MIN)^t`. */
export function hauteurDuNiveau(t: number): number {
  'worklet';
  return H_MIN * Math.pow(H_MAX / H_MIN, bornerNiveau(t));
}

/** Niveau qui donne la largeur `w` (bornée) ; null sans plage de largeur (une colonne seule). */
export function niveauDeLargeur(w: number, min: number, max: number): number | null {
  'worklet';
  if (!(min > 0) || !(max > min)) return null;
  return bornerNiveau(Math.log(w / min) / Math.log(max / min));
}

/**
 * Niveau après un pincement (ou un cran de molette) d’échelle `echelle`
 * parti du niveau `depart` : la largeur suit l’échelle, bornée, et le niveau
 * s’en déduit. Sans plage de largeur, l’échelle règle les heures seules.
 */
export function niveauApresEchelle(depart: number, echelle: number, min: number, max: number): number {
  'worklet';
  if (!(echelle > 0)) return bornerNiveau(depart);
  const t = niveauDeLargeur(largeurDuNiveau(depart, min, max) * echelle, min, max);
  return t !== null ? t : bornerNiveau(depart + Math.log(echelle) / Math.log(H_MAX / H_MIN));
}

/**
 * Défilement qui garde sous les doigts le point du contenu qu’ils touchaient,
 * sur un axe. `defilement` et `focal` : décalage et position des doigts dans
 * la zone visible au départ ; `focalActuel` : leur position maintenant (ils
 * glissent aussi pendant le pincement) ; `avant` et `apres` : échelle du
 * contenu au-delà de `origine` (marge fixe en tête). Borné à [0, max].
 */
export function ancrer(defilement: number, focal: number, focalActuel: number, avant: number, apres: number, origine = 0, max = Infinity): number {
  'worklet';
  const point = avant > 0 ? origine + ((defilement + focal - origine) * apres) / avant : defilement + focal;
  return Math.min(Math.max(0, max), Math.max(0, point - focalActuel));
}

// ── Jours affichés

/** Lundi de la semaine de `jour` (minuit local) : première colonne de « Journée ». */
export function lundiDe(jour: Date): Date {
  return new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() - ((jour.getDay() + 6) % 7));
}

/** `n` jours consécutifs à partir de `premier` (minuit local, juste aussi aux changements d’heure). */
export function joursConsecutifs(premier: Date, n: number): Date[] {
  const jours: Date[] = [];
  for (let k = 0; k < n; k += 1) jours.push(new Date(premier.getFullYear(), premier.getMonth(), premier.getDate() + k));
  return jours;
}

/**
 * Heures fermées d’un jour sur l’axe `debut`–`fin` (grisées dans sa
 * colonne) : avant l’ouverture et après la fermeture ; tout l’axe un jour
 * fermé.
 */
export function zonesFermees(plage: Plage, debut: number, fin: number): { debut: number; fin: number }[] {
  const p = plageMinutes(plage);
  if (!p) return [{ debut, fin }];
  const zones: { debut: number; fin: number }[] = [];
  if (p.de > debut) zones.push({ debut, fin: Math.min(p.de, fin) });
  if (p.a < fin) zones.push({ debut: Math.max(p.a, debut), fin });
  return zones.filter((z) => z.fin > z.debut);
}

/**
 * Lignes de texte qui tiennent dans une case de `hauteur` points : la
 * première (en gras) plus haute que les suivantes. Au moins une.
 */
export function lignesQuiTiennent(hauteur: number, marge = 8, premiere = 16, suivante = 15): number {
  const reste = hauteur - marge - premiere;
  return reste < 0 ? 1 : 1 + Math.floor(reste / suivante);
}

/**
 * Répartit les champs sur `n` lignes : un champ par ligne tant qu’il y a la
 * place, les derniers réunis par « · » sur la dernière ligne sinon.
 */
export function repartirLignes(textes: string[], n: number): string[] {
  const pleins = textes.filter(Boolean);
  if (pleins.length <= n) return pleins;
  if (n <= 1) return [pleins.join(' · ')];
  return [...pleins.slice(0, n - 1), pleins.slice(n - 1).join(' · ')];
}
