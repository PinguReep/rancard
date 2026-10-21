/**
 * Feuille de choix (bottom sheet) pour une décision rapide dans l'écran :
 * choisir un mécanicien, confirmer un SMS. Les écrans entiers utilisent
 * plutôt les routes en `presentation: 'formSheet'` (voir _layout.tsx).
 */

import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SousTitre } from './texte';

type Props = { ouverte: boolean; onFermer: () => void; titre?: string; children: ReactNode };

export function Feuille({ ouverte, onFermer, titre, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={ouverte} transparent animationType="none" onRequestClose={onFermer} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} className="absolute inset-0 bg-black/40">
          <Pressable accessibilityLabel="Fermer" className="flex-1" onPress={onFermer} />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(280)}
          exiting={SlideOutDown.duration(220)}
          className="rounded-t-3xl bg-surface dark:bg-surface-dark px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: '85%' }}>
          <View className="mb-3 h-1 w-9 self-center rounded-full bg-line dark:bg-line-dark" />
          {titre ? <SousTitre className="mb-3">{titre}</SousTitre> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
