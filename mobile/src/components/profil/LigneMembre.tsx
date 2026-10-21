/**
 * Ligne d'un membre dans la liste de l'équipe.
 */

import { Text, View } from 'react-native';

import { Avatar, Icone, Legende, Ligne, Pastille, Texte } from '@/components/ui';
import { POSTES, ROLES } from '@/domain/permissions';
import type { Membre } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

type Props = { membre: Membre; moi?: boolean; onPress: () => void; derniere?: boolean };

export function LigneMembre({ membre, moi, onPress, derniere }: Props) {
  const t = useTheme();
  const estompe = membre.actif ? '' : 'opacity-50';
  return (
    <Ligne onPress={onPress} derniere={derniere} accessibilityLabel={`${membre.prenom} ${membre.nom}, ${ROLES[membre.role].label}`}>
      <View className={estompe}>
        <Avatar membre={membre} taille={40} />
      </View>
      <View className={`flex-1 ${estompe}`}>
        <Texte numberOfLines={1} className="font-semibold">
          {membre.prenom} {membre.nom}
          {moi ? <Text className="font-normal text-[17px] text-muted dark:text-muted-dark"> (vous)</Text> : null}
        </Texte>
        <Legende numberOfLines={1}>
          {ROLES[membre.role].label} · {POSTES[membre.poste].label}
        </Legende>
        {membre.invitationEnAttente ? (
          <View className="mt-1.5">
            <Pastille label="Invitation en attente" ton="warn" />
          </View>
        ) : null}
      </View>
      <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
    </Ligne>
  );
}
