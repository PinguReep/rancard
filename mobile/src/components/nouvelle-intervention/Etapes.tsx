/**
 * Indicateur des trois étapes (Client, Véhicule, Intervention). Les étapes
 * déjà passées se rouvrent d'un appui.
 */

import { Pressable, Text, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';

export type Etape = 1 | 2 | 3;

const LIBELLES: Record<Etape, string> = { 1: 'Client', 2: 'Véhicule', 3: 'Intervention' };

type Props = { courante: Etape; onAller: (e: Etape) => void };

export function Etapes({ courante, onAller }: Props) {
  return (
    <View className="flex-row gap-2 px-4 pb-3">
      {([1, 2, 3] as const).map((e) => {
        const faite = e < courante;
        const active = e === courante;
        return (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`Étape ${e}, ${LIBELLES[e]}${active ? ', en cours' : faite ? ', terminée' : ''}`}
            accessibilityState={{ selected: active, disabled: !faite }}
            disabled={!faite}
            hitSlop={6}
            onPress={() => {
              impulsion('leger');
              onAller(e);
            }}
            className="min-h-[44px] flex-1 justify-end gap-1.5">
            <View className={`h-1 rounded-full ${faite || active ? 'bg-accent dark:bg-accent-fond' : 'bg-line dark:bg-line-dark'}`} />
            <Text
              className={`text-[12px] font-semibold ${
                active ? 'text-ink dark:text-ink-dark' : faite ? 'text-accent dark:text-accent-dark' : 'text-faint dark:text-faint-dark'
              }`}>
              {LIBELLES[e]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
