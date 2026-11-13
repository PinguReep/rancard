/**
 * Grille horaire du planning (vues « Journée » et « Équipe ») : l’emploi
 * du temps de l’atelier, façon agenda. Le temps descend, les heures à
 * gauche, de l’ouverture à la fermeture du garage ; chaque intervention est
 * une case placée et dimensionnée selon son créneau. Une case seule prend
 * toute la largeur de sa colonne ; deux voitures dans la même heure se la
 * partagent, côte à côte (`horaire.ts`).
 *
 * « Journée » : toujours sept colonnes, la semaine du lundi au dimanche du
 * jour choisi, dans un défilement horizontal aimanté sur les colonnes ; la
 * grille défile jusqu’au jour choisi quand il change. L’axe des heures
 * couvre l’union des horaires de la semaine ; les heures où un jour est
 * fermé sont grisées dans sa colonne (toute la colonne, avec « Fermé », un
 * jour de fermeture). Le trait « maintenant » ne traverse que la colonne
 * d’aujourd’hui.
 *
 * « Équipe » : une colonne par mécanicien (et « À attribuer » si besoin),
 * un seul jour.
 *
 * Toujours visibles, quel que soit le zoom ou le défilement : la gouttière
 * des heures à gauche (hors du défilement horizontal) et la ligne d’en-tête
 * en haut (hors du défilement vertical) : les jours (« lun. 9 », aujourd’hui
 * en couleur d’accent ; le toucher choisit ce jour) ou les mécaniciens.
 * L’en-tête suit le défilement horizontal et la largeur des colonnes par les
 * mêmes valeurs partagées que les colonnes : aucun décalage.
 *
 * Ce que le jour choisi montre sans créneau ce jour-là (voiture immobilisée
 * depuis un autre jour, demande à valider, rendez-vous manqué) passe en
 * puces dans la bande « Hors créneau » : rien de ce que montre la liste ne
 * disparaît.
 *
 * Un seul zoom, lié : un niveau entre 0 et 1 règle à la fois la largeur des
 * colonnes et la hauteur des heures (`horaire.ts`). Pincement (iOS,
 * Android), Ctrl ou Cmd + molette (web), un élément réglable (VoiceOver,
 * TalkBack). Le point sous les doigts reste sous les doigts sur les deux
 * axes. Pendant le geste, seules les valeurs partagées bougent (fil
 * d’interface) ; le contenu des cases et le placement se recalculent à la
 * fin, et le niveau est mémorisé dans la vue. Une astuce discrète, en bas de
 * la grille, dit le geste tant qu’on n’a jamais zoomé.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
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
  LARGEUR_COLONNE_MIN,
  ancrer,
  bornerNiveau,
  bornesJours,
  bornesLargeur,
  creneauDuJour,
  hauteurDuNiveau,
  heuresAxe,
  largeurDuNiveau,
  niveauApresEchelle,
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
  /** « Journée » : les sept jours de la semaine, du lundi ; « Équipe » : le jour choisi seul. */
  jours: JourGrille[];
  jourChoisi: Date;
  /** Toucher l’en-tête d’un jour */
  onChoisirJour: (d: Date) => void;
  disposition: 'journee' | 'equipe';
  /** Colonnes de la disposition « Équipe », dans l’ordre */
  colonnes?: ColonneEquipe[];
  champs: ChampBloc[];
  couleur: CouleurCase;
  /** Niveau de zoom au repos, de 0 (tout tient) à 1 (une colonne remplit l’écran) */
  niveau: number;
  /** Niveau au repos (fin du geste ou de la molette) : mémorisé dans la vue */
  onNiveau: (t: number) => void;
  /** L’utilisateur n’a encore jamais zoomé : l’astuce du geste se montre */
  astuceZoom?: boolean;
  clientDe: (i: Intervention) => Client | undefined;
  vehiculeDe: (i: Intervention) => Vehicule | undefined;
  mecanicienDe: (i: Intervention) => Membre | null;
  onOuvrir: (id: string) => void;
  onActions: (id: string) => void;
  margeBasse: number;
  /** Téléphone couché : la bande « Hors créneau » se tait, la hauteur va à la grille */
  sansHorsCreneau?: boolean;
};

