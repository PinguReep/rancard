/**
 * Bascule « Liste / Par statut », en contrôle segmenté.
 */

import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui';

export type Vue = 'liste' | 'statut';

const OPTIONS: { cle: Vue; label: string }[] = [
  { cle: 'liste', label: 'Liste' },
  { cle: 'statut', label: 'Par statut' },
];

export function BasculeVue({ vue, onChanger }: { vue: Vue; onChanger: (v: Vue) => void }) {
  return (
    <View className="min-h-[44px] flex-row items-center rounded-xl bg-surface2 dark:bg-surface2-dark p-1" accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const actif = o.cle === vue;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif }}
            accessibilityLabel={`Affichage ${o.label.toLowerCase()}`}
            hitSlop={4}
            onPress={() => {
              if (actif) return;
              impulsion('leger');
              onChanger(o.cle);
            }}
            className={`min-h-[36px] items-center justify-center rounded-[10px] px-3 py-1 ${
              actif ? 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark' : ''
            }`}>
            <Text className={`text-[14px] font-semibold ${actif ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
