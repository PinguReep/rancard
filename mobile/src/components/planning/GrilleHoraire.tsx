/**
 * Grille horaire du planning (vues « Journée » et « Équipe ») : l’emploi
 * du temps de l’atelier, façon agenda. Le temps descend, les heures à
 * gauche, de l’ouverture à la fermeture du garage ; chaque intervention est
 * une case placée et dimensionnée selon son créneau. Deux voitures dans la
 * même heure (on avance un peu sur l’une, un peu sur l’autre) se partagent
 * la largeur, côte à côte (`horaire.ts`).
 *
 * « Journée » : de 1 à 7 jours côte à côte à partir du premier jour affiché
 * (le jour choisi en portrait, sa semaine en paysage : `planning.tsx`). Avec
 * plusieurs jours, un en-tête compact par colonne (« lun. 9 », aujourd’hui
 * en couleur d’accent) ; le toucher choisit ce jour. L’axe des heures
 * couvre l’union des horaires des jours montrés ; les heures où un jour est
 * fermé sont grisées dans sa colonne (toute la colonne, avec « Fermé », un
 * jour de fermeture). Le trait « maintenant » ne traverse que la colonne
 * d’aujourd’hui.
 *
 * « Équipe » : une colonne par mécanicien (et « À attribuer » si besoin),
 * un seul jour. L’en-tête de colonne tient sur une ligne (avatar, prénom,
 * nombre de voitures s’il reste la place, durée prévue si la colonne est
 * large) et suit le défilement horizontal quand les colonnes ne tiennent pas.
 *
 * Ce que les jours montrés montrent sans créneau (voiture immobilisée depuis
 * un autre jour, demande à valider, rendez-vous manqué) passe en puces dans
 * la bande « Hors créneau », une fois chacune : rien de ce que montre la
 * liste ne disparaît.
 *
 * Zoom sur deux axes, sans aucun bouton : la place va aux cases.
 * - Pincement (iOS, Android). La direction se décide au début, d’après la
 *   position des deux doigts (`directionPincement`) : l’un au-dessus de
 *   l’autre, les heures (l’heure sous les doigts reste sous les doigts) ;
 *   côte à côte, le nombre de jours (« Journée », aimanté sur un nombre
 *   entier à la fin) ou la largeur des colonnes (« Équipe », le mécanicien
 *   sous les doigts reste sous les doigts) ; en diagonale, les deux.
 * - Web : Ctrl ou Cmd + molette (et pincement du pavé tactile) pour les
 *   heures, avec Maj en plus pour les jours ou les colonnes.
 * - VoiceOver et TalkBack : deux éléments réglables, sans place à l’écran.
 * Pendant le geste, seules les positions et les largeurs bougent (valeurs
 * partagées, fil d’interface) ; le contenu des cases et le placement se
 * recalculent à la fin, et le zoom est mémorisé dans la vue. Une astuce
 * discrète, en bas de la grille, dit le geste tant qu’on n’a jamais zoomé :
 * au survol de la souris sur le web, quelques secondes à l’ouverture sur le
 * téléphone.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureTouchEvent } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar, Etiquette, Legende, impulsion } from '@/components/ui';
import { estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Membre, Vehicule } from '@/domain/types';
import { duree } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { CaseIntervention, motEtat } from './CaseIntervention';
import {
  HAUTEUR_MIN_CASE,
  JOURS_MAX,
  PAS_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  aimanterJours,
  bornerZoom,
  bornesJours,
  bornesLargeurEquipe,
  creneauDuJour,
  defilementApresZoom,
  directionPincement,
  facteurAxe,
  heuresAxe,
  largeurEquipe as largeurEquipeBornee,
  placer,
  zonesFermees,
  type Creneau,
  type Place,
  type Plage,
} from './horaire';
import { pluriel } from './logique';
import type { ChampBloc, CouleurCase } from './vues';

export type ColonneEquipe = {
  /** null : « À attribuer » */
  membre: Membre | null;
  /** Charge du jour (`chargeDuJour`) ; absente pour « À attribuer » */
  charge?: { nb: number; minutes: number };
};

export type JourGrille = {
  date: Date;
  /** Horaires d’ouverture de ce jour (`garage.horaires[jour]`) ; null : fermé */
  plage: Plage;
  /** Interventions que ce jour montre (mêmes règles et même portée que la liste) */
  interventions: Intervention[];
};

type Props = {
  /**
   * « Journée » : les jours à partir du premier affiché, jusqu’à 7 (le
   * pincement peut en montrer davantage que `nbJours`) ; « Équipe » : le
   * jour choisi seul.
   */
  jours: JourGrille[];
  /** « Journée » : jours côte à côte au repos (1 à 7) */
  nbJours: number;
  /** Nombre de jours au repos (fin du geste) : mémorisé dans la vue */
  onNbJours: (n: number) => void;
  /** « Équipe » : largeur voulue d’une colonne (bornée à l’affichage) */
  largeurEquipe: number;
  /** Largeur de colonne au repos (fin du geste) : mémorisée dans la vue */
  onLargeurEquipe: (l: number) => void;
  jourChoisi: Date;
  /** Toucher l’en-tête d’un jour (plusieurs jours côte à côte) */
  onChoisirJour: (d: Date) => void;
  disposition: 'journee' | 'equipe';
  /** Colonnes de la disposition « Équipe », dans l’ordre */
  colonnes?: ColonneEquipe[];
  champs: ChampBloc[];
  couleur: CouleurCase;
  hauteurHeure: number;
  /** Zoom des heures au repos (fin du geste ou de la molette) : mémorisé dans la vue */
  onZoom: (h: number) => void;
  /** L’utilisateur n’a encore jamais zoomé : l’astuce du geste se montre */
  astuceZoom?: boolean;
  clientDe: (i: Intervention) => Client | undefined;
  vehiculeDe: (i: Intervention) => Vehicule | undefined;
  mecanicienDe: (i: Intervention) => Membre | null;
  onOuvrir: (id: string) => void;
  onActions: (id: string) => void;
  margeBasse: number;
};

