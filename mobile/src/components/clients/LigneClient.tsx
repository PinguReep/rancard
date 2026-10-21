/**
 * Ligne de la recherche : la plaque d'abord (c'est ce qu'on tape le plus
 * souvent), puis le client et son véhicule. Les lignes s'enchaînent dans un
 * bloc arrondi (première et dernière arrondies).
 */

import { Pressable, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { Plaque } from '@/components/ui/plaque';
import { Legende, Texte } from '@/components/ui/texte';
import { useTheme } from '@/theme/tokens';

import { AvatarClient } from './AvatarClient';
import { libelleVehicule, type FicheClient } from './outils';

type Props = { fiche: FicheClient; premiere: boolean; derniere: boolean; onPress: () => void };

export function LigneClient({ fiche, premiere, derniere, onPress }: Props) {
  const t = useTheme();
  const { client, vehicules } = fiche;
  const premier = vehicules[0];
  const detail = premier ? `${libelleVehicule(premier)}${vehicules.length > 1 ? ` · +${vehicules.length - 1} véhicule${vehicules.length > 2 ? 's' : ''}` : ''}` : 'Aucun véhicule';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${client.prenom} ${client.nom}, ${premier ? `${libelleVehicule(premier)}, plaque ${premier.plaque}` : 'aucun véhicule'}`}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`flex-row items-center gap-3 border-x border-b border-line bg-surface px-4 py-3.5 active:bg-surface2 dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface2-dark ${
        premiere ? 'rounded-t-2xl border-t' : ''
      } ${derniere ? 'rounded-b-2xl' : ''}`}>
      {premier ? (
        <View className="w-[118px]">
          <Plaque plaque={premier.plaque} />
        </View>
      ) : (
        <View className="w-[118px]">
          <AvatarClient client={client} taille={30} />
        </View>
      )}
      <View className="flex-1">
        <Texte numberOfLines={1} className="font-semibold">
          {client.prenom} {client.nom}
        </Texte>
        <Legende numberOfLines={1} className="text-[14px]">
          {detail}
        </Legende>
      </View>
      <Icone nom="chevron.droite" taille={15} couleur={t.faint} />
    </Pressable>
  );
}
