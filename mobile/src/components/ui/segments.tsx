/**
 * Choix exclusif en pilule (« segmented control ») : deux ou trois options,
 * l'active est levée. Un compteur discret peut suivre chaque libellé.
 */

import { Pressable, Text, View } from 'react-native';

import { impulsion } from './haptique';

export type OptionSegment<T extends string> = { id: T; label: string; compte?: number };

type Props<T extends string> = { options: OptionSegment<T>[]; valeur: T; onChange: (v: T) => void; className?: string };

export function Segments<T extends string>({ options, valeur, onChange, className = 'mx-4' }: Props<T>) {
  return (
    <View accessibilityRole="tablist" className={`flex-row rounded-full border border-line bg-surface2 p-1 dark:border-line-dark dark:bg-surface-dark ${className}`}>
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={o.compte != null ? `${o.label}, ${o.compte}` : o.label}
            onPress={() => {
              if (actif) return;
              impulsion('leger');
              onChange(o.id);
            }}
            className={`min-h-[42px] flex-1 flex-row items-center justify-center gap-2 rounded-full px-2 ${
              actif ? 'bg-surface shadow-sm dark:bg-surface2-dark' : 'active:opacity-60'
            }`}>
            <Text
              maxFontSizeMultiplier={1.4}
              numberOfLines={1}
              className={`text-[15px] font-semibold ${actif ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark'}`}>
              {o.label}
            </Text>
            {o.compte != null ? (
              <Text maxFontSizeMultiplier={1.4} className="font-mono text-[12px] text-muted dark:text-muted-dark">
                {o.compte}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
