/**
 * Ligne de la liste des clients : avatar, nom, véhicules, nombre
 * d'interventions et date de la dernière. Les lignes s'enchaînent dans un
 * bloc arrondi façon Réglages iOS (première et dernière arrondies).
 */

import { Pressable, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { Legende, Secondaire, Texte } from '@/components/ui/texte';
import { dateCourte } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { AvatarClient } from './AvatarClient';
import { libelleVehicule, pluriel, type FicheClient } from './outils';

type Props = { fiche: FicheClient; premiere: boolean; derniere: boolean; onPress: () => void };

export function LigneClient({ fiche, premiere, derniere, onPress }: Props) {
  const t = useTheme();
  const { client, vehicules, interventions } = fiche;
  const premier = vehicules[0];
  const resumeVehicules = premier
    ? `${libelleVehicule(premier)} · ${premier.plaque}${vehicules.length > 1 ? ` · +${vehicules.length - 1}` : ''}`
    : 'Aucun véhicule';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${client.prenom} ${client.nom}, ${resumeVehicules}`}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`flex-row items-center gap-3 border-x border-b border-line bg-surface px-4 py-3 active:bg-surface2 dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface2-dark ${
        premiere ? 'rounded-t-2xl border-t' : ''
      } ${derniere ? 'rounded-b-2xl' : ''}`}>
      <AvatarClient client={client} />
      <View className="flex-1">
        <Texte numberOfLines={1} className="font-semibold">
          {client.prenom} {client.nom}
        </Texte>
        <Secondaire numberOfLines={1}>{resumeVehicules}</Secondaire>
      </View>
      <View className="items-end">
        <Legende>{interventions.length ? pluriel(interventions.length, 'intervention') : 'Aucune intervention'}</Legende>
        {fiche.derniere ? <Legende ton="faint">{dateCourte(fiche.derniere)}</Legende> : null}
      </View>
      <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
    </Pressable>
  );
}
