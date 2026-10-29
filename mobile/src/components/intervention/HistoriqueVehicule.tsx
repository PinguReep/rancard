/**
 * Autres interventions du même véhicule, de la plus récente à la plus
 * ancienne. Appui = ouvrir la fiche. Chacune montre le kilométrage relevé
 * à son dépôt (D7) : celui de la vidange d’avril, pas celui d’aujourd’hui ;
 * rien quand il n’a pas été relevé.
 */

import { View } from 'react-native';

import { Groupe, Icone, Legende, Ligne, PastilleStatut, Texte } from '@/components/ui';
import type { Intervention } from '@/domain/types';
import { dateCourte, kilometrage } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

export function HistoriqueVehicule({ interventions, onOuvrir }: { interventions: Intervention[]; onOuvrir: (id: string) => void }) {
  const t = useTheme();
  if (interventions.length === 0) return null;
  return (
    <Groupe titre="Historique du véhicule">
      {interventions.map((i, idx) => {
        const km = i.kmDepot != null ? kilometrage(i.kmDepot) : null;
        return (
          <Ligne
            key={i.id}
            derniere={idx === interventions.length - 1}
            onPress={() => onOuvrir(i.id)}
            accessibilityLabel={[i.prestation, dateCourte(i.debut), km ? `${km} au dépôt` : null, 'ouvrir'].filter(Boolean).join(', ')}>
            <View className="flex-1">
              <Texte numberOfLines={1}>{i.prestation}</Texte>
              <Legende>{[dateCourte(i.debut), km].filter(Boolean).join(' · ')}</Legende>
            </View>
            <PastilleStatut statut={i.statut} court />
            <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
          </Ligne>
        );
      })}
    </Groupe>
  );
}
