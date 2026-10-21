/**
 * Sept barres verticales (lundi à dimanche) en View pures, hauteur relative
 * au maximum. Un segment optionnel (ex. hors horaires) se colore en bas.
 */

import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Legende } from '@/components/ui/texte';

export type BarreV = { jour: string; valeur: number; segment?: number };

type Props = {
  barres: BarreV[];
  couleur: string;
  unite: string;
  /** Couleur et libellé du segment, s'il y en a un */
  segment?: { couleur: string; label: string };
};

const HAUTEUR = 96;

export function BarresVerticales({ barres, couleur, unite, segment }: Props) {
  const max = Math.max(0, ...barres.map((b) => b.valeur));
  return (
    <View>
      {max === 0 ? (
        <View style={{ height: HAUTEUR + 18 }} className="justify-center">
          <Legende className="text-center">Rien sur cette période.</Legende>
        </View>
      ) : (
        <View className="flex-row gap-1.5">
          {barres.map((b) => {
            const part = b.segment ?? 0;
            const label = `${b.jour} : ${b.valeur} ${unite}${part && segment ? `, dont ${part} ${segment.label}` : ''}`;
            return (
              <View key={b.jour} accessible accessibilityLabel={label} className="flex-1 items-center justify-end">
                <Legende className="mb-1 text-[11px]">{b.valeur ? String(b.valeur) : ' '}</Legende>
                <View style={{ height: HAUTEUR }} className="w-full items-center justify-end">
                  <Animated.View
                    layout={LinearTransition.duration(240)}
                    className="w-full max-w-[28px] overflow-hidden rounded-md"
                    style={{ height: `${(b.valeur / max) * 100}%`, minHeight: b.valeur ? 4 : 0, backgroundColor: couleur }}>
                    {part && segment ? (
                      <View
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${(part / b.valeur) * 100}%`,
                          backgroundColor: segment.couleur,
                        }}
                      />
                    ) : null}
                  </Animated.View>
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View className="mt-2 flex-row gap-1.5">
        {barres.map((b) => (
          <Legende key={b.jour} className="flex-1 text-center text-[11px]">
            {b.jour}
          </Legende>
        ))}
      </View>
      {segment ? (
        <View className="mt-3 flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: couleur }} />
            <Legende>{unite}</Legende>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.couleur }} />
            <Legende>{segment.label}</Legende>
          </View>
        </View>
      ) : null}
    </View>
  );
}
