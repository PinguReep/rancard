/**
 * Sept jours autour d’aujourd’hui, en pastilles égales : « Auj. » reste
 * toujours visible, le jour sélectionné est plein.
 */

import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui';
import { dateLongue } from '@/lib/format';

const DECALAGES = [-3, -2, -1, 0, 1, 2, 3];

export function SelecteurJour({ jour, onChanger }: { jour: Date; onChanger: (d: Date) => void }) {
  const aujourdhui = startOfDay(new Date());
  return (
    <View className="flex-row gap-1.5 px-4" accessibilityRole="tablist">
      {DECALAGES.map((n) => {
        const d = addDays(aujourdhui, n);
        const actif = isSameDay(d, jour);
        const estAujourdhui = n === 0;
        return (
          <Pressable
            key={n}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={estAujourdhui ? `Aujourd’hui, ${dateLongue(d.toISOString())}` : dateLongue(d.toISOString())}
            onPress={() => {
              if (actif) return;
              impulsion('leger');
              onChanger(d);
            }}
            className={`min-h-[58px] flex-1 items-center justify-center rounded-2xl py-2 ${
              actif ? 'bg-accent dark:bg-accent-fond' : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
            } active:opacity-80`}>
            <Text
              className={`text-[11px] font-semibold uppercase tracking-[0.5px] ${
                actif ? 'text-white' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-muted dark:text-muted-dark'
              }`}>
              {estAujourdhui ? 'Auj.' : format(d, 'EEE', { locale: fr }).replace('.', '')}
            </Text>
            <Text
              className={`mt-0.5 text-[18px] font-bold ${
                actif ? 'text-white' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'
              }`}>
              {format(d, 'd')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