/** Durée de l’astuce de zoom à l’ouverture de la grille (téléphone). */
const DUREE_ASTUCE_MS = 4000;
/** Largeur de la gouttière des heures. */
const GOUTTIERE = 46;
/** Marge au-dessus de la première heure : son libellé n’est pas coupé. */
const HAUT = 10;
/** Demi-heures visibles à partir de cette hauteur d’heure. */
const ZOOM_DEMI_HEURES = 48;
/** En-tête des jours : toute sa hauteur est la cible d’appui. */
const HAUTEUR_ENTETE_JOURS = 44;
/** En-tête des colonnes « Équipe », sur une ligne. */
const HAUTEUR_ENTETE_EQUIPE = 32;
/** En deçà, une case resserre ses marges. */
const LARGEUR_CASE_ETROITE = 90;
/** « Équipe » : le nombre de voitures s’affiche à partir de cette largeur de colonne, la durée prévue à partir de la suivante. */
const LARGEUR_NB_VOITURES = 100;
const LARGEUR_CHARGE = 168;
/** « Journée » : en deçà, l’en-tête dit « L 9 » au lieu de « lun. 9 ». */
const LARGEUR_JOUR_COURT = 60;
/** Pas de l’élément réglable (VoiceOver, TalkBack), en niveau. */
const PAS_ACCESSIBLE = 0.2;
/** Molette : échelle `e^(−deltaY · k)` par événement. */
const SENSIBILITE_MOLETTE = 0.005;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/*
 * Règle de ce fichier : une vue animée ne reçoit qu’UN style, son style animé, qui porte aussi ce qui
 * est fixe (position, bords, couleur). Sur iPhone, un style fixe posé à côté d’un style animé (tableau
 * `[fixe, animé]`) ou une `className` sur la vue animée ne sont pas appliqués : les heures passaient à
 * droite, les colonnes et les cases perdaient leur place (vu sur simulateur le 13 novembre 2026).
 */

/** Ligne d’heure ou de demi-heure : seule sa position suit le zoom. */
function Filet({ minutes, debut, h, demi }: { minutes: number; debut: number; h: SharedValue<number>; demi?: boolean }) {
  const t = useTheme();
  const couleur = demi ? `${t.line}80` : t.line;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: GOUTTIERE,
    right: 0,
    height: 1,
    backgroundColor: couleur,
    top: HAUT + ((minutes - debut) / 60) * h.value,
    opacity: demi ? (h.value >= ZOOM_DEMI_HEURES ? 1 : 0) : 1,
  }));
  return <Animated.View pointerEvents="none" style={style} />;
}

function LibelleHeure({ minutes, debut, h }: { minutes: number; debut: number; h: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    width: GOUTTIERE - 6,
    top: HAUT + ((minutes - debut) / 60) * h.value - 8,
  }));
  return (
    <Animated.View pointerEvents="none" style={style}>
      <Text maxFontSizeMultiplier={1.2} className="text-right font-mono text-[11px] leading-[16px] text-faint dark:text-faint-dark">
        {hhmm(minutes)}
      </Text>
    </Animated.View>
  );
}

/**
 * Trait « maintenant ». `colonne` : rang de la colonne d’aujourd’hui
 * (« Journée »), qu’il est seul à traverser ; null : toutes les colonnes
 * (« Équipe », un seul jour).
 */
function Maintenant({ minutes, debut, h, w, colonne, nb }: { minutes: number; debut: number; h: SharedValue<number>; w: SharedValue<number>; colonne: number | null; nb: number }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    height: 2,
    flexDirection: 'row',
    alignItems: 'center',
    top: HAUT + ((minutes - debut) / 60) * h.value - 1,
    left: (colonne ?? 0) * w.value,
    width: (colonne === null ? nb : 1) * w.value,
  }));
  return (
    <Animated.View pointerEvents="none" accessibilityLabel={`Maintenant, ${hhmm(minutes)}`} style={style}>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.danger }} />
      <View className="h-[2px] flex-1" style={{ backgroundColor: t.danger }} />
    </Animated.View>
  );
}

