/**
 * Vues du planning (démonstration « emploi du temps ») : la liste par
 * sections, la grille horaire « Journée », la grille par mécanicien
 * « Équipe », et les vues que chacun se compose (ce que chaque case
 * affiche, dans quel ordre, quelle couleur). Comme une vue de base de
 * données Notion : même données, autre regard.
 *
 * Gardées sur le téléphone seulement (AsyncStorage, même schéma que
 * `theme/apparence.ts`) : ni le serveur ni les autres membres n’en savent
 * rien. La vue active et le zoom de chaque vue sont mémorisés : hauteur
 * d’une heure, nombre de jours côte à côte en « Journée » (à part en
 * portrait et en paysage) et largeur d’une colonne en « Équipe ». Une valeur
 * absente (téléphone qui l’avait enregistré avant) prend sa valeur par défaut.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { ZOOM_DEFAUT, bornerJours, bornerLargeurEquipe, bornerZoom } from './horaire';

export type Disposition = 'liste' | 'journee' | 'equipe';
export type CouleurCase = 'etat' | 'mecanicien';

/** Ce qu’une case de la grille peut afficher. Jamais de montant. */
export type ChampBloc = 'client' | 'vehicule' | 'plaque' | 'prestation' | 'etape' | 'etat' | 'mecanicien' | 'horaire' | 'duree' | 'memo';

export type VuePlanning = {
  id: string;
  nom: string;
  disposition: Disposition;
  /** Dans l’ordre d’affichage ; le premier en gras */
  champs: ChampBloc[];
  couleur: CouleurCase;
  /** Zoom de la grille, en points par heure */
  hauteurHeure: number;
  /** Vue prête, ni modifiable ni supprimable */
  prefaite: boolean;
};

export const CHAMPS_MAX = 4;

/** Ordre de la liste « Sur chaque voiture » de l’éditeur. */
export const CHAMPS: { id: ChampBloc; label: string }[] = [
  { id: 'client', label: 'Client' },
  { id: 'vehicule', label: 'Véhicule' },
  { id: 'plaque', label: 'Plaque' },
  { id: 'prestation', label: 'Prestation' },
  { id: 'etape', label: 'Prochaine étape' },
  { id: 'etat', label: 'État' },
  { id: 'mecanicien', label: 'Mécanicien' },
  { id: 'horaire', label: 'Horaire' },
  { id: 'duree', label: 'Durée' },
  { id: 'memo', label: 'Mémo interne' },
];

const LIBELLE_CHAMP = Object.fromEntries(CHAMPS.map((c) => [c.id, c.label])) as Record<ChampBloc, string>;

export const libelleChamp = (c: ChampBloc) => LIBELLE_CHAMP[c];

export const VUE_LISTE = 'liste';

export const VUES_PREFAITES: VuePlanning[] = [
  {
    id: VUE_LISTE,
    nom: 'Liste',
    disposition: 'liste',
    champs: [],
    couleur: 'etat',
    hauteurHeure: ZOOM_DEFAUT,
    prefaite: true,
  },
  {
    id: 'journee',
    nom: 'Journée',
    disposition: 'journee',
    champs: ['vehicule', 'prestation', 'client'],
    couleur: 'etat',
    hauteurHeure: ZOOM_DEFAUT,
    prefaite: true,
  },
  {
    id: 'equipe',
    nom: 'Équipe',
    disposition: 'equipe',
    champs: ['vehicule', 'etape'],
    couleur: 'etat',
    hauteurHeure: ZOOM_DEFAUT,
    prefaite: true,
  },
];

/** Ce que montre une vue, sous son nom : « Grille horaire · Véhicule, Prestation, Client ». */
export function decrireVue(v: Pick<VuePlanning, 'disposition' | 'champs' | 'couleur'>): string {
  if (v.disposition === 'liste') return 'Cartes par section, gestes sur chaque carte';
  const forme = v.disposition === 'equipe' ? 'Une colonne par mécanicien' : 'Grille horaire';
  const champs = v.champs.map(libelleChamp).join(', ');
  return [forme, champs, v.couleur === 'mecanicien' ? 'couleur du mécanicien' : null].filter(Boolean).join(' · ');
}

/** Vues prêtes puis personnelles, zoom mémorisé appliqué. */
export function toutesLesVues(personnelles: VuePlanning[], zooms: Record<string, number>): VuePlanning[] {
  return [...VUES_PREFAITES, ...personnelles].map((v) => (zooms[v.id] ? { ...v, hauteurHeure: zooms[v.id] } : v));
}

/** Vues proposées à ce membre : « Équipe » (et toute grille par mécanicien) demande « Voir tout le planning ». */
export function vuesProposees(toutes: VuePlanning[], voirTout: boolean): VuePlanning[] {
  return toutes.filter((v) => voirTout || v.disposition !== 'equipe');
}

const CLE = 'rencar.vues-planning';

type Stocke = {
  active: string;
  personnelles: VuePlanning[];
  zooms: Record<string, number>;
  /** « Journée » : jours côte à côte, par vue (portrait) */
  jours: Record<string, number>;
  /** « Journée » : jours côte à côte, par vue (paysage) */
  joursPaysage: Record<string, number>;
  /** « Équipe » : largeur voulue d’une colonne, par vue, en points */
  largeurs: Record<string, number>;
  /** A déjà zoomé une grille : l’astuce du geste ne se montre plus */
  zoomConnu: boolean;
};

