/**
 * Logique pure de la grille horaire du planning (vues « Journée » et
 * « Équipe ») : bornes de l’axe du temps, placement des créneaux qui se
 * chevauchent côte à côte, bornes et ancrage du zoom.
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

/** Points par heure : bornes et valeur par défaut du zoom. */
export const ZOOM_MIN = 32;
export const ZOOM_MAX = 180;
export const ZOOM_DEFAUT = 72;
/** Facteur des boutons « − » et « + ». */
export const PAS_ZOOM = 1.25;

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

export const bornerZoom = (h: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, h));

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

/**
 * Axe du temps du jour : de l’ouverture à la fermeture (arrondies à l’heure
 * pleine), 8 h à 18 h un jour fermé, élargi aux créneaux qui débordent.
 */
export function bornesJour(plage: Plage, creneaux: Creneau[]): { debut: number; fin: number } {
  let debut = plage ? minutesDe(plage.de) : NaN;
  let fin = plage ? minutesDe(plage.a) : NaN;
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) {
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

/**
 * Défilement après un zoom qui garde sous le doigt (ou au centre) l’heure
 * qu’on regardait. `defilement` : décalage avant le zoom ; `focal` : position
 * du point fixe dans la zone visible ; hauteurs en points par heure.
 */
export function defilementApresZoom(defilement: number, focal: number, hAvant: number, hApres: number): number {
  'worklet';
  if (hAvant <= 0) return defilement;
  return Math.max(0, ((defilement + focal) * hApres) / hAvant - focal);
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
