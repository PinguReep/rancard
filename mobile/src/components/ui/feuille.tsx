/**
 * Feuille de choix (bottom sheet) pour une décision rapide dans l'écran :
 * choisir un mécanicien, confirmer un SMS. Les écrans entiers utilisent
 * plutôt les routes en `presentation: 'formSheet'` (voir _layout.tsx).
 * Se ferme en touchant le fond ou en glissant la poignée vers le bas.
 *
 * Pendant l’inertie, contenu et fond ignorent les appuis : le second
 * appui d’un double appui (sur le bouton qui a ouvert la feuille) ne
 * choisit rien. Le contenu reste visible, estompé (`opacity-60`), pour
 * qu’on voie qu’il faut attendre ; la poignée reste glissable.
 *
 * Inertie (v2c) : `ENTREE_FEUILLE_MS` pour une feuille ouverte par un
 * appui délibéré (appui long, carré Bloquer, menu ⋯) ; `inerteMs={GARDE_MS}`
 * pour une feuille ouverte par un geste (feuille SMS, étape « Préciser »
 * de Bloquer, confirmations de passage). Changer `cleInertie` pendant que
 * la feuille est ouverte relance l’inertie (nouvelle étape dans la même
 * feuille).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Legende, SousTitre } from './texte';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  titre?: string;
  /** Sous-titre sous le titre : « Antoine Girard · Diagnostic électronique » */
  legende?: string;
  /** Durée d’inertie à l’ouverture (défaut `ENTREE_FEUILLE_MS`) */
  inerteMs?: number;
  /** Une nouvelle valeur, feuille ouverte, relance l’inertie (étape suivante d’une même feuille) */
  cleInertie?: string | number;
  children: ReactNode;
};

/** Au-delà de ce glissement (ou d'un geste rapide), la feuille se ferme. */
const SEUIL_FERMETURE = 80;

/** Entrée de la feuille (280 ms) plus une marge : rien n’est touchable avant. */
export const ENTREE_FEUILLE_MS = 530;

export function Feuille({ ouverte, onFermer, titre, legende, inerteMs = ENTREE_FEUILLE_MS, cleInertie, children }: Props) {
  const insets = useSafeAreaInsets();
  const decalage = useSharedValue(0);

  useEffect(() => {
    if (ouverte) decalage.value = 0;
  }, [ouverte, decalage]);

  // Inertie : remise à zéro à chaque ouverture et à chaque nouvelle étape.
  const [pret, setPret] = useState(false);
  useEffect(() => {
    setPret(false);
    if (!ouverte) return undefined;
    const minuterie = setTimeout(() => setPret(true), inerteMs);
    return () => {
      clearTimeout(minuterie);
    };
  }, [ouverte, inerteMs, cleInertie]);
  const appuis = pret ? 'auto' : 'none';

  // Seule la tête (poignée et titre) se glisse : les listes de la feuille gardent leur défilement.
  const glisser = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(6)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      decalage.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > SEUIL_FERMETURE || e.velocityY > 900) onFermer();
      else decalage.value = withSpring(0, { damping: 20, stiffness: 220 });
    });

  const suit = useAnimatedStyle(() => ({ transform: [{ translateY: decalage.value }] }));

  return (
    <Modal visible={ouverte} transparent animationType="none" onRequestClose={onFermer} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} className="absolute inset-0 bg-black/40">
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" className="flex-1" onPress={onFermer} pointerEvents={appuis} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(280)}
            exiting={SlideOutDown.duration(220)}
            className="rounded-t-3xl bg-surface dark:bg-surface-dark px-4"
            style={[{ paddingBottom: insets.bottom + 16, maxHeight: '85%' }, suit]}>
            <GestureDetector gesture={glisser}>
              <View accessible={false} className="pt-3">
                <View className="mb-3 h-1 w-9 self-center rounded-full bg-line dark:bg-line-dark" />
                {titre ? <SousTitre className={legende ? 'mb-0.5' : 'mb-3'}>{titre}</SousTitre> : null}
                {legende ? <Legende className="mb-3">{legende}</Legende> : null}
              </View>
            </GestureDetector>
            {/* flexShrink : les listes de la feuille gardent leur défilement sous la hauteur maximale. */}
            <View pointerEvents={appuis} style={{ flexShrink: 1 }} className={pret ? '' : 'opacity-60'}>
              {children}
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
