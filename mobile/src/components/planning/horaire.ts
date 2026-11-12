/**
 * Logique pure de la grille horaire du planning (vues « Journée » et
 * « Équipe ») : bornes de l’axe du temps (un jour ou plusieurs côte à côte),
 * placement des créneaux qui se chevauchent côte à côte, bornes et ancrage
 * du zoom sur les deux axes (heures ; jours ou largeur des colonnes),
 * direction du pincement.
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
/** Facteur d’un pas de l’élément réglable (VoiceOver, TalkBack). */
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

// ── Zoom horizontal

/** « Journée » : jours côte à côte, du jour choisi (portrait) ou de la semaine (paysage). */
export const JOURS_MIN = 1;
export const JOURS_MAX = 7;
export const JOURS_DEFAUT = 1;
export const JOURS_DEFAUT_PAYSAGE = 7;

export const bornerJours = (n: number) => (Number.isFinite(n) ? Math.min(JOURS_MAX, Math.max(JOURS_MIN, Math.round(n))) : JOURS_DEFAUT);

/**
 * Nombre entier de jours où se pose le pincement : celui dont la largeur de
 * colonne est la plus proche de la largeur laissée par les doigts.
 */
export function aimanterJours(disponible: number, largeurColonne: number): number {
  'worklet';
  if (!(disponible > 0) || !(largeurColonne > 0)) return JOURS_MIN;
  return Math.min(JOURS_MAX, Math.max(JOURS_MIN, Math.round(disponible / largeurColonne)));
}

/** « Équipe » : largeur d’une colonne de mécanicien, en points. */
export const LARGEUR_EQUIPE_MIN = 72;
export const LARGEUR_EQUIPE_MAX = 260;
export const LARGEUR_EQUIPE_DEFAUT = 104;

export const bornerLargeurEquipe = (l: number) =>
  Number.isFinite(l) ? Math.min(LARGEUR_EQUIPE_MAX, Math.max(LARGEUR_EQUIPE_MIN, l)) : LARGEUR_EQUIPE_DEFAUT;

/**
 * Bornes de la largeur d’une colonne « Équipe » à l’écran : jamais moins que
 * ce qui fait tenir toutes les colonnes dans la largeur disponible (pas de
 * vide à droite avec deux mécaniciens), ni moins de 72 pt ; au plus 260 pt,
 * sauf si une colonne seule est plus large.
 */
export function bornesLargeurEquipe(disponible: number, nbColonnes: number): { min: number; max: number } {
  'worklet';
  const toutTient = disponible > 0 && nbColonnes > 0 ? disponible / nbColonnes : 0;
  const min = Math.max(LARGEUR_EQUIPE_MIN, toutTient);
  return { min, max: Math.max(LARGEUR_EQUIPE_MAX, min) };
}

/** Largeur affichée d’une colonne « Équipe » : la largeur voulue, dans ses bornes. */
export function largeurEquipe(voulue: number, disponible: number, nbColonnes: number): number {
  'worklet';
  const b = bornesLargeurEquipe(disponible, nbColonnes);
  return Math.min(b.max, Math.max(b.min, voulue));
}

// ── Direction du pincement

export type DirectionPincement = 'vertical' | 'horizontal' | 'deux';

/**
 * Angles de partage, en degrés depuis l’horizontale : au-delà de 60°, les
 * doigts sont l’un au-dessus de l’autre (les heures seulement) ; en deçà de
 * 30°, côte à côte (jours ou colonnes seulement) ; entre les deux, en
 * diagonale (les deux axes à la fois).
 */
export const ANGLE_VERTICAL = 60;
export const ANGLE_HORIZONTAL = 30;

/** Direction décidée au début du pincement, d’après l’écart des deux doigts sur chaque axe. */
export function directionPincement(ecartX: number, ecartY: number): DirectionPincement {
  'worklet';
  const x = Math.abs(ecartX);
  const y = Math.abs(ecartY);
  // Doigts confondus (écart inconnu) : le zoom des heures, comme avant.
  if (x === 0 && y === 0) return 'vertical';
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  if (angle > ANGLE_VERTICAL) return 'vertical';
  if (angle < ANGLE_HORIZONTAL) return 'horizontal';
  return 'deux';
}

/** En deçà de cet écart sur un axe au départ, son rapport serait du bruit : l’échelle du pincement le remplace. */
export const ECART_MIN_AXE = 24;

/**
 * Facteur de zoom d’un axe en diagonale : rapport de l’écart des doigts sur
 * cet axe à son écart de départ. `echelle` (l’échelle du pincement) quand
 * l’écart de départ est trop petit pour être lu.
 */
export function facteurAxe(ecartDepart: number, ecartActuel: number, echelle: number): number {
  'worklet';
  const d = Math.abs(ecartDepart);
  return d >= ECART_MIN_AXE ? Math.abs(ecartActuel) / d : echelle;
}

// ── Jours affichés

/**
 * Premier jour affiché en « Journée ». Portrait : le jour choisi. Paysage
 * (`semaine`) : le lundi de sa semaine, sauf si le jour choisi tomberait
 * au-delà des `n` jours montrés (vendredi avec trois jours) : il est alors
 * le dernier.
 */
export function premierJourAffiche(jour: Date, n: number, semaine: boolean): Date {
  const a = jour.getFullYear();
  const m = jour.getMonth();
  const j = jour.getDate();
  if (!semaine) return new Date(a, m, j);
  const rang = (jour.getDay() + 6) % 7;
  const nb = bornerJours(n);
  return rang < nb ? new Date(a, m, j - rang) : new Date(a, m, j - (nb - 1));
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
