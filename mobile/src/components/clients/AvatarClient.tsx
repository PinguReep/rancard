/**
 * Avatar d'un client : initiales sur un fond neutre (les couleurs vives
 * restent réservées aux membres de l'équipe).
 */

import { Text, View } from 'react-native';

import { initiales } from '@/domain/permissions';
import type { Client } from '@/domain/types';

export function AvatarClient({ client, taille = 40 }: { client: Pick<Client, 'prenom' | 'nom'>; taille?: number }) {
  return (
    <View
      accessibilityLabel={`${client.prenom} ${client.nom}`}
      className="items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark"
      style={{ width: taille, height: taille }}>
      <Text className="font-semibold text-muted dark:text-muted-dark" style={{ fontSize: Math.round(taille * 0.38) }}>
        {initiales(client)}
      </Text>
    </View>
  );
}
