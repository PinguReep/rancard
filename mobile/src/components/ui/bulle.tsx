/**
 * Bulle : petit panneau de verre qui s’ouvre depuis le bouton qui l’appelle,
 * comme les menus d’iOS. Il ne couvre pas l’écran : le reste demeure visible
 * sous un voile léger, et un appui à côté referme. Pour un choix court (la
 * vue du planning) ; une décision qui demande de la place garde la `Feuille`.
 *
 * Le panneau grandit depuis le coin le plus proche du bouton (`ancre`),
 * mesuré à l’ouverture. Verre : Liquid Glass sur iOS 26, flou natif ailleurs
 * (peu coûteux, y compris sur les iPhone anciens), fond plein si « Réduire la
 * transparence » est activé. Pas de flou plein écran.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/tokens';

import { VERRE_LIQUIDE, Verre } from './verre';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  /** Vue (non aplatie : `collapsable={false}`) qui entoure le bouton d’appel */
  ancre: RefObject<View | null>;
  /** Largeur du panneau, bornée par l’écran */
  largeur?: number;
  /** Nom lu par VoiceOver à l’ouverture */
  label: string;
  children: ReactNode;
};

type Cadre = { x: number; y: number; l: number; h: number };

/** Sortie du panneau : il est démonté après ce délai. */
export const SORTIE_BULLE_MS = 170;
/** Un double appui sur le bouton d’appel ne referme pas la bulle qu’il vient d’ouvrir. */
const GARDE_FERMETURE_MS = 300;
const MARGE = 12;
const RAYON = 22;

export function Bulle({ ouverte, onFermer, ancre, largeur = 320, label, children }: Props) {
  const t = useTheme();
  const sombre = t.scheme === 'dark';
  const insets = useSafeAreaInsets();
  const fenetre = useWindowDimensions();
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [montee, setMontee] = useState(false);
  const [opaque, setOpaque] = useState(false);
  const ouverteLe = useRef(0);
  const avancee = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let vivant = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => {
        if (vivant) setOpaque(v);
      })
      .catch(() => undefined);
    const abonnement = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque);
    return () => {
      vivant = false;
      abonnement.remove();
    };
  }, []);

  useEffect(() => {
    if (ouverte) {
      const montrer = (c: Cadre | null) => {
        setCadre(c);
        setMontee(true);
        ouverteLe.current = Date.now();
        avancee.value = 0;
        avancee.value = withSpring(1, { damping: 26, stiffness: 260, mass: 1 });
      };
      const vue = ancre.current;
      if (vue && typeof vue.measureInWindow === 'function') {
        vue.measureInWindow((x, y, l, h) => montrer(Number.isFinite(x) && l > 0 ? { x, y, l, h } : null));
      } else montrer(null);
      return undefined;
    }
    avancee.value = withTiming(0, { duration: SORTIE_BULLE_MS });
    const minuterie = setTimeout(() => setMontee(false), SORTIE_BULLE_MS);
    return () => {
      clearTimeout(minuterie);
    };
  }, [ouverte, ancre, avancee]);

  // ── Place du panneau : sous le bouton, aligné sur son bord le plus proche du bord de l’écran.
  const l = Math.min(largeur, fenetre.width - insets.left - insets.right - MARGE * 2);
  const c = cadre ?? { x: fenetre.width - insets.right - MARGE - 44, y: insets.top + 56, l: 44, h: 44 };
  const aDroite = c.x + c.l / 2 > fenetre.width / 2;
  const gaucheMin = insets.left + MARGE;
  const gaucheMax = fenetre.width - insets.right - MARGE - l;
  const gauche = Math.min(gaucheMax, Math.max(gaucheMin, aDroite ? c.x + c.l - l : c.x));
  const dessous = c.y + c.h + 8;
  const placeDessous = fenetre.height - insets.bottom - MARGE - dessous;
  // Trop bas (paysage, bouton en bas d’écran) : le panneau s’ouvre au-dessus du bouton.
  const auDessus = placeDessous < 220 && c.y - insets.top - MARGE - 8 > placeDessous;
  const hauteurMax = Math.max(160, auDessus ? c.y - insets.top - MARGE - 8 : placeDessous);
  const origine = `${auDessus ? 'bottom' : 'top'} ${aDroite ? 'right' : 'left'}`;

  const voile = useAnimatedStyle(() => ({ opacity: avancee.value }));
  // Le verre ne supporte pas d’être estompé par un parent : seule l’échelle l’anime, le contenu fond à part.
  const panneau = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(avancee.value, [0, 1], [0.2, 1]) }],
    opacity: VERRE_LIQUIDE ? 1 : interpolate(avancee.value, [0, 0.4], [0, 1], 'clamp'),
  }));
  const contenu = useAnimatedStyle(() => ({ opacity: interpolate(avancee.value, [0.35, 1], [0, 1], 'clamp') }));

  const fermer = () => {
    if (Date.now() - ouverteLe.current < GARDE_FERMETURE_MS) return;
    onFermer();
  };

  const interieur = (
    <Animated.View style={contenu}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: hauteurMax, flexGrow: 0 }}>
        {children}
      </ScrollView>
    </Animated.View>
  );

  return (
    <Modal
      visible={montee}
      transparent
      animationType="none"
      onRequestClose={onFermer}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}>
      <View className="flex-1" accessibilityViewIsModal>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.22)' }, voile]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" className="flex-1" onPress={fermer} />
        </Animated.View>
        <Animated.View
          accessibilityLabel={label}
          style={[
            {
              position: 'absolute',
              left: gauche,
              width: l,
              borderRadius: RAYON,
              transformOrigin: origine,
              boxShadow: `0px 12px 32px rgba(0, 0, 0, ${sombre ? 0.5 : 0.18})`,
            },
            auDessus ? { bottom: fenetre.height - c.y + 8 } : { top: dessous },
            panneau,
          ]}>
          {opaque ? (
            <View style={{ borderRadius: RAYON, overflow: 'hidden', backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>{interieur}</View>
          ) : (
            <Verre style={{ borderRadius: RAYON, overflow: 'hidden' }}>
              {/* Sous un flou simple, un voile garde le texte lisible au-dessus des cartes ; le Liquid Glass s’en charge seul. */}
              <View style={VERRE_LIQUIDE ? undefined : { backgroundColor: sombre ? 'rgba(23, 28, 37, 0.72)' : 'rgba(255, 255, 255, 0.74)' }}>{interieur}</View>
            </Verre>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
