/**
 * Conteneur d'écran : fond, zones sûres, largeur maximale sur grand écran,
 * défilement optionnel. Tous les écrans commencent par <Ecran>.
 */

import type { ReactNode } from 'react';
import { Keyboard, Platform, RefreshControl, ScrollView, TouchableWithoutFeedback, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/tokens';

/**
 * Halo bleuté en haut de l'écran, en sombre seulement : la lumière d'un
 * tableau de bord, jamais assez forte pour gêner la lecture.
 */
export function Halo() {
  const t = useTheme();
  if (t.scheme !== 'dark') return null;
  return (
    <View pointerEvents="none" className="absolute left-0 right-0 top-0" style={{ height: 420 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="0%" rx="80%" ry="70%">
            <Stop offset="0" stopColor="#3f7cff" stopOpacity={0.24} />
            <Stop offset="1" stopColor="#3f7cff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#halo)" />
      </Svg>
    </View>
  );
}

type Props = ViewProps & {
  children: ReactNode;
  /** true = ScrollView avec marge basse pour la barre d'onglets */
  defilant?: boolean;
  /** Ne pas ajouter la zone sûre haute (écrans sous un en-tête natif) */
  sansHaut?: boolean;
  onRafraichir?: () => Promise<void> | void;
  rafraichissement?: boolean;
  className?: string;
};

export const LARGEUR_MAX = 720;

export function Ecran({ children, defilant, sansHaut, onRafraichir, rafraichissement, className = '', ...p }: Props) {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const paddingTop = sansHaut ? 0 : insets.top;

  if (defilant) {
    return (
      <View {...p} className={`flex-1 bg-bg dark:bg-bg-dark ${className}`} style={{ paddingTop }}>
        <Halo />
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 96 : 80),
            maxWidth: LARGEUR_MAX,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            onRafraichir ? (
              <RefreshControl refreshing={Boolean(rafraichissement)} onRefresh={onRafraichir} tintColor={t.muted} />
            ) : undefined
          }>
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View {...p} className={`flex-1 bg-bg dark:bg-bg-dark ${className}`} style={{ paddingTop }}>
      <Halo />
      {/* Toucher hors d'un champ ferme le clavier (les boutons et les listes gardent leurs gestes).
          Pas sur le web : le clic qui donne le focus à un champ remonterait jusqu'ici et le lui retirerait. */}
      {Platform.OS === 'web' ? (
        <View className="flex-1 w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
          {children}
        </View>
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View className="flex-1 w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
            {children}
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
}

/** Marge basse à utiliser dans les listes (FlashList) pour passer sous la barre d'onglets. */
export function useMargeBasse(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + (Platform.OS === 'ios' ? 96 : 80);
}
