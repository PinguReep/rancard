/**
 * Puce de choix (prestation, jour, créneau, durée, mécanicien) : un état
 * sélectionné plein, les autres calmes. 40 pt de haut au minimum + zone
 * tactile élargie à 44.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
  desactivee?: boolean;
  icone?: ReactNode;
  accessibilityLabel?: string;
};

export function Puce({ label, active, onPress, desactivee, icone, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled: desactivee }}
      disabled={desactivee}
      hitSlop={4}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`min-h-[40px] flex-row items-center gap-2 rounded-full border px-4 py-2 ${
        active
          ? 'border-accent bg-accent dark:border-accent-fond dark:bg-accent-fond'
          : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark'
      } ${desactivee ? 'opacity-40' : 'active:opacity-75'}`}>
      {icone ? <View>{icone}</View> : null}
      <Text className={`text-[15px] font-medium ${active ? 'text-white' : 'text-ink dark:text-ink-dark'}`}>{label}</Text>
    </Pressable>
  );
}

/** Rangée de puces qui passe à la ligne. */
export function Puces({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
