/**
 * Grille horaire du planning (vues « Journée » et « Équipe ») : l’emploi
 * du temps de l’atelier, façon agenda. Le temps descend, les heures à
 * gauche, de l’ouverture à la fermeture du garage ce jour-là ; chaque
 * intervention du jour est une case placée et dimensionnée selon son
 * créneau. Deux voitures dans la même heure (on avance un peu sur l’une, un
 * peu sur l’autre) se partagent la largeur, côte à côte (`horaire.ts`).
 *
 * « Équipe » : une colonne par mécanicien (et « À attribuer » si besoin),
 * l’en-tête de colonne (avatar, prénom, charge du jour) reste visible et
 * suit le défilement horizontal quand les colonnes ne tiennent pas.
 *
 * Ce que le jour montre sans créneau ce jour-là (voiture immobilisée depuis
 * un autre jour, demande à valider, rendez-vous manqué) passe en puces dans
 * la bande « Hors créneau » : rien de ce que montre la liste ne disparaît.
 *
 * Zoom : pincement vertical (iOS, Android), Ctrl ou Cmd + molette et
 * pincement du pavé tactile (web). Aucun bouton : la place va aux cases.
 * Une astuce discrète, en bas de la grille, dit le geste tant qu’on n’a
 * jamais zoomé : au survol de la souris sur le web, quelques secondes à
 * l’ouverture sur le téléphone. VoiceOver et TalkBack règlent le zoom par
 * un élément réglable. Pendant le geste, seules les positions bougent
 * (valeur partagée, fil d’interface) ; le contenu des cases et le placement
 * se recalculent à la fin, et le zoom est mémorisé dans la vue. L’heure
 * regardée reste sous les doigts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type RefreshControlProps } from 'react-native';
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
  PAS_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  bornerZoom,
  bornesJour,
  creneauDuJour,
  defilementApresZoom,
  heuresAxe,
  placer,
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

type Props = {
  jour: Date;
  plage: Plage;
  /** Interventions que le jour montre (mêmes règles que la liste) */
  interventions: Intervention[];
  disposition: 'journee' | 'equipe';
  /** Colonnes de la disposition « Équipe », dans l’ordre */
  colonnes?: ColonneEquipe[];
  champs: ChampBloc[];
  couleur: CouleurCase;
  hauteurHeure: number;
  /** Zoom au repos (fin du geste ou de la molette) : mémorisé dans la vue */
  onZoom: (h: number) => void;
  /** L’utilisateur n’a encore jamais zoomé : l’astuce du geste se montre */
  astuceZoom?: boolean;
  clientDe: (i: Intervention) => Client | undefined;
  vehiculeDe: (i: Intervention) => Vehicule | undefined;
  mecanicienDe: (i: Intervention) => Membre | null;
  onOuvrir: (id: string) => void;
  onActions: (id: string) => void;
  rafraichir?: ReactElement<RefreshControlProps>;
  margeBasse: number;
};

/** Durée de l’astuce de zoom à l’ouverture de la grille (téléphone). */
const DUREE_ASTUCE_MS = 4000;
/** Largeur de la gouttière des heures. */
const GOUTTIERE = 46;
/** Marge au-dessus de la première heure : son libellé n’est pas coupé. */
const HAUT = 10;
/**
 * Largeur minimale d’une colonne « Équipe » : au-delà, défilement horizontal.
 * Deux cases qui se chevauchent y gardent un mot lisible chacune.
 */
const COLONNE_MIN = 136;
/** Demi-heures visibles à partir de ce zoom. */
const ZOOM_DEMI_HEURES = 48;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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

/** Trait « maintenant » (jour affiché = aujourd’hui). */
function Maintenant({ minutes, debut, h }: { minutes: number; debut: number; h: SharedValue<number> }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({
    top: HAUT + ((minutes - debut) / 60) * h.value - 1,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`Maintenant, ${hhmm(minutes)}`}
      style={[
        {
          position: 'absolute',
          left: GOUTTIERE - 4,
          right: 0,
          height: 2,
          flexDirection: 'row',
          alignItems: 'center',
        },
        style,
      ]}>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.danger, marginTop: 0 }} />
      <View className="h-[2px] flex-1" style={{ backgroundColor: t.danger }} />
    </Animated.View>
  );
}