/** Colonne (jour ou mécanicien) : sa place et sa largeur suivent le zoom. */
function Colonne({ k, w, children }: { k: number; w: SharedValue<number>; children: ReactNode }) {
  const t = useTheme();
  const filet = t.line;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: filet,
    left: k * w.value,
    width: w.value,
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Heures où le garage est fermé ce jour-là : grisées. */
function ZoneFermee({ zone, debut, h }: { zone: { debut: number; fin: number }; debut: number; h: SharedValue<number> }) {
  const t = useTheme();
  const fond = `${t.line}66`;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: fond,
    top: HAUT + ((zone.debut - debut) / 60) * h.value,
    height: ((zone.fin - zone.debut) / 60) * h.value,
  }));
  return <Animated.View pointerEvents="none" style={style} />;
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

/** Case d’une intervention : en pourcentage de sa colonne (toute la largeur, seule dans son créneau), la hauteur suit le zoom. */
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
  const gauche = `${(place.colonne / place.nbColonnes) * 100}%` as const;
  const largeur = `${(place.etendue / place.nbColonnes) * 100}%` as const;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: gauche,
    width: largeur,
    paddingHorizontal: 1.5,
    top: HAUT + ((place.debut - debut) / 60) * h.value + 1,
    height: hauteurCase(place, h.value),
  }));
  return (
    <Animated.View style={style}>
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

/** En-tête d’un jour (« Journée ») : toucher choisit ce jour. */
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
  const style = useAnimatedStyle(() => ({ position: 'absolute', top: 0, bottom: 0, left: k * w.value, width: w.value }));
  const label = [format(date, 'EEEE d MMMM', { locale: fr }), aujourdhui ? 'aujourd’hui' : null, ferme ? 'fermé' : null].filter(Boolean).join(', ');
  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: choisi }}
        onPress={() => {
          impulsion('leger');
          onPress();
        }}
        className="flex-1 items-center justify-center active:opacity-60">
        <View className={`rounded-md px-1.5 py-1 ${choisi ? 'bg-surface2 dark:bg-surface2-dark' : ''}`}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            className={`text-[12px] ${aujourdhui || choisi ? 'font-bold' : 'font-medium'}`}
            style={{ color: aujourdhui ? t.accent : ferme ? t.faint : t.muted }}>
            {format(date, court ? 'EEEEE d' : 'EEE d', { locale: fr })}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const texteCharge = (c: { nb: number; minutes: number }) =>
  c.nb === 0 ? 'Libre' : c.minutes > 0 ? `${pluriel(c.nb, 'voiture')} · ${duree(c.minutes)}` : pluriel(c.nb, 'voiture');

