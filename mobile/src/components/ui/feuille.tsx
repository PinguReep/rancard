/**
 * Feuille de choix (bottom sheet) pour une décision rapide dans l'écran :
 * choisir un mécanicien, confirmer un SMS. Les écrans entiers utilisent
 * plutôt les routes en `presentation: 'formSheet'` (voir _layout.tsx).
 * Se ferme en touchant le fond ou en glissant la poignée vers le bas.
 */

import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SousTitre } from './texte';

type Props = { ouverte: boolean; onFermer: () => void; titre?: string; children: ReactNode };

/** Au-delà de ce glissement (ou d'un geste rapide), la feuille se ferme. */
const SEUIL_FERMETURE = 80;

export function Feuille({ ouverte, onFermer, titre, children }: Props) {
  const insets = useSafeAreaInsets();
  const decalage = useSharedValue(0);

  useEffect(() => {
    if (ouverte) decalage.value = 0;
  }, [ouverte, decalage]);

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
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" className="flex-1" onPress={onFermer} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(280)}
            exiting={SlideOutDown.duration(220)}
            className="rounded-t-3xl bg-surface dark:bg-surface-dark px-4"
            style={[{ paddingBottom: insets.bottom + 16, maxHeight: '85%' }, suit]}>
            <GestureDetector gesture={glisser}>
              <View accessible={false} className="pt-3">
                <View className="mb-3 h-1 w-9 self-center rounded-full bg-line dark:bg-line-dark" />
                {titre ? <SousTitre className="mb-3">{titre}</SousTitre> : null}
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
