/**
 * Ligne d'un membre dans la liste de l'équipe.
 */

import { Text, View } from 'react-native';

import { Avatar, Icone, Legende, Ligne, Pastille, Texte } from '@/components/ui';
import { POSTES, ROLES } from '@/domain/permissions';
import type { Membre } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

type Props = {
  membre: Membre;
  moi?: boolean;
  onPress: () => void;
  derniere?: boolean;
  /** Reçoit les appels transférés sur son portable (0019) : le gérant le voit, jamais le numéro */
  appelsPortable?: boolean;
};

export function LigneMembre({ membre, moi, onPress, derniere, appelsPortable }: Props) {
  const t = useTheme();
  const estompe = membre.actif ? '' : 'opacity-50';
  const libelle = `${membre.prenom} ${membre.nom}, ${ROLES[membre.role].label}${appelsPortable ? ', reçoit les appels transférés sur son portable' : ''}`;
  return (
    <Ligne onPress={onPress} derniere={derniere} accessibilityLabel={libelle}>
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
        {membre.invitationEnAttente || appelsPortable ? (
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {membre.invitationEnAttente ? <Pastille label="Invitation en attente" ton="warn" /> : null}
            {appelsPortable ? <Pastille label="Appels sur son portable" ton="ok" point /> : null}
          </View>
        ) : null}
      </View>
      <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
    </Ligne>
  );
}
