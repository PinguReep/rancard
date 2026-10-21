/**
 * Barre fixée en bas d'un écran non défilant : l'action principale, pleine.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LARGEUR_MAX } from '@/components/ui';

export function BarreAction({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="border-t border-line dark:border-line-dark bg-bg dark:bg-bg-dark px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
      <View className="w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
        {children}
      </View>
    </View>
  );
}
