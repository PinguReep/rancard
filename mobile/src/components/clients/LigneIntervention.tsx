/**
 * Ligne d'une intervention dans la fiche client : prestation, quand,
 * véhicule si le client en a plusieurs, statut, montant si autorisé.
 */

import { View } from 'react-native';

import { Ligne } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { PastilleBlocage, PastilleStatut } from '@/components/ui/pastille';
import { Secondaire, Texte } from '@/components/ui/texte';
import { estBloquee } from '@/domain/statuts';
import type { Intervention, Vehicule } from '@/domain/types';
import { euros, quand } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { libelleVehicule } from './outils';

type Props = {
  intervention: Intervention;
  /** Véhicule concerné, affiché seulement si le client en a plusieurs */
  vehicule?: Vehicule;
  voirPrix: boolean;
  derniere: boolean;
  onPress: () => void;
};

export function LigneIntervention({ intervention: i, vehicule, voirPrix, derniere, onPress }: Props) {
  const t = useTheme();
  return (
    <Ligne onPress={onPress} derniere={derniere} accessibilityLabel={`${i.prestation}, ${quand(i.debut)}`}>
      <View className="flex-1 gap-1.5">
        <Texte numberOfLines={1} className="font-semibold">
          {i.prestation}
        </Texte>
        <Secondaire numberOfLines={1}>
          {quand(i.debut)}
          {vehicule ? ` · ${libelleVehicule(vehicule)}` : ''}
        </Secondaire>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <PastilleStatut statut={i.statut} court />
          {i.blocage && estBloquee(i) ? <PastilleBlocage blocage={i.blocage} /> : null}
        </View>
      </View>
      {voirPrix && i.montantEstime != null ? (
        <Texte className="text-[15px] font-semibold">{euros(i.montantEstime)}</Texte>
      ) : null}
      <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
    </Ligne>
  );
}