/** Durée de l’astuce de zoom à l’ouverture de la grille (téléphone). */
const DUREE_ASTUCE_MS = 4000;
/** Largeur de la gouttière des heures. */
const GOUTTIERE = 46;
/** Marge au-dessus de la première heure : son libellé n’est pas coupé. */
const HAUT = 10;
/** « Journée » : marge à droite des colonnes de jours. */
const MARGE_DROITE = 8;
/** Demi-heures visibles à partir de ce zoom. */
const ZOOM_DEMI_HEURES = 48;
/** En-tête des jours (« lun. 9 ») ; sa cible d’appui atteint 44 pt par débordement. */
const HAUTEUR_ENTETE_JOURS = 28;
/** En-tête des colonnes « Équipe », sur une ligne. */
const HAUTEUR_ENTETE_EQUIPE = 32;
/** En deçà, une case resserre ses marges. */
const LARGEUR_CASE_ETROITE = 90;
/** « Équipe » : le nombre de voitures s’affiche à partir de cette largeur de colonne, la durée prévue à partir de la suivante. */
const LARGEUR_NB_VOITURES = 100;
const LARGEUR_CHARGE = 168;
/** « Journée » : en deçà, l’en-tête dit « L 9 » au lieu de « lun. 9 ». */
const LARGEUR_JOUR_COURT = 44;

/** Axes du pincement en cours (masque). */
const VERTICAL = 1;
const HORIZONTAL = 2;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Ligne d’heure ou de demi-heure : seule sa position suit le zoom. */
function Filet({ minutes, debut, h, demi }: { minutes: number; debut: number; h: SharedValue<number>; demi?: boolean }) {
  const style = useAnimatedStyle(() => ({
    top: HAUT + ((minutes - debut) / 60) * h.value,
    opacity: demi ? (h.value >= ZOOM_DEMI_HEURES ? 1 : 0) : 1,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: GOUTTIERE, right: 0, height: 1 }, style]}
      className={demi ? 'bg-line/50 dark:bg-line-dark/50' : 'bg-line dark:bg-line-dark'}
    />
  );
}

function LibelleHeure({ minutes, debut, h }: { minutes: number; debut: number; h: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    top: HAUT + ((minutes - debut) / 60) * h.value - 8,
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: GOUTTIERE - 6 }, style]}>
      <Text maxFontSizeMultiplier={1.2} className="text-right font-mono text-[11px] leading-[16px] text-faint dark:text-faint-dark">
        {hhmm(minutes)}
      </Text>
    </Animated.View>
  );
}

/**
 * Trait « maintenant ». `colonne` : rang de la colonne d’aujourd’hui
 * (« Journée »), qu’il est seul à traverser ; null : toute la largeur
 * (« Équipe », un seul jour).
 */
function Maintenant({ minutes, debut, h, colonne, w }: { minutes: number; debut: number; h: SharedValue<number>; colonne: number | null; w: SharedValue<number> }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => {
    const top = HAUT + ((minutes - debut) / 60) * h.value - 1;
    return colonne === null ? { top } : { top, left: GOUTTIERE + colonne * w.value - 4, width: w.value + 4 };
  });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`Maintenant, ${hhmm(minutes)}`}
      style={[
        { position: 'absolute', height: 2, flexDirection: 'row', alignItems: 'center' },
        colonne === null ? { left: GOUTTIERE - 4, right: 0 } : null,
        style,
      ]}>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.danger, marginTop: 0 }} />
      <View className="h-[2px] flex-1" style={{ backgroundColor: t.danger }} />
    </Animated.View>
  );
}

/** Colonne (jour ou mécanicien) : sa place et sa largeur suivent le zoom horizontal. */
function Colonne({ k, w, bord, children }: { k: number; w: SharedValue<number>; bord: boolean; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ left: k * w.value, width: w.value }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0 }, style]} className={bord ? 'border-l border-line dark:border-line-dark' : ''}>
      {children}
    </Animated.View>
  );
}

/** Heures où le garage est fermé ce jour-là : grisées. */
function ZoneFermee({ zone, debut, h }: { zone: { debut: number; fin: number }; debut: number; h: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    top: HAUT + ((zone.debut - debut) / 60) * h.value,
    height: ((zone.fin - zone.debut) / 60) * h.value,
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0 }, style]} className="bg-line/40 dark:bg-line-dark/40" />;
}

type PropsCase = {
  place: Place;
  debut: number;
  h: SharedValue<number>;
  hauteurRepos: number;
  etroite: boolean;
  intervention: Intervention;
} & Pick<Props, 'champs' | 'couleur' | 'clientDe' | 'vehiculeDe' | 'mecanicienDe' | 'onOuvrir' | 'onActions'>;

const hauteurCase = (place: Creneau, h: number) => {
  'worklet';
  return Math.max(HAUTEUR_MIN_CASE, ((place.fin - place.debut) / 60) * h - 2);
};

