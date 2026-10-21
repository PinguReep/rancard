/**
 * Interventions terminées ou livrées par membre : avatar, prénom, nombre,
 * barre dans la couleur du membre.
 */

import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Legende, Texte } from '@/components/ui/texte';
import type { Membre } from '@/domain/types';

export function ParMecanicien({ lignes }: { lignes: { membre: Membre; valeur: number }[] }) {
  const max = Math.max(0, ...lignes.map((l) => l.valeur));
  if (!lignes.length) return <Legende className="py-2">Aucun membre actif.</Legende>;
  return (
    <View className="gap-4">
      {lignes.map(({ membre, valeur }) => (
        <View
          key={membre.id}
          accessible
          accessibilityLabel={`${membre.prenom} : ${valeur} intervention${valeur > 1 ? 's' : ''} terminée${valeur > 1 ? 's' : ''}`}
          className="flex-row items-center gap-3">
          <Avatar membre={membre} taille={32} />
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Texte className="font-medium" numberOfLines={1}>
                {membre.prenom}
              </Texte>
              <Texte className="font-semibold">{valeur}</Texte>
            </View>
            <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface2 dark:bg-surface2-dark">
              <Animated.View
                layout={LinearTransition.duration(240)}
                className="h-full rounded-full"
                style={{ width: `${max ? Math.round((valeur / max) * 100) : 0}%`, backgroundColor: membre.couleur }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
