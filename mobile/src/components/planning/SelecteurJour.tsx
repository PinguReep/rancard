/**
 * Sept jours autour d’aujourd’hui. Le jour choisi s’allume ; aujourd’hui
 * reste repérable en couleur ; un point signale les jours avec rendez-vous.
 */

import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui';
import { dateLongue } from '@/lib/format';
import { halo, useTheme } from '@/theme/tokens';

const DECALAGES = [-3, -2, -1, 0, 1, 2, 3];

type Props = { jour: Date; onChanger: (d: Date) => void; aDesRendezVous?: (d: Date) => boolean };

export function SelecteurJour({ jour, onChanger, aDesRendezVous }: Props) {
  const t = useTheme();
  const aujourdhui = startOfDay(new Date());
  return (
    <View className="flex-row justify-between px-4" accessibilityRole="tablist">
      {DECALAGES.map((n) => {
        const d = addDays(aujourdhui, n);
        const actif = isSameDay(d, jour);
        const estAujourdhui = n === 0;
        const point = aDesRendezVous?.(d);
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
            style={actif && t.scheme === 'dark' ? halo(t.accentFond, 14, 0.7) : undefined}
            className={`h-[62px] w-[48px] items-center justify-center rounded-2xl ${actif ? 'bg-accent dark:bg-accent-fond' : 'active:opacity-70'}`}>
            <Text
              maxFontSizeMultiplier={1.3}
              className={`text-[12px] font-semibold ${actif ? 'text-white/80' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-muted dark:text-muted-dark'}`}>
              {format(d, 'EEE', { locale: fr }).replace('.', '')}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              className={`text-[19px] font-bold ${actif ? 'text-white' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'}`}>
              {format(d, 'd')}
            </Text>
            <View className={`mt-0.5 h-1 w-1 rounded-full ${point ? (actif ? 'bg-white' : 'bg-accent dark:bg-accent-dark') : 'bg-transparent'}`} />
          </Pressable>
        );
      })}
    </View>
  );
}