function CaseAnimee({
  place,
  debut,
  h,
  hauteurRepos,
  etroite,
  intervention: i,
  champs,
  couleur,
  clientDe,
  vehiculeDe,
  mecanicienDe,
  onOuvrir,
  onActions,
}: PropsCase) {
  const style = useAnimatedStyle(() => ({
    top: HAUT + ((place.debut - debut) / 60) * h.value + 1,
    height: hauteurCase(place, h.value),
  }));
  const gauche = (place.colonne / place.nbColonnes) * 100;
  const largeur = (place.etendue / place.nbColonnes) * 100;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${gauche}%`,
          width: `${largeur}%`,
          paddingHorizontal: 1.5,
        },
        style,
      ]}>
      <CaseIntervention
        intervention={i}
        client={clientDe(i)}
        vehicule={vehiculeDe(i)}
        mecanicien={mecanicienDe(i)}
        champs={champs}
        couleur={couleur}
        hauteur={hauteurCase(place, hauteurRepos)}
        etroite={etroite}
        onPress={() => onOuvrir(i.id)}
        onLongPress={() => onActions(i.id)}
      />
    </Animated.View>
  );
}

/** Puces « Hors créneau » : compactes, elles défilent à l’horizontale. */
function BandeHorsCreneau({
  liste,
  vehiculeDe,
  onOuvrir,
  onActions,
}: { liste: Intervention[] } & Pick<Props, 'vehiculeDe' | 'onOuvrir' | 'onActions'>) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8, alignItems: 'center' }}>
      {liste.map((i) => {
        const v = vehiculeDe(i);
        const voiture = v ? `${v.marque} ${v.modele}` : 'Véhicule inconnu';
        const mot = motEtat(i, t);
        const alerte = estBloquee(i) || i.statut === 'a_valider';
        return (
          <Pressable
            key={i.id}
            accessibilityRole="button"
            accessibilityLabel={`${voiture}, ${i.prestation}, ${mot}, sans créneau ce jour`}
            accessibilityHint="Appui long pour les actions rapides"
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              impulsion('leger');
              onOuvrir(i.id);
            }}
            onLongPress={() => {
              impulsion('moyen');
              onActions(i.id);
            }}
            delayLongPress={350}
            className="min-h-[36px] max-w-[240px] flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 active:opacity-70 dark:border-line-dark dark:bg-surface-dark">
            {i.prioritaire ? <View className="h-1.5 w-1.5 rounded-full bg-danger dark:bg-danger-dark" /> : null}
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="flex-shrink text-[13px] font-semibold text-ink dark:text-ink-dark">
              {voiture}
            </Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="text-[13px] font-semibold" style={{ color: alerte ? t.warn : t.muted }}>
              {mot}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** En-tête d’un jour (« Journée », plusieurs jours) : toucher choisit ce jour. */
function EnTeteJour({
  k,
  w,
  date,
  aujourdhui,
  choisi,
  ferme,
  court,
  onPress,
}: {
  k: number;
  w: SharedValue<number>;
  date: Date;
  aujourdhui: boolean;
  choisi: boolean;
  ferme: boolean;
  court: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({ left: k * w.value, width: w.value }));
  const label = [format(date, 'EEEE d MMMM', { locale: fr }), aujourdhui ? 'aujourd’hui' : null, ferme ? 'fermé' : null].filter(Boolean).join(', ');
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: choisi }}
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={() => {
          impulsion('leger');
          onPress();
        }}
        className={`mx-0.5 flex-1 items-center justify-center rounded-md active:opacity-60 ${choisi ? 'bg-surface2 dark:bg-surface2-dark' : ''}`}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          className={`text-[12px] ${aujourdhui || choisi ? 'font-bold' : 'font-medium'}`}
          style={{ color: aujourdhui ? t.accent : ferme ? t.faint : t.muted }}>
          {format(date, court ? 'EEEEE d' : 'EEE d', { locale: fr })}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const texteCharge = (c: { nb: number; minutes: number }) =>
  c.nb === 0 ? 'Libre' : c.minutes > 0 ? `${pluriel(c.nb, 'voiture')} · ${duree(c.minutes)}` : pluriel(c.nb, 'voiture');

/** En-tête d’une colonne « Équipe », sur une ligne : ce qui ne tient pas se tait. */
function EnTeteMembre({ k, w, colonne: c, largeur, nbAAttribuer }: { k: number; w: SharedValue<number>; colonne: ColonneEquipe; largeur: number; nbAAttribuer: number }) {
  const style = useAnimatedStyle(() => ({ left: k * w.value, width: w.value }));
  const nb = c.charge ? c.charge.nb : nbAAttribuer;
  const complet = c.charge ? texteCharge(c.charge) : pluriel(nbAAttribuer, 'voiture');
  const nom = c.membre ? c.membre.prenom : 'À attribuer';
  const detail =
    largeur < LARGEUR_NB_VOITURES ? null : largeur >= LARGEUR_CHARGE ? complet : c.charge && c.charge.nb === 0 ? 'Libre' : String(nb);
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${nom}, ${complet.replace(' · ', ', ')}`}
      style={[{ position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }, style]}>
      {c.membre ? (
        <Avatar membre={c.membre} taille={20} />
      ) : (
        <View className="h-[20px] w-[20px] rounded-full border border-dashed border-faint dark:border-faint-dark" />
      )}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} className="flex-shrink text-[13px] font-semibold text-ink dark:text-ink-dark">
        {nom}
      </Text>
      {detail ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} className="flex-shrink text-[11px] text-muted dark:text-muted-dark">
          {detail}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Sur un Mac, le zoom à la molette se fait avec ⌘ : l’astuce le dit. */
