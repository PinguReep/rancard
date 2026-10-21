/**
 * Bascule de période façon « segmented control » : trois choix, un seul actif.
 */

import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';

type Option<T extends string> = { id: T; label: string };

export function Bascule<T extends string>({ options, valeur, onChange }: { options: Option<T>[]; valeur: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" className="mx-4 mb-5 flex-row rounded-xl bg-surface2 p-1 dark:bg-surface2-dark">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (actif) return;
              impulsion('leger');
              onChange(o.id);
            }}
            className={`min-h-[44px] flex-1 items-center justify-center rounded-lg px-1 py-2 ${
              actif ? 'bg-surface dark:bg-surface-dark' : 'active:opacity-60'
            }`}>
            <Text
              className={`text-center text-[13px] font-semibold ${actif ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