/** En-tête d’une colonne « Équipe », sur une ligne : ce qui ne tient pas se tait. */
function EnTeteMembre({ k, w, colonne: c, largeur, nbAAttribuer }: { k: number; w: SharedValue<number>; colonne: ColonneEquipe; largeur: number; nbAAttribuer: number }) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    left: k * w.value,
    width: w.value,
  }));
  const nb = c.charge ? c.charge.nb : nbAAttribuer;
  const complet = c.charge ? texteCharge(c.charge) : pluriel(nbAAttribuer, 'voiture');
  const nom = c.membre ? c.membre.prenom : 'À attribuer';
  const detail =
    largeur < LARGEUR_NB_VOITURES ? null : largeur >= LARGEUR_CHARGE ? complet : c.charge && c.charge.nb === 0 ? 'Libre' : String(nb);
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${nom}, ${complet.replace(' · ', ', ')}`}
      style={style}>
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

type Defilant = { scrollTo?: (o: { x?: number; y?: number; animated: boolean }) => void } | null;

export function GrilleHoraire(props: Props) {
  const { jours, jourChoisi, onChoisirJour, disposition, colonnes = [], champs, couleur, niveau, onNiveau, astuceZoom, margeBasse } = props;
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
  const rangChoisi = Math.max(
    0,
    parJour.findIndex((p) => memeJour(p.jour.date, jourChoisi)),
  );
  const duJourChoisi = parJour[rangChoisi];
  const horsCreneau = duJourChoisi?.hors ?? [];

  const { debut, fin } = useMemo(
    () =>
      bornesJours(
        parJour.map((p) => p.jour.plage),
        parJour.flatMap((p) => [...p.creneaux.values()]),
      ),
    [parJour],
  );

  // ── Dimensions : la largeur disponible pour les colonnes, à droite de la gouttière
  const [vue, setVue] = useState({ l: 0, h: 0 });
  const surMesure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== vue.l || height !== vue.h) setVue({ l: width, h: height });
  };
  const nbColonnes = equipe ? colonnes.length : parJour.length;
  const disponible = Math.max(0, vue.l - GOUTTIERE);
  const { min: wMin, max: wMax } = bornesLargeur(disponible, nbColonnes, equipe ? LARGEUR_COLONNE_MIN : 0);
  const hauteurVue = vue.h;

  // ── Zoom lié : un niveau, deux valeurs partagées (largeur d’une colonne, hauteur d’une heure), posées au repos
  const wRepos = largeurDuNiveau(niveau, wMin, wMax);
  const hRepos = hauteurDuNiveau(niveau);
  const t = useSharedValue(niveau);
  const w = useSharedValue(wRepos);
  const h = useSharedValue(hRepos);
  useEffect(() => {
    t.value = niveau;
    w.value = wRepos;
    h.value = hRepos;
  }, [niveau, wRepos, hRepos, t, w, h]);
  const surNiveau = useRef(onNiveau);
  useEffect(() => {
    surNiveau.current = onNiveau;
  });
  const finZoom = useCallback((n: number) => surNiveau.current(n), []);

  // ── Placement, colonne par colonne
  const dureeVisible = (HAUTEUR_MIN_CASE / hRepos) * 60;
  const colonnesCases = useMemo(() => {
    const groupes = equipe
      ? colonnes.map((c) => ({
          cle: c.membre?.id ?? 'a-attribuer',
          jour: parJour[0],
          liste: (parJour[0]?.avec ?? []).filter((i) => (i.membreId ?? null) === (c.membre?.id ?? null)),
        }))
      : parJour.map((p) => ({ cle: p.cle, jour: p, liste: p.avec }));
    return groupes.map((g) => {
      const zones = zonesFermees(g.jour?.jour.plage, debut, fin);
      return {
        cle: g.cle,
        zones,
        ferme: zones.length === 1 && zones[0].debut === debut && zones[0].fin === fin,
        places: placer(
          g.liste.map((i) => g.jour!.creneaux.get(i.id)!),
          dureeVisible,
        ),
        parId: new Map(g.liste.map((i) => [i.id, i])),
      };
    });
  }, [equipe, colonnes, parJour, debut, fin, dureeVisible]);

  // ── Défilement : vertical (heures), horizontal (colonnes), l’en-tête suit l’horizontal.
  // `scrollToOverflowEnabled` (iOS) : sans lui, `scrollTo` se borne à la taille du contenu d’avant le zoom,
  // qui n’a pas encore grandi dans la même image ; le point sous les doigts glisserait en zoomant.
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
  const contenu = useAnimatedStyle(() => ({ height: HAUT + ((fin - debut) / 60) * h.value + margeBasse }));
  const largeurContenuX = useAnimatedStyle(() => ({ height: '100%', width: w.value * nbColonnes }));
  const enTeteSuit = useAnimatedStyle(() => ({ flex: 1, transform: [{ translateX: -defilX.value }] }));
  const defiler = useCallback(
    (x: number | null, y: number | null, animated = false) => {
      if (x !== null) (defilementX.current as unknown as Defilant)?.scrollTo?.({ x, y: 0, animated });
      if (y !== null) (defilement.current as unknown as Defilant)?.scrollTo?.({ x: 0, y, animated });
    },
    [defilement, defilementX],
  );

  // Maintenant, remis à jour chaque minute : seulement si aujourd’hui est montré.
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60000);
    return () => {
      clearInterval(minuterie);
    };
  }, []);
  const rangAujourdhui = parJour.findIndex((p) => memeJour(p.jour.date, maintenant));
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  const surMaintenant = rangAujourdhui >= 0 && minutesMaintenant >= debut && minutesMaintenant <= fin;

  // Défilement vertical initial (nouvelle semaine, nouveau jour en « Équipe ») : l’heure courante à un tiers du haut, sinon la première case du jour choisi.
  const creneauxChoisis = [...(duJourChoisi?.creneaux.values() ?? [])].map((c) => c.debut);
  const premiereCase = Math.min(...(creneauxChoisis.length ? creneauxChoisis : parJour.flatMap((p) => [...p.creneaux.values()].map((c) => c.debut))));
  const cleJour = `${parJour[0]?.cle ?? ''}-${disposition}`;
  const dejaPlace = useRef<string | null>(null);
  useEffect(() => {
    if (hauteurVue === 0 || dejaPlace.current === cleJour) return;
    dejaPlace.current = cleJour;
    const cible = surMaintenant ? minutesMaintenant : Number.isFinite(premiereCase) ? premiereCase - 30 : debut;
    const y = HAUT + ((cible - debut) / 60) * hRepos - (surMaintenant ? hauteurVue / 3 : 0);
    requestAnimationFrame(() => defiler(null, Math.max(0, y)));
  }, [hauteurVue, cleJour, surMaintenant, minutesMaintenant, premiereCase, debut, hRepos, defiler]);

  // « Journée » : la grille défile jusqu’au jour choisi quand il change (ou la largeur disponible : rotation). Pas après un zoom.
  // Si le contenu n’a pas encore sa nouvelle largeur (ouverture, rotation), le calage attend qu’il l’ait.
  const cleCalage = `${disposition}-${jourChoisi.toDateString()}-${Math.round(disponible)}`;
  const dejaCale = useRef<string | null>(null);
  const calage = useRef<number | null>(null);
  const largeurContenu = useRef(0);
  useEffect(() => {
    if (equipe || disponible <= 0 || dejaCale.current === cleCalage) return;
    const anime = dejaCale.current !== null;
    dejaCale.current = cleCalage;
    const x = Math.min(Math.max(0, wRepos * nbColonnes - disponible), rangChoisi * wRepos);
    calage.current = x;
    requestAnimationFrame(() => {
      defiler(x, null, anime);
      if (largeurContenu.current >= x + disponible - 1) calage.current = null;
    });
  }, [equipe, cleCalage, disponible, wRepos, nbColonnes, rangChoisi, defiler]);
  const surTailleContenuX = (largeur: number) => {
    largeurContenu.current = largeur;
    const x = calage.current;
    if (x === null || largeur < x + disponible - 1) return;
    calage.current = null;
    defiler(x, null);
  };

  // ── Pincement (iOS, Android) : un seul zoom, largeur et hauteur ensemble, le point sous les doigts reste sous les doigts.
  const [pince, setPince] = useState(false);
  const doigts = useSharedValue(0);
  const echelleDepart = useSharedValue(1);
  const tDepart = useSharedValue(0);
  const wDepart = useSharedValue(0);
  const hDepart = useSharedValue(0);
  const xDepart = useSharedValue(0);
  const yDepart = useSharedValue(0);
  const fxDepart = useSharedValue(0);
  const fyDepart = useSharedValue(0);
  const pincement = useMemo(() => {
    // Départ (ou nouveau départ quand un doigt se lève ou se pose : le point focal saute, on repart d’ici sans à-coup).
    const repartir = (e: { scale: number; focalX: number; focalY: number; numberOfPointers: number }) => {
      'worklet';
      doigts.value = e.numberOfPointers;
      echelleDepart.value = e.scale;
      tDepart.value = t.value;
      wDepart.value = w.value;
      hDepart.value = h.value;
      xDepart.value = defilX.value;
      yDepart.value = defil.value;
      fxDepart.value = e.focalX - GOUTTIERE;
      fyDepart.value = e.focalY;
    };
    return Gesture.Pinch()
      .onStart((e) => {
        'worklet';
        repartir(e);
        scheduleOnRN(setPince, true);
      })
      .onUpdate((e) => {
        'worklet';
        if (e.numberOfPointers !== doigts.value) repartir(e);
        if (e.numberOfPointers < 2 || echelleDepart.value <= 0) return;
        const nt = niveauApresEchelle(tDepart.value, e.scale / echelleDepart.value, wMin, wMax);
        const nw = largeurDuNiveau(nt, wMin, wMax);
        const nh = hauteurDuNiveau(nt);
        const x = ancrer(xDepart.value, fxDepart.value, e.focalX - GOUTTIERE, wDepart.value, nw, 0, nw * nbColonnes - disponible);
        const y = ancrer(yDepart.value, fyDepart.value, e.focalY, hDepart.value, nh, HAUT, HAUT + ((fin - debut) / 60) * nh + margeBasse - hauteurVue);
        t.value = nt;
        w.value = nw;
        h.value = nh;
        defilX.value = x;
        defil.value = y;
        scrollTo(defilementX, x, 0, false);
        scrollTo(defilement, 0, y, false);
      })
      .onEnd(() => {
        'worklet';
        scheduleOnRN(finZoom, t.value);
      })
      .onFinalize(() => {
        'worklet';
        scheduleOnRN(setPince, false);
      });
  }, [
    doigts,
    echelleDepart,
    tDepart,
    wDepart,
    hDepart,
    xDepart,
    yDepart,
    fxDepart,
    fyDepart,
    t,
    w,
    h,
    defil,
    defilX,
    defilement,
    defilementX,
    wMin,
    wMax,
    nbColonnes,
    disponible,
    debut,
    fin,
    margeBasse,
    hauteurVue,
    finZoom,
  ]);

  /**
   * Zoom hors pincement (molette, VoiceOver) vers le niveau `cible`, le
   * point (fx, fy) de la zone visible gardé en place. Renvoie le niveau
   * atteint, ou null s’il ne change pas.
   */
  const zoomer = (cible: number, fx: number, fy: number): number | null => {
    const nt = bornerNiveau(cible);
    if (Math.abs(nt - t.value) < 1e-4) return null;
    const nw = largeurDuNiveau(nt, wMin, wMax);
    const nh = hauteurDuNiveau(nt);
    const x = ancrer(defilX.value, fx, fx, w.value, nw, 0, nw * nbColonnes - disponible);
    const y = ancrer(defil.value, fy, fy, h.value, nh, HAUT, HAUT + ((fin - debut) / 60) * nh + margeBasse - hauteurVue);
    t.value = nt;
    w.value = nw;
    h.value = nh;
    defilX.value = x;
    defil.value = y;
    // Le défilement attend que la nouvelle taille du contenu soit posée.
    requestAnimationFrame(() => defiler(x, y));
    return nt;
  };
  // Dernier `zoomer` et dernières bornes, pour l’écouteur de la molette posé une seule fois.
  const zoomerRef = useRef(zoomer);
  const echelleRef = useRef({ wMin, wMax });
  useEffect(() => {
    zoomerRef.current = zoomer;
    echelleRef.current = { wMin, wMax };
  });

  // ── Web : Ctrl ou Cmd + molette (et pincement du pavé tactile, même événement). Positions lues sur le cadre, jamais sur le nœud défilant.
  const cadreWeb = useRef<View>(null);
  const [survol, setSurvol] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const racine = cadreWeb.current as unknown as HTMLElement | null;
    if (!racine || typeof racine.addEventListener !== 'function') return undefined;
    let minuterie: ReturnType<typeof setTimeout> | null = null;
    const surRoulette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = racine.getBoundingClientRect();
      const { wMin: min, wMax: max } = echelleRef.current;
      const cible = niveauApresEchelle(t.value, Math.exp(-e.deltaY * SENSIBILITE_MOLETTE), min, max);
      if (zoomerRef.current(cible, e.clientX - r.left - GOUTTIERE, e.clientY - r.top) === null) return;
      // Contenu des cases et placement recalculés quand la molette s’arrête.
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(() => finZoom(t.value), 120);
    };
    // L’astuce de zoom suit la souris : elle n’existe que pour qui peut survoler.
    const entree = () => setSurvol(true);
    const sortie = () => setSurvol(false);
    racine.addEventListener('wheel', surRoulette, { passive: false });
    racine.addEventListener('mouseenter', entree);
    racine.addEventListener('mouseleave', sortie);
    return () => {
      if (minuterie) clearTimeout(minuterie);
      racine.removeEventListener('wheel', surRoulette);
      racine.removeEventListener('mouseenter', entree);
      racine.removeEventListener('mouseleave', sortie);
    };
  }, [t, finZoom]);

  const heures = heuresAxe(debut, fin);
  const nbCases = parJour.reduce((s, p) => s + p.avec.length, 0);

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
  const texteAstuce = Platform.OS !== 'web' ? 'Pincez pour zoomer' : `${SUR_MAC ? '⌘' : 'Ctrl'} + molette pour zoomer`;

  const nbAAttribuer = (parJour[0]?.jour.interventions ?? []).filter((i) => !i.membreId && i.statut !== 'livre' && i.statut !== 'annule').length;

  const enTete = (
    <View className="flex-row border-b border-line dark:border-line-dark" style={{ height: equipe ? HAUTEUR_ENTETE_EQUIPE : HAUTEUR_ENTETE_JOURS }}>
      <View style={{ width: GOUTTIERE }} />
      <View className="flex-1 overflow-hidden">
        <Animated.View style={enTeteSuit}>
          {equipe
            ? colonnes.map((c, k) => (
                <EnTeteMembre key={c.membre?.id ?? 'a-attribuer'} k={k} w={w} colonne={c} largeur={wRepos} nbAAttribuer={nbAAttribuer} />
              ))
            : parJour.map((p, k) => (
                <EnTeteJour
                  key={p.cle}
                  k={k}
                  w={w}
                  date={p.jour.date}
                  aujourdhui={memeJour(p.jour.date, maintenant)}
                  choisi={k === rangChoisi}
                  ferme={colonnesCases[k]?.ferme ?? false}
                  court={wRepos < LARGEUR_JOUR_COURT}
                  onPress={() => onChoisirJour(p.jour.date)}
                />
              ))}
        </Animated.View>
      </View>
    </View>
  );

  const grille = (
    <Animated.View style={{ flex: 1 }} onLayout={surMesure}>
      <Animated.ScrollView
        ref={defilement}
        onScroll={surDefilement}
        scrollEventThrottle={16}
        scrollEnabled={!pince}
        scrollToOverflowEnabled
        showsVerticalScrollIndicator={false}
        accessibilityLabel={`Grille horaire, ${pluriel(nbCases, 'intervention')} avec un créneau ${equipe ? 'ce jour' : 'cette semaine'}`}>
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
          {/* Les colonnes défilent à l’horizontale ; la gouttière des heures reste à gauche. */}
          <View style={{ position: 'absolute', left: GOUTTIERE, right: 0, top: 0, bottom: 0 }}>
            <Animated.ScrollView
              ref={defilementX}
              horizontal
              style={{ flex: 1 }}
              contentContainerStyle={{ height: '100%' }}
              onScroll={surDefilementX}
              onContentSizeChange={surTailleContenuX}
              scrollEventThrottle={16}
              scrollEnabled={!pince}
              scrollToOverflowEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              snapToInterval={wRepos > 0 ? wRepos : undefined}
              decelerationRate="fast">
              <Animated.View style={largeurContenuX}>
                {colonnesCases.map((g, k) => (
                  <Colonne key={g.cle} k={k} w={w}>
                    {g.zones.map((z) => (
                      <ZoneFermee key={`f${z.debut}`} zone={z} debut={debut} h={h} />
                    ))}
                    {g.ferme ? (
                      <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: HAUT + 6 }}>
                        <Text maxFontSizeMultiplier={1.2} className="text-[11px] font-semibold text-faint dark:text-faint-dark">
                          Fermé
                        </Text>
                      </View>
                    ) : null}
                    {g.places.map((place) => (
                      <CaseAnimee
                        key={place.id}
                        place={place}
                        debut={debut}
                        h={h}
                        hauteurRepos={hRepos}
                        etroite={place.etendue < place.nbColonnes || (wRepos * place.etendue) / place.nbColonnes < LARGEUR_CASE_ETROITE}
                        intervention={g.parId.get(place.id)!}
                        champs={champs}
                        couleur={couleur}
                        clientDe={props.clientDe}
                        vehiculeDe={props.vehiculeDe}
                        mecanicienDe={props.mecanicienDe}
                        onOuvrir={props.onOuvrir}
                        onActions={props.onActions}
                      />
                    ))}
                  </Colonne>
                ))}
                {surMaintenant ? (
                  <Maintenant minutes={minutesMaintenant} debut={debut} h={h} w={w} colonne={equipe ? null : rangAujourdhui} nb={nbColonnes} />
                ) : null}
              </Animated.View>
            </Animated.ScrollView>
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </Animated.View>
  );

  return (
    <View className="flex-1">
      {/* Bande « Hors créneau », seulement s’il y en a (et pas en paysage, où la hauteur manque). */}
      {horsCreneau.length && !props.sansHorsCreneau ? (
        <View className="pb-2 pl-4 pt-1">
          <Etiquette className="mb-1">Hors créneau · {horsCreneau.length}</Etiquette>
          <BandeHorsCreneau liste={horsCreneau} vehiculeDe={props.vehiculeDe} onOuvrir={props.onOuvrir} onActions={props.onActions} />
        </View>
      ) : null}
      {Platform.OS === 'web' ? null : (
        // Le zoom sans pincement : un élément réglable, sans place à l’écran.
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Zoom de la grille"
          accessibilityValue={{ text: `${Math.round(niveau * 100)} %` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const sens = e.nativeEvent.actionName === 'increment' ? 1 : e.nativeEvent.actionName === 'decrement' ? -1 : 0;
            if (!sens) return;
            // Le centre de la zone visible reste en place.
            const nt = zoomer(niveau + sens * PAS_ACCESSIBLE, disponible / 2, hauteurVue / 2);
            if (nt !== null) finZoom(nt);
          }}
          style={{ height: 1 }}
        />
      )}
      {enTete}
      {Platform.OS === 'web' ? (
        <View ref={cadreWeb} className="flex-1">
          {grille}
        </View>
      ) : (
        <GestureDetector gesture={pincement}>{grille}</GestureDetector>
      )}
      {astuceVisible ? (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center px-4" style={{ bottom: margeBasse + 8 }}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}>
            <View className="rounded-full border border-line bg-surface2 px-3 py-1.5 dark:border-line-dark dark:bg-surface2-dark">
              <Legende className="text-[12px]" numberOfLines={1}>
                {texteAstuce}
              </Legende>
            </View>
          </Animated.View>
        </View>
      ) : null}
      {nbCases === 0 ? (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: '45%' }}>
          <Legende ton="faint">{equipe ? 'Aucun créneau ce jour' : 'Aucun créneau cette semaine'}</Legende>
        </View>
      ) : null}
    </View>
  );
}