const SUR_MAC = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Élément DOM qui défile sur cet axe sous `racine` (web). La référence
 * animée de Reanimated ne donne pas cet élément : on le lit dans le DOM.
 */
function defilantDans(racine: HTMLElement, axe: 'x' | 'y'): HTMLElement | null {
  for (const d of Array.from(racine.querySelectorAll<HTMLElement>('div'))) {
    const s = getComputedStyle(d);
    const o = axe === 'y' ? s.overflowY : s.overflowX;
    if (o === 'auto' || o === 'scroll') return d;
  }
  return null;
}

export function GrilleHoraire(props: Props) {
  const {
    jours,
    nbJours,
    onNbJours,
    largeurEquipe,
    onLargeurEquipe,
    jourChoisi,
    onChoisirJour,
    disposition,
    colonnes = [],
    champs,
    couleur,
    hauteurHeure,
    onZoom,
    astuceZoom,
    margeBasse,
  } = props;
  const equipe = disposition === 'equipe';

  // ── Ce que chaque jour montre avec un créneau ce jour-là, et ce qu’il montre sans
  const parJour = useMemo(
    () =>
      jours.map((j) => {
        const avec: Intervention[] = [];
        const hors: Intervention[] = [];
        const creneaux = new Map<string, Creneau>();
        for (const i of j.interventions) {
          const c = creneauDuJour(i, j.date);
          if (c) {
            avec.push(i);
            creneaux.set(i.id, c);
          } else hors.push(i);
        }
        return { cle: j.date.toDateString(), jour: j, avec, hors, creneaux };
      }),
    [jours],
  );

  // ── Jours montrés au repos, jours rendus (tous pendant un pincement horizontal : ceux qui entrent sont déjà là)
  const [pince, setPince] = useState(0);
  const n = equipe ? 1 : Math.max(1, Math.min(nbJours, parJour.length));
  const montres = parJour.slice(0, n);
  const rendus = equipe || !(pince & HORIZONTAL) ? montres : parJour;

  const { debut, fin } = useMemo(
    () =>
      bornesJours(
        montres.map((p) => p.jour.plage),
        montres.flatMap((p) => [...p.creneaux.values()]),
      ),
    [montres],
  );

  // Hors créneau : chaque voiture une fois, et pas celle qui a déjà sa case un des jours montrés.
  const horsCreneau = useMemo(() => {
    const avecCase = new Set(montres.flatMap((p) => p.avec.map((i) => i.id)));
    const vues = new Set<string>();
    const liste: Intervention[] = [];
    for (const p of montres)
      for (const i of p.hors) {
        if (avecCase.has(i.id) || vues.has(i.id)) continue;
        vues.add(i.id);
        liste.push(i);
      }
    return liste;
  }, [montres]);

  // ── Zoom des heures : valeur partagée pendant le geste, état au repos
  const h = useSharedValue(hauteurHeure);
  const [repos, setRepos] = useState(hauteurHeure);
  useEffect(() => {
    if (Math.abs(h.value - hauteurHeure) > 0.5) h.value = hauteurHeure;
    setRepos(hauteurHeure);
  }, [hauteurHeure, h]);

  const finZoom = useCallback(
    (nh: number) => {
      const b = bornerZoom(nh);
      setRepos(b);
      onZoom(b);
    },
    [onZoom],
  );

  // ── Dimensions
  const [vue, setVue] = useState({ l: 0, h: 0 });
  const surMesure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== vue.l || height !== vue.h) setVue({ l: width, h: height });
  };
  const nbColonnes = equipe ? colonnes.length : 1;
  const disponible = Math.max(0, vue.l - GOUTTIERE - (equipe ? 0 : MARGE_DROITE));

  // ── Zoom horizontal : largeur d’une colonne (jour ou mécanicien), partagée pendant le geste
  const largeurRepos = equipe ? largeurEquipeBornee(largeurEquipe, disponible, nbColonnes) : disponible / n;
  const w = useSharedValue(largeurRepos);
  const dispo = useSharedValue(disponible);
  // Dernière largeur posée : la fin du geste la pose elle-même (en douceur), le rendu qui suit ne la repose pas.
  const cibleW = useRef(largeurRepos);
  useEffect(() => {
    dispo.value = disponible;
  }, [disponible, dispo]);
  useEffect(() => {
    if (Math.abs(cibleW.current - largeurRepos) < 0.5) return;
    cibleW.current = largeurRepos;
    w.value = largeurRepos;
  }, [largeurRepos, w]);

  const finJours = useCallback(
    (nf: number, cible: number) => {
      cibleW.current = cible;
      onNbJours(nf);
    },
    [onNbJours],
  );
  const finLargeur = useCallback(
    (l: number) => {
      cibleW.current = l;
      onLargeurEquipe(l);
    },
    [onLargeurEquipe],
  );

  // ── Placement, colonne par colonne
  const dureeVisible = (HAUTEUR_MIN_CASE / repos) * 60;
  const colonnesCases = useMemo(() => {
    const groupes: { cle: string; liste: Intervention[]; creneaux: Map<string, Creneau> }[] = equipe
      ? colonnes.map((c) => ({
          cle: c.membre?.id ?? 'a-attribuer',
          liste: (parJour[0]?.avec ?? []).filter((i) => (i.membreId ?? null) === (c.membre?.id ?? null)),
          creneaux: parJour[0]?.creneaux ?? new Map<string, Creneau>(),
        }))
      : rendus.map((p) => ({ cle: p.cle, liste: p.avec, creneaux: p.creneaux }));
    return groupes.map((g) => ({
      cle: g.cle,
      places: placer(
        g.liste.map((i) => g.creneaux.get(i.id)!),
        dureeVisible,
      ),
      parId: new Map(g.liste.map((i) => [i.id, i])),
    }));
  }, [equipe, colonnes, parJour, rendus, dureeVisible]);

  // ── Défilement
  const defilement = useAnimatedRef<Animated.ScrollView>();
  const defilementX = useAnimatedRef<Animated.ScrollView>();
  const defil = useSharedValue(0);
  const defilX = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler((e) => {
    defil.value = e.contentOffset.y;
  });
  const surDefilementX = useAnimatedScrollHandler((e) => {
    defilX.value = e.contentOffset.x;
  });

  const contenu = useAnimatedStyle(() => ({
    height: HAUT + ((fin - debut) / 60) * h.value + margeBasse,
  }));
  const largeurContenuX = useAnimatedStyle(() => ({ width: w.value * nbColonnes }));
  const enTeteSuit = useAnimatedStyle(() => ({
    transform: [{ translateX: -defilX.value }],
  }));

  // Maintenant, remis à jour chaque minute : seulement si aujourd’hui est montré.
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60000);
    return () => {
      clearInterval(minuterie);
    };
  }, []);
  const rangAujourdhui = rendus.findIndex((p) => memeJour(p.jour.date, maintenant));
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  const maintenantVisible = rangAujourdhui >= 0 && minutesMaintenant >= debut && minutesMaintenant <= fin;
  const aujourdhuiMontre = montres.some((p) => memeJour(p.jour.date, maintenant));

  const defilerVers = useCallback(
    (y: number) => {
      const r = defilement.current as unknown as {
        scrollTo?: (o: { y: number; animated: boolean }) => void;
      } | null;
      r?.scrollTo?.({ y: Math.max(0, y), animated: false });
    },
    [defilement],
  );

  // Défilement initial : l’heure courante (un tiers depuis le haut), sinon la première case.
  const premiereCase = Math.min(...montres.flatMap((p) => [...p.creneaux.values()].map((c) => c.debut)));
  const cleJour = `${parJour[0]?.cle ?? ''}-${disposition}`;
  const dejaPlace = useRef<string | null>(null);
  useEffect(() => {
    if (vue.h === 0 || dejaPlace.current === cleJour) return;
    dejaPlace.current = cleJour;
    const surMaintenant = aujourdhuiMontre && minutesMaintenant >= debut && minutesMaintenant <= fin;
    const cible = surMaintenant ? minutesMaintenant : Number.isFinite(premiereCase) ? premiereCase - 30 : debut;
    const y = HAUT + ((cible - debut) / 60) * h.value - (surMaintenant ? vue.h / 3 : 0);
    requestAnimationFrame(() => {
      defilerVers(y);
    });
  }, [vue.h, cleJour, aujourdhuiMontre, minutesMaintenant, premiereCase, debut, fin, h, defilerVers]);

  // ── Zoom par les éléments réglables (VoiceOver, TalkBack)
  const zoomer = (facteur: number) => {
    const avant = h.value;
    const apres = bornerZoom(avant * facteur);
    if (apres === avant) return;
    // Le centre de la zone visible reste en place.
    const y = defilementApresZoom(defil.value, vue.h / 2, avant, apres);
    h.value = apres;
    finZoom(apres);
    requestAnimationFrame(() => {
      defilerVers(y);
    });
  };
  const elargirAccessible = (sens: 1 | -1) => {
    if (equipe) {
      const b = bornesLargeurEquipe(disponible, nbColonnes);
      const l = Math.min(b.max, Math.max(b.min, sens > 0 ? largeurRepos * PAS_ZOOM : largeurRepos / PAS_ZOOM));
      if (l === largeurRepos) return;
      w.value = l;
      finLargeur(l);
      return;
    }
    // « Plus » : un jour de plus côte à côte.
    const nf = Math.max(1, Math.min(JOURS_MAX, n + sens));
    if (nf === n || disponible <= 0) return;
    w.value = disponible / nf;
    finJours(nf, disponible / nf);
  };

  // ── Pincement (iOS, Android) : direction choisie au début d’après l’écart des deux doigts sur chaque axe.
  const ecartX = useSharedValue(0);
  const ecartY = useSharedValue(0);
  const departX = useSharedValue(0);
  const departY = useSharedValue(0);
  const axes = useSharedValue(0);
  const hDepart = useSharedValue(hauteurHeure);
  const defilDepart = useSharedValue(0);
  const focalDepart = useSharedValue(0);
  const wDepart = useSharedValue(0);
  const defilXDepart = useSharedValue(0);
  const focalXDepart = useSharedValue(0);
  const pincement = useMemo(() => {
    const lireEcarts = (e: GestureTouchEvent) => {
      'worklet';
      if (e.allTouches.length < 2) return;
      ecartX.value = Math.abs(e.allTouches[0].x - e.allTouches[1].x);
      ecartY.value = Math.abs(e.allTouches[0].y - e.allTouches[1].y);
    };
    return Gesture.Pinch()
      .onTouchesDown((e) => {
        'worklet';
        lireEcarts(e);
      })
      .onTouchesMove((e) => {
        'worklet';
        lireEcarts(e);
      })
      .onStart((e) => {
        'worklet';
        const sens = directionPincement(ecartX.value, ecartY.value);
        const m = sens === 'vertical' ? VERTICAL : sens === 'horizontal' ? HORIZONTAL : VERTICAL | HORIZONTAL;
        axes.value = m;
        departX.value = ecartX.value;
        departY.value = ecartY.value;
        hDepart.value = h.value;
        defilDepart.value = defil.value;
        focalDepart.value = e.focalY;
        wDepart.value = w.value;
        defilXDepart.value = defilX.value;
        focalXDepart.value = e.focalX - GOUTTIERE;
        scheduleOnRN(setPince, m);
      })
      .onUpdate((e) => {
        'worklet';
        const m = axes.value;
        const deux = (m & VERTICAL) !== 0 && (m & HORIZONTAL) !== 0;
        if (m & VERTICAL) {
          // En diagonale, chaque axe suit l’écart des doigts sur lui-même.
          const f = deux ? facteurAxe(departY.value, ecartY.value, e.scale) : e.scale;
          const nh = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, hDepart.value * f));
          // Point d’ancrage gardé sous les doigts, qui peuvent aussi glisser pendant le pincement.
          const y = defilementApresZoom(defilDepart.value, focalDepart.value, hDepart.value, nh) + (focalDepart.value - e.focalY);
          h.value = nh;
          scrollTo(defilement, 0, Math.max(0, y), false);
        }
        if (m & HORIZONTAL) {
          const f = deux ? facteurAxe(departX.value, ecartX.value, e.scale) : e.scale;
          const d = dispo.value;
          if (equipe) {
            const b = bornesLargeurEquipe(d, nbColonnes);
            const nw = Math.min(b.max, Math.max(b.min, wDepart.value * f));
            // Le mécanicien sous les doigts reste sous les doigts.
            const x = defilementApresZoom(defilXDepart.value, focalXDepart.value, wDepart.value, nw) + (focalXDepart.value - (e.focalX - GOUTTIERE));
            w.value = nw;
            scrollTo(defilementX, Math.min(Math.max(0, nw * nbColonnes - d), Math.max(0, x)), 0, false);
          } else if (d > 0) {
            // Les jours partent du bord gauche : écarter les doigts élargit, les rapprocher fait entrer des jours.
            w.value = Math.min(d, Math.max(d / JOURS_MAX, wDepart.value * f));
          }
        }
      })
      .onEnd(() => {
        'worklet';
        const m = axes.value;
        if (m & VERTICAL) scheduleOnRN(finZoom, h.value);
        if (m & HORIZONTAL) {
          if (equipe) scheduleOnRN(finLargeur, w.value);
          else {
            const d = dispo.value;
            const nf = aimanterJours(d, w.value);
            const cible = d / nf;
            w.value = withTiming(cible, { duration: 180 });
            scheduleOnRN(finJours, nf, cible);
          }
        }
      })
      .onFinalize(() => {
        'worklet';
        axes.value = 0;
        scheduleOnRN(setPince, 0);
      });
  }, [
    ecartX,
    ecartY,
    departX,
    departY,
    axes,
    h,
    defil,
    hDepart,
    defilDepart,
    focalDepart,
    w,
    dispo,
    wDepart,
    defilX,
    defilXDepart,
    focalXDepart,
    defilement,
    defilementX,
    equipe,
    nbColonnes,
    finZoom,
    finLargeur,
    finJours,
  ]);

  // ── Web : Ctrl ou Cmd + molette (et pincement du pavé tactile, même événement) pour les heures ; avec Maj, jours ou colonnes.
  const cadreWeb = useRef<View>(null);
  const [survol, setSurvol] = useState(false);
  const zoomWeb = useRef<{
    h: number;
    w: number;
    minuterie: ReturnType<typeof setTimeout> | null;
    minuterieX: ReturnType<typeof setTimeout> | null;
  }>({ h: hauteurHeure, w: 0, minuterie: null, minuterieX: null });
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const racine = cadreWeb.current as unknown as HTMLElement | null;
    if (!racine || typeof racine.addEventListener !== 'function') return undefined;
    const z = zoomWeb.current;
    const surRoulette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.shiftKey) {
        // Avec Maj, le navigateur passe souvent le défilement à l’horizontale : deltaX.
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (!delta || disponible <= 0) return;
        const avant = w.value;
        if (equipe) {
          const b = bornesLargeurEquipe(disponible, nbColonnes);
          const apres = Math.min(b.max, Math.max(b.min, avant * Math.exp(-delta * 0.004)));
          if (apres === avant) return;
          const noeudX = defilantDans(racine, 'x');
          if (noeudX) {
            const focal = e.clientX - noeudX.getBoundingClientRect().left;
            const x = defilementApresZoom(noeudX.scrollLeft, focal, avant, apres);
            requestAnimationFrame(() => {
              noeudX.scrollLeft = x;
            });
          }
          w.value = apres;
          z.w = apres;
          if (z.minuterieX) clearTimeout(z.minuterieX);
          z.minuterieX = setTimeout(() => finLargeur(z.w), 120);
          return;
        }
        const apres = Math.min(disponible, Math.max(disponible / JOURS_MAX, avant * Math.exp(-delta * 0.004)));
        if (apres === avant) return;
        w.value = apres;
        z.w = apres;
        setPince((m) => m | HORIZONTAL);
        if (z.minuterieX) clearTimeout(z.minuterieX);
        z.minuterieX = setTimeout(() => {
          const nf = aimanterJours(disponible, z.w);
          const cible = disponible / nf;
          w.value = withTiming(cible, { duration: 180 });
          finJours(nf, cible);
          setPince((m) => m & ~HORIZONTAL);
        }, 160);
        return;
      }
      // Cherché ici seulement : pendant le zoom horizontal la grille ne défile plus (`scrollEnabled`), ce nœud n’existe pas.
      const noeud = defilantDans(racine, 'y');
      if (!noeud) return;
      const avant = h.value;
      const apres = bornerZoom(avant * Math.exp(-e.deltaY * 0.01));
      if (apres === avant) return;
      const focal = e.clientY - noeud.getBoundingClientRect().top;
      const y = defilementApresZoom(noeud.scrollTop, focal, avant, apres);
      h.value = apres;
      requestAnimationFrame(() => {
        noeud.scrollTop = y;
      });
      // Contenu des cases et placement recalculés quand la molette s’arrête.
      z.h = apres;
      if (z.minuterie) clearTimeout(z.minuterie);
      z.minuterie = setTimeout(() => finZoom(z.h), 120);
    };
    // L’astuce de zoom suit la souris : elle n’existe que pour qui peut survoler.
    const entree = () => setSurvol(true);
    const sortie = () => setSurvol(false);
    racine.addEventListener('wheel', surRoulette, { passive: false });
    racine.addEventListener('mouseenter', entree);
    racine.addEventListener('mouseleave', sortie);
    return () => {
      racine.removeEventListener('wheel', surRoulette);
      racine.removeEventListener('mouseenter', entree);
      racine.removeEventListener('mouseleave', sortie);
    };
  }, [h, w, finZoom, finJours, finLargeur, equipe, nbColonnes, disponible]);

  const heures = heuresAxe(debut, fin);
  const nbCases = montres.reduce((s, p) => s + p.avec.length, 0);

  // ── Astuce de zoom : au survol (web), quelques secondes à l’ouverture (téléphone), jusqu’au premier zoom.
  const [accueil, setAccueil] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (!accueil) return undefined;
    const minuterie = setTimeout(() => setAccueil(false), DUREE_ASTUCE_MS);
    return () => {
      clearTimeout(minuterie);
    };
  }, [accueil]);
  const astuceVisible = Boolean(astuceZoom) && nbCases > 0 && (Platform.OS === 'web' ? survol : accueil);
  const enLargeur = equipe ? 'colonnes' : 'jours';
  const touche = SUR_MAC ? '⌘' : 'Ctrl';
  const texteAstuce =
    Platform.OS !== 'web'
      ? `Pincez : en hauteur les heures, en largeur les ${enLargeur}`
      : `${touche} + molette : heures · ${touche} + Maj + molette : ${enLargeur}`;

  const casesDe = (g: (typeof colonnesCases)[number]) =>
    g.places.map((place) => (
      <CaseAnimee
        key={place.id}
        place={place}
        debut={debut}
        h={h}
        hauteurRepos={repos}
        etroite={place.etendue < place.nbColonnes || (largeurRepos * place.etendue) / place.nbColonnes < LARGEUR_CASE_ETROITE}
        intervention={g.parId.get(place.id)!}
        champs={champs}
        couleur={couleur}
        clientDe={props.clientDe}
        vehiculeDe={props.vehiculeDe}
        mecanicienDe={props.mecanicienDe}
        onOuvrir={props.onOuvrir}
        onActions={props.onActions}
      />
    ));

  const plusieursJours = !equipe && rendus.length > 1;
  const zonesEquipe = equipe ? zonesFermees(parJour[0]?.jour.plage, debut, fin) : [];
  const equipeFermee = equipe && parJour[0] !== undefined && zonesEquipe.length === 1 && zonesEquipe[0].debut === debut && zonesEquipe[0].fin === fin;

  const grille = (
    <Animated.View style={{ flex: 1 }} onLayout={surMesure}>
      <Animated.ScrollView
        ref={defilement}
        onScroll={surDefilement}
        scrollEventThrottle={16}
        scrollEnabled={!pince}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={`Grille horaire, ${pluriel(nbCases, 'intervention')} avec un créneau ${n > 1 ? `sur ${n} jours` : 'ce jour'}`}>
        <Animated.View style={contenu}>
          {heures.map((m) => (
            <Filet key={`h${m}`} minutes={m} debut={debut} h={h} />
          ))}
          {heures.slice(0, -1).map((m) => (
            <Filet key={`d${m}`} minutes={m + 30} debut={debut} h={h} demi />
          ))}
          {heures.map((m) => (
            <LibelleHeure key={`l${m}`} minutes={m} debut={debut} h={h} />
          ))}
          <View
            style={{
              position: 'absolute',
              left: GOUTTIERE,
              right: equipe ? 0 : MARGE_DROITE,
              top: 0,
              bottom: 0,
              overflow: 'hidden',
            }}>
            {equipe ? (
              <Animated.ScrollView
                ref={defilementX}
                horizontal
                style={{ flex: 1 }}
                contentContainerStyle={{ height: '100%' }}
                onScroll={surDefilementX}
                scrollEventThrottle={16}
                scrollEnabled={!pince}
                showsHorizontalScrollIndicator={false}
                bounces={false}>
                <Animated.View style={[{ height: '100%' }, largeurContenuX]}>
                  {zonesEquipe.map((z) => (
                    <ZoneFermee key={`f${z.debut}`} zone={z} debut={debut} h={h} />
                  ))}
                  {colonnesCases.map((g, k) => (
                    <Colonne key={g.cle} k={k} w={w} bord>
                      {casesDe(g)}
                    </Colonne>
                  ))}
                </Animated.View>
              </Animated.ScrollView>
            ) : (
              rendus.map((p, k) => {
                const zones = zonesFermees(p.jour.plage, debut, fin);
                const ferme = zones.length === 1 && zones[0].debut === debut && zones[0].fin === fin;
                const g = colonnesCases[k];
                return (
                  <Colonne key={p.cle} k={k} w={w} bord={k > 0}>
                    {zones.map((z) => (
                      <ZoneFermee key={`f${z.debut}`} zone={z} debut={debut} h={h} />
                    ))}
                    {ferme ? (
                      <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: HAUT + 6 }}>
                        <Text maxFontSizeMultiplier={1.2} className="text-[11px] font-semibold text-faint dark:text-faint-dark">
                          Fermé
                        </Text>
                      </View>
                    ) : null}
                    {g ? casesDe(g) : null}
                  </Colonne>
                );
              })
            )}
          </View>
          {equipeFermee ? (
            <View pointerEvents="none" className="absolute right-0 items-center" style={{ left: GOUTTIERE, top: HAUT + 6 }}>
              <Text maxFontSizeMultiplier={1.2} className="text-[11px] font-semibold text-faint dark:text-faint-dark">
                Fermé
              </Text>
            </View>
          ) : null}
          {maintenantVisible ? <Maintenant minutes={minutesMaintenant} debut={debut} h={h} colonne={equipe ? null : rangAujourdhui} w={w} /> : null}
        </Animated.View>
      </Animated.ScrollView>
    </Animated.View>
  );

  return (
    <View className="flex-1">
      {/* Bande « Hors créneau », seulement s’il y en a. Sans en-têtes au-dessus des cases, un filet la sépare des cases qui défilent dessous. */}
      <View className={equipe || plusieursJours ? '' : 'border-b border-line dark:border-line-dark'}>
        {horsCreneau.length ? (
          <View className="pb-2 pl-4 pt-1">
            <Etiquette className="mb-1">Hors créneau · {horsCreneau.length}</Etiquette>
            <BandeHorsCreneau liste={horsCreneau} vehiculeDe={props.vehiculeDe} onOuvrir={props.onOuvrir} onActions={props.onActions} />
          </View>
        ) : null}
      </View>
      {Platform.OS === 'web' ? null : (
        // Le zoom sans pincement : deux éléments réglables, sans place à l’écran.
        <>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Zoom des heures"
            accessibilityValue={{ text: `${Math.round((repos / ZOOM_MAX) * 100)} %` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment') zoomer(PAS_ZOOM);
              if (e.nativeEvent.actionName === 'decrement') zoomer(1 / PAS_ZOOM);
            }}
            style={{ height: 1 }}
          />
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={equipe ? 'Largeur des colonnes' : 'Jours côte à côte'}
            accessibilityValue={{ text: equipe ? `${Math.round(largeurRepos)} points` : pluriel(n, 'jour') }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment') elargirAccessible(1);
              if (e.nativeEvent.actionName === 'decrement') elargirAccessible(-1);
            }}
            style={{ height: 1 }}
          />
        </>
      )}

      {plusieursJours ? (
        <View className="border-b border-line dark:border-line-dark" style={{ paddingLeft: GOUTTIERE, paddingRight: MARGE_DROITE, paddingBottom: 4 }}>
          <View style={{ height: HAUTEUR_ENTETE_JOURS, overflow: 'hidden' }}>
            {rendus.map((p, k) => {
              const zones = zonesFermees(p.jour.plage, debut, fin);
              return (
                <EnTeteJour
                  key={p.cle}
                  k={k}
                  w={w}
                  date={p.jour.date}
                  aujourdhui={memeJour(p.jour.date, maintenant)}
                  choisi={memeJour(p.jour.date, jourChoisi)}
                  ferme={zones.length === 1 && zones[0].debut === debut && zones[0].fin === fin}
                  court={largeurRepos < LARGEUR_JOUR_COURT}
                  onPress={() => onChoisirJour(p.jour.date)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {equipe ? (
        <View className="overflow-hidden border-b border-line dark:border-line-dark" style={{ paddingLeft: GOUTTIERE, height: HAUTEUR_ENTETE_EQUIPE }}>
          <Animated.View style={[{ flex: 1 }, enTeteSuit]}>
            {colonnes.map((c, k) => (
              <EnTeteMembre
                key={c.membre?.id ?? 'a-attribuer'}
                k={k}
                w={w}
                colonne={c}
                largeur={largeurRepos}
                nbAAttribuer={(parJour[0]?.jour.interventions ?? []).filter((i) => !i.membreId && i.statut !== 'livre' && i.statut !== 'annule').length}
              />
            ))}
          </Animated.View>
        </View>
      ) : null}

      {Platform.OS === 'web' ? (
        <View ref={cadreWeb} className="flex-1">
          {grille}
        </View>
      ) : (
        <GestureDetector gesture={pincement}>{grille}</GestureDetector>
      )}
      {astuceVisible ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          pointerEvents="none"
          className="absolute left-0 right-0 items-center px-4"
          style={{ bottom: margeBasse + 8 }}>
          <View className="rounded-full border border-line bg-surface2 px-3 py-1.5 dark:border-line-dark dark:bg-surface2-dark">
            <Legende className="text-[12px]" numberOfLines={1}>
              {texteAstuce}
            </Legende>
          </View>
        </Animated.View>
      ) : null}
      {nbCases === 0 ? (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: '45%' }}>
          <Legende ton="faint">{n > 1 ? 'Aucun créneau sur ces jours' : 'Aucun créneau ce jour'}</Legende>
        </View>
      ) : null}
    </View>
  );
}
