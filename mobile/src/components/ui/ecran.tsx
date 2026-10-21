/**
 * Conteneur d'écran : fond, zones sûres, largeur maximale sur grand écran,
 * défilement optionnel. Tous les écrans commencent par <Ecran>.
 */

import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/tokens';

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
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 96 : 80),
            maxWidth: LARGEUR_MAX,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
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
      <View className="flex-1 w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
        {children}
      </View>
    </View>
  );
}

/** Marge basse à utiliser dans les listes (FlashList) pour passer sous la barre d'onglets. */
export function useMargeBasse(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + (Platform.OS === 'ios' ? 96 : 80);
}