type PropsCase = {
  place: Place;
  debut: number;
  h: SharedValue<number>;
  hauteurRepos: number;
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
        etroite={place.etendue < place.nbColonnes}
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

/** Sur un Mac, le zoom à la molette se fait avec ⌘ : l’astuce le dit. */
const SUR_MAC = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Élément DOM qui défile à la verticale sous `racine` (web). La référence
 * animée de Reanimated ne donne pas cet élément : on le lit dans le DOM.
 */
function defilantDans(racine: HTMLElement): HTMLElement | null {
  for (const d of Array.from(racine.querySelectorAll<HTMLElement>('div'))) {
    const o = getComputedStyle(d).overflowY;
    if (o === 'auto' || o === 'scroll') return d;
  }
  return null;
}

const texteCharge = (c: { nb: number; minutes: number }) =>
  c.nb === 0 ? 'Libre' : c.minutes > 0 ? `${pluriel(c.nb, 'voiture')} · ${duree(c.minutes)}` : pluriel(c.nb, 'voiture');

export function GrilleHoraire(props: Props) {
  const { jour, plage, interventions, disposition, colonnes = [], champs, couleur, hauteurHeure, onZoom, astuceZoom, margeBasse, rafraichir } = props;
  const equipe = disposition === 'equipe';

  // ── Ce qui a un créneau ce jour, et ce qui n’en a pas
  const { avecCreneau, horsCreneau, creneaux } = useMemo(() => {
    const avec: Intervention[] = [];
    const hors: Intervention[] = [];
    const cr = new Map<string, Creneau>();
    for (const i of interventions) {
      const c = creneauDuJour(i, jour);
      if (c) {
        avec.push(i);
        cr.set(i.id, c);
      } else hors.push(i);
    }
    return { avecCreneau: avec, horsCreneau: hors, creneaux: cr };
  }, [interventions, jour]);

  const { debut, fin } = useMemo(() => bornesJour(plage, [...creneaux.values()]), [plage, creneaux]);

  // ── Zoom : valeur partagée pendant le geste, état au repos
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

  // ── Placement, colonne par colonne
  const dureeVisible = (HAUTEUR_MIN_CASE / repos) * 60;
  const parColonne = useMemo(() => {
    const groupes: { cle: string; liste: Intervention[] }[] = equipe
      ? colonnes.map((c) => ({
          cle: c.membre?.id ?? 'a-attribuer',
          liste: avecCreneau.filter((i) => (i.membreId ?? null) === (c.membre?.id ?? null)),
        }))
      : [{ cle: 'jour', liste: avecCreneau }];
    return groupes.map((g) => {
      const places = placer(
        g.liste.map((i) => creneaux.get(i.id)!),
        dureeVisible,
      );
      return {
        cle: g.cle,
        places,
        parId: new Map(g.liste.map((i) => [i.id, i])),
      };
    });
  }, [equipe, colonnes, avecCreneau, creneaux, dureeVisible]);

  // ── Défilement et dimensions
  const defilement = useAnimatedRef<Animated.ScrollView>();
  const defil = useSharedValue(0);
  const defilX = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler((e) => {
    defil.value = e.contentOffset.y;
  });
  const surDefilementX = useAnimatedScrollHandler((e) => {
    defilX.value = e.contentOffset.x;
  });
  const [vue, setVue] = useState({ l: 0, h: 0 });
  const surMesure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== vue.l || height !== vue.h) setVue({ l: width, h: height });
  };
  const largeurColonne = equipe && colonnes.length ? Math.max(COLONNE_MIN, (vue.l - GOUTTIERE) / colonnes.length) : 0;

  const contenu = useAnimatedStyle(() => ({
    height: HAUT + ((fin - debut) / 60) * h.value + margeBasse,
  }));
  const enTeteSuit = useAnimatedStyle(() => ({
    transform: [{ translateX: -defilX.value }],
  }));

  // Maintenant (aujourd’hui seulement), remis à jour chaque minute.
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60000);
    return () => {
      clearInterval(minuterie);
    };
  }, []);
  const minutesMaintenant =
    maintenant.getFullYear() === jour.getFullYear() && maintenant.getMonth() === jour.getMonth() && maintenant.getDate() === jour.getDate()
      ? maintenant.getHours() * 60 + maintenant.getMinutes()
      : null;
  const maintenantVisible = minutesMaintenant !== null && minutesMaintenant >= debut && minutesMaintenant <= fin;

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
  const premiereCase = Math.min(...[...creneaux.values()].map((c) => c.debut));
  const cleJour = `${jour.toDateString()}-${disposition}`;
  const dejaPlace = useRef<string | null>(null);
  useEffect(() => {
    if (vue.h === 0 || dejaPlace.current === cleJour) return;
    dejaPlace.current = cleJour;
    const cible = maintenantVisible ? minutesMaintenant! : Number.isFinite(premiereCase) ? premiereCase - 30 : debut;
    const y = HAUT + ((cible - debut) / 60) * h.value - (maintenantVisible ? vue.h / 3 : 0);
    requestAnimationFrame(() => {
      defilerVers(y);
    });
  }, [vue.h, cleJour, maintenantVisible, minutesMaintenant, premiereCase, debut, h, defilerVers]);

  // ── Zoom par l’élément réglable (VoiceOver, TalkBack) : le centre de la zone visible reste en place.
  const zoomer = (facteur: number) => {
    const avant = h.value;
    const apres = bornerZoom(avant * facteur);
    if (apres === avant) return;
    const y = defilementApresZoom(defil.value, vue.h / 2, avant, apres);
    h.value = apres;
    finZoom(apres);
    requestAnimationFrame(() => {
      defilerVers(y);
    });
  };

  // ── Pincement (iOS, Android) : l’heure sous les doigts reste sous les doigts.
  const [pince, setPince] = useState(false);
  const hDepart = useSharedValue(hauteurHeure);
  const defilDepart = useSharedValue(0);
  const focalDepart = useSharedValue(0);
  const pincement = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          hDepart.value = h.value;
          defilDepart.value = defil.value;
          focalDepart.value = e.focalY;
          scheduleOnRN(setPince, true);
        })
        .onUpdate((e) => {
          const nh = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, hDepart.value * e.scale));
          // Point d’ancrage gardé sous les doigts, qui peuvent aussi glisser pendant le pincement.
          const y = defilementApresZoom(defilDepart.value, focalDepart.value, hDepart.value, nh) + (focalDepart.value - e.focalY);
          h.value = nh;
          scrollTo(defilement, 0, Math.max(0, y), false);
        })
        .onEnd(() => {
          scheduleOnRN(finZoom, h.value);
        })
        .onFinalize(() => {
          scheduleOnRN(setPince, false);
        }),
    [h, defil, hDepart, defilDepart, focalDepart, defilement, finZoom],
  );

  // ── Web : Ctrl ou Cmd + molette, et pincement du pavé tactile (même événement, ctrlKey).
  const cadreWeb = useRef<View>(null);
  const [survol, setSurvol] = useState(false);
  const zoomWeb = useRef<{
    h: number;
    minuterie: ReturnType<typeof setTimeout> | null;
  }>({ h: hauteurHeure, minuterie: null });
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const racine = cadreWeb.current as unknown as HTMLElement | null;
    if (!racine || typeof racine.addEventListener !== 'function') return undefined;
    const surRoulette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const noeud = defilantDans(racine);
      if (!noeud) return;
      e.preventDefault();
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
      const z = zoomWeb.current;
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
  }, [h, finZoom]);

  const heures = heuresAxe(debut, fin);
  const nbCases = avecCreneau.length;

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

  const colonneDeCases = (g: (typeof parColonne)[number], largeur?: number) => (
    <View key={g.cle} style={largeur ? { width: largeur } : { flex: 1 }} className={equipe ? 'border-l border-line dark:border-line-dark' : ''}>
      {g.places.map((place) => (
        <CaseAnimee key={place.id} place={place} debut={debut} h={h} hauteurRepos={repos} intervention={g.parId.get(place.id)!} {...props} />
      ))}
    </View>
  );

  const grille = (
    <Animated.View style={{ flex: 1 }} onLayout={surMesure}>
      <Animated.ScrollView
        ref={defilement}
        onScroll={surDefilement}
        scrollEventThrottle={16}
        scrollEnabled={!pince}
        refreshControl={rafraichir}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={`Grille horaire, ${pluriel(nbCases, 'intervention')} avec un créneau ce jour`}>
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
              right: 0,
              top: 0,
              bottom: 0,
            }}>
            {equipe ? (
              <Animated.ScrollView
                horizontal
                style={{ flex: 1 }}
                contentContainerStyle={{ height: '100%' }}
                onScroll={surDefilementX}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                bounces={false}>
                <View
                  style={{
                    flexDirection: 'row',
                    flex: 1,
                    width: largeurColonne * colonnes.length,
                  }}>
                  {parColonne.map((g) => colonneDeCases(g, largeurColonne))}
                </View>
              </Animated.ScrollView>
            ) : (
              <View style={{ flexDirection: 'row', flex: 1, paddingRight: 8 }}>{parColonne.map((g) => colonneDeCases(g))}</View>
            )}
          </View>
          {maintenantVisible ? <Maintenant minutes={minutesMaintenant!} debut={debut} h={h} /> : null}
        </Animated.View>
      </Animated.ScrollView>
    </Animated.View>
  );

  return (
    <View className="flex-1">
      {/* Bande « Hors créneau », seulement s’il y en a. Sans les en-têtes de l’Équipe, un filet la sépare des cases qui défilent dessous. */}
      <View className={equipe ? '' : 'border-b border-line dark:border-line-dark'}>
        {horsCreneau.length ? (
          <View className="pb-2 pl-4 pt-1">
            <Etiquette className="mb-1">Hors créneau · {horsCreneau.length}</Etiquette>
            <BandeHorsCreneau liste={horsCreneau} vehiculeDe={props.vehiculeDe} onOuvrir={props.onOuvrir} onActions={props.onActions} />
          </View>
        ) : null}
      </View>
      {Platform.OS === 'web' ? null : (
        // Le zoom sans pincement : un élément réglable, sans place à l’écran.
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Zoom de la grille"
          accessibilityValue={{ text: `${Math.round((repos / ZOOM_MAX) * 100)} %` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') zoomer(PAS_ZOOM);
            if (e.nativeEvent.actionName === 'decrement') zoomer(1 / PAS_ZOOM);
          }}
          style={{ height: 1 }}
        />
      )}

      {equipe ? (
        <View className="flex-row overflow-hidden border-b border-line dark:border-line-dark" style={{ paddingLeft: GOUTTIERE }}>
          <Animated.View style={[{ flexDirection: 'row' }, enTeteSuit]}>
            {colonnes.map((c) => (
              // La charge a sa ligne, sur toute la largeur de la colonne : « 3 voitures · 4 h 45 » se lit en entier.
              <View key={c.membre?.id ?? 'a-attribuer'} style={{ width: largeurColonne }} className="px-1.5 pb-2">
                <View className="flex-row items-center gap-1.5">
                  {c.membre ? (
                    <Avatar membre={c.membre} taille={22} />
                  ) : (
                    <View
                      accessibilityLabel="Non attribué"
                      className="h-[22px] w-[22px] rounded-full border border-dashed border-faint dark:border-faint-dark"
                    />
                  )}
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="flex-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
                    {c.membre ? c.membre.prenom : 'À attribuer'}
                  </Text>
                </View>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="mt-1 text-[11px] text-muted dark:text-muted-dark">
                  {c.charge
                    ? texteCharge(c.charge)
                    : pluriel(interventions.filter((i) => !i.membreId && i.statut !== 'livre' && i.statut !== 'annule').length, 'voiture')}
                </Text>
              </View>
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
          className="absolute left-0 right-0 items-center"
          style={{ bottom: margeBasse + 8 }}>
          <View className="rounded-full border border-line bg-surface2 px-3 py-1.5 dark:border-line-dark dark:bg-surface2-dark">
            <Legende className="text-[12px]">{texteAstuce}</Legende>
          </View>
        </Animated.View>
      ) : null}
      {nbCases === 0 ? (
        <View pointerEvents="none" className="absolute left-0 right-0 items-center" style={{ top: '45%' }}>
          <Legende ton="faint">Aucun créneau ce jour</Legende>
        </View>
      ) : null}
    </View>
  );
}
