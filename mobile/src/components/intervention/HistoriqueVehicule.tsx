/**
 * Autres interventions du même véhicule, de la plus récente à la plus
 * ancienne. Appui = ouvrir la fiche.
 */

import { View } from 'react-native';

import { Groupe, Icone, Legende, Ligne, PastilleStatut, Texte } from '@/components/ui';
import type { Intervention } from '@/domain/types';
import { dateCourte } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

export function HistoriqueVehicule({ interventions, onOuvrir }: { interventions: Intervention[]; onOuvrir: (id: string) => void }) {
  const t = useTheme();
  if (interventions.length === 0) return null;
  return (
    <Groupe titre="Historique du véhicule">
      {interventions.map((i, idx) => (
          <Ligne
            key={i.id}
            derniere={idx === interventions.length - 1}
            onPress={() => onOuvrir(i.id)}
            accessibilityLabel={`${i.prestation}, ${dateCourte(i.debut)}, ouvrir`}>
            <View className="flex-1">
              <Texte numberOfLines={1}>{i.prestation}</Texte>
              <Legende>{dateCourte(i.debut)}</Legende>
            </View>
            <PastilleStatut statut={i.statut} court />
            <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
          </Ligne>
        ))}
    </Groupe>
  );
}
