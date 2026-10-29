/**
 * Avatar d'un membre : initiales sur sa couleur. Taille en points. La
 * couleur est assombrie si besoin (`fondAvatar`) : initiales blanches à
 * 4,5:1 au moins, en clair comme en sombre.
 */

import { Text, View } from 'react-native';

import { initiales } from '@/domain/permissions';
import type { Membre } from '@/domain/types';
import { fondAvatar } from '@/theme/tokens';

export function Avatar({ membre, taille = 32 }: { membre: Pick<Membre, 'prenom' | 'nom' | 'couleur'>; taille?: number }) {
  return (
    <View
      accessibilityLabel={`${membre.prenom} ${membre.nom}`}
      className="items-center justify-center rounded-full"
      style={{ width: taille, height: taille, backgroundColor: fondAvatar(membre.couleur) }}>
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
