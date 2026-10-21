/**
 * En-tête maison de la feuille Notifications : titre, « Tout marquer lu »
 * (seulement s'il reste du non-lu) et Fermer. Cibles tactiles de 44 pt.
 */

import { Pressable, View } from 'react-native';

import { BoutonRond, Secondaire, SousTitre, impulsion } from '@/components/ui';

type Props = { titre: string; nonLues: number; onToutLire: () => void; onFermer: () => void };

export function EnteteFeuille({ titre, nonLues, onToutLire, onFermer }: Props) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-1 pt-2">
      <SousTitre>{titre}</SousTitre>
      <View className="flex-row items-center gap-1">
        {nonLues > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tout marquer lu, ${nonLues} non lue${nonLues > 1 ? 's' : ''}`}
            onPress={() => {
              impulsion();
              onToutLire();
            }}
            className="min-h-[44px] justify-center rounded-full px-3 active:opacity-60">
            <Secondaire ton="accent" className="font-semibold">
              Tout marquer lu
            </Secondaire>
          </Pressable>
        ) : null}
        <BoutonRond nom="fermer" label="Fermer" onPress={onFermer} />
      </View>
    </View>
  );
}