type Etat = Stocke & {
  choisir: (id: string) => void;
  /** Crée (id inconnu) ou remplace une vue personnelle */
  enregistrer: (v: VuePlanning) => void;
  supprimer: (id: string) => void;
  zoomer: (id: string, hauteurHeure: number) => void;
  /** Nombre de jours côte à côte (« Journée »), en portrait ou en paysage */
  choisirJours: (id: string, n: number, paysage: boolean) => void;
  /** Largeur d’une colonne (« Équipe ») */
  elargir: (id: string, largeur: number) => void;
};

let minuterie: ReturnType<typeof setTimeout> | null = null;

/** Écriture regroupée : la molette et le pincement zooment par petites touches. */
function sauver(s: Stocke) {
  if (minuterie) clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    AsyncStorage.setItem(
      CLE,
      JSON.stringify({
        active: s.active,
        personnelles: s.personnelles,
        zooms: s.zooms,
        jours: s.jours,
        joursPaysage: s.joursPaysage,
        largeurs: s.largeurs,
        zoomConnu: s.zoomConnu,
      }),
    ).catch(() => {});
  }, 400);
}

const CHAMPS_CONNUS = new Set(CHAMPS.map((c) => c.id));

/** Vue relue du téléphone : tout ce qui n’a pas la bonne forme est écarté. */
function nettoyer(brut: unknown): VuePlanning | null {
  if (!brut || typeof brut !== 'object') return null;
  const v = brut as Partial<VuePlanning>;
  if (typeof v.id !== 'string' || typeof v.nom !== 'string') return null;
  if (v.disposition !== 'journee' && v.disposition !== 'equipe') return null;
  const champs = (Array.isArray(v.champs) ? v.champs : []).filter((c): c is ChampBloc => CHAMPS_CONNUS.has(c as ChampBloc));
  const uniques = [...new Set(champs)].slice(0, CHAMPS_MAX);
  if (uniques.length === 0) return null;
  return {
    id: v.id,
    nom: v.nom.trim() || 'Ma vue',
    disposition: v.disposition,
    champs: uniques,
    couleur: v.couleur === 'mecanicien' ? 'mecanicien' : 'etat',
    hauteurHeure: bornerZoom(typeof v.hauteurHeure === 'number' ? v.hauteurHeure : ZOOM_DEFAUT),
    prefaite: false,
  };
}

export const useVuesPlanning = create<Etat>((set, get) => ({
  active: VUE_LISTE,
  personnelles: [],
  zooms: {},
  jours: {},
  joursPaysage: {},
  largeurs: {},
  zoomConnu: false,
  choisir(id) {
    set({ active: id });
    sauver(get());
  },
  enregistrer(v) {
    const propre = nettoyer({ ...v, prefaite: false });
    if (!propre) return;
    const { personnelles } = get();
    const existe = personnelles.some((x) => x.id === propre.id);
    set({
      personnelles: existe ? personnelles.map((x) => (x.id === propre.id ? propre : x)) : [...personnelles, propre],
    });
    sauver(get());
  },
  supprimer(id) {
    const { personnelles, active, zooms, jours, joursPaysage, largeurs } = get();
    const sans = (t: Record<string, number>) => Object.fromEntries(Object.entries(t).filter(([cle]) => cle !== id));
    set({
      personnelles: personnelles.filter((x) => x.id !== id),
      active: active === id ? VUE_LISTE : active,
      zooms: sans(zooms),
      jours: sans(jours),
      joursPaysage: sans(joursPaysage),
      largeurs: sans(largeurs),
    });
    sauver(get());
  },
  zoomer(id, hauteurHeure) {
    set({ zooms: { ...get().zooms, [id]: bornerZoom(hauteurHeure) }, zoomConnu: true });
    sauver(get());
  },
  choisirJours(id, n, paysage) {
    if (paysage) set({ joursPaysage: { ...get().joursPaysage, [id]: bornerJours(n) }, zoomConnu: true });
    else set({ jours: { ...get().jours, [id]: bornerJours(n) }, zoomConnu: true });
    sauver(get());
  },
  elargir(id, largeur) {
    set({ largeurs: { ...get().largeurs, [id]: bornerLargeurEquipe(largeur) }, zoomConnu: true });
    sauver(get());
  },
}));

/** Table relue du téléphone : seuls les nombres sont gardés, bornés. */
function nombres(brut: unknown, borner: (n: number) => number): Record<string, number> {
  const table: Record<string, number> = {};
  if (!brut || typeof brut !== 'object') return table;
  for (const [id, v] of Object.entries(brut as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) table[id] = borner(v);
  return table;
}

/** Identifiant neuf d’une vue personnelle. */
export const nouvelId = () => `vue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

AsyncStorage.getItem(CLE)
  .then((brut) => {
    if (!brut) return;
    const s = JSON.parse(brut) as Partial<Stocke>;
    const personnelles = (Array.isArray(s.personnelles) ? s.personnelles : []).map(nettoyer).filter((v): v is VuePlanning => v !== null);
    const zooms = nombres(s.zooms, bornerZoom);
    const ids = new Set([...VUES_PREFAITES, ...personnelles].map((v) => v.id));
    useVuesPlanning.setState({
      personnelles,
      zooms,
      jours: nombres(s.jours, bornerJours),
      joursPaysage: nombres(s.joursPaysage, bornerJours),
      largeurs: nombres(s.largeurs, bornerLargeurEquipe),
      zoomConnu: s.zoomConnu === true,
      active: typeof s.active === 'string' && ids.has(s.active) ? s.active : VUE_LISTE,
    });
  })
  .catch(() => {});
