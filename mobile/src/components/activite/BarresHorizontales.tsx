/**
 * Barres horizontales en View pures : libellé, barre proportionnelle au
 * maximum, valeur. Chaque ligne se lit d'une traite au lecteur d'écran.
 */

import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Legende, Secondaire, Texte } from '@/components/ui/texte';

export type BarreH = { id: string; label: string; valeur: number; couleur: string };

export function BarresHorizontales({ barres, unite }: { barres: BarreH[]; unite: string }) {
  const max = Math.max(0, ...barres.map((b) => b.valeur));
  if (max === 0) return <Legende className="py-2">Rien sur cette période.</Legende>;
  return (
    <View className="gap-3">
      {barres.map((b) => (
        <View key={b.id} accessible accessibilityLabel={`${b.label} : ${b.valeur} ${unite}`} className="flex-row items-center gap-3">
          <Secondaire className="w-24" numberOfLines={1}>
            {b.label}
          </Secondaire>
          <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface2 dark:bg-surface2-dark">
            <Animated.View
              layout={LinearTransition.duration(240)}
              className="h-full rounded-full"
              style={{ width: `${Math.round((b.valeur / max) * 100)}%`, backgroundColor: b.couleur }}
            />
          </View>
          <Texte className="w-8 text-right font-semibold">{b.valeur}</Texte>
        </View>
      ))}
    </View>
  );
}
