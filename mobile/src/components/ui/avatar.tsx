/**
 * Avatar d'un membre : initiales sur sa couleur. Taille en points.
 */

import { Text, View } from 'react-native';

import { initiales } from '@/domain/permissions';
import type { Membre } from '@/domain/types';

export function Avatar({ membre, taille = 32 }: { membre: Pick<Membre, 'prenom' | 'nom' | 'couleur'>; taille?: number }) {
  return (
    <View
      accessibilityLabel={`${membre.prenom} ${membre.nom}`}
      className="items-center justify-center rounded-full"
      style={{ width: taille, height: taille, backgroundColor: membre.couleur }}>
      <Text className="text-white font-bold" style={{ fontSize: Math.round(taille * 0.38) }}>
        {initiales(membre)}
      </Text>
    </View>
  );
}

/** Pile d'avatars (planning, équipe). */
export function Avatars({ membres, taille = 24 }: { membres: Pick<Membre, 'prenom' | 'nom' | 'couleur'>[]; taille?: number }) {
  return (
    <View className="flex-row">
      {membres.slice(0, 4).map((m, i) => (
        <View key={`${m.prenom}-${i}`} style={{ marginLeft: i ? -taille * 0.3 : 0 }}>
          <Avatar membre={m} taille={taille} />
        </View>
      ))}
    </View>
  );
}
