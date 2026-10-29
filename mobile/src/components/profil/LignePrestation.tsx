/**
 * Ligne de Groupe en lecture seule pour une prestation : incluse dans
 * l'offre du garage, ou grisée avec la phrase neutre (App Store
 * 3.1.3(f) : ni prix, ni bouton, ni invitation à l'activer). Les
 * prestations sont réglées par Rencar, jamais depuis l'app.
 */

import { View } from 'react-native';

import { Icone, Legende, Ligne, Texte } from '@/components/ui';
import { INCLUS, NON_INCLUS } from '@/domain/prestations';
import { useTheme } from '@/theme/tokens';

type Props = {
  titre: string;
  incluse: boolean;
  derniere?: boolean;
};

export function LignePrestation({ titre, incluse, derniere }: Props) {
  const t = useTheme();
  return (
    <Ligne derniere={derniere}>
      <View
        className={`flex-1 flex-row items-center gap-3 ${incluse ? '' : 'opacity-50'}`}
        accessible
        accessibilityLabel={`${titre}. ${incluse ? INCLUS : NON_INCLUS}`}
        accessibilityState={{ disabled: !incluse }}>
        <View className="flex-1">
          <Texte>{titre}</Texte>
          <Legende className="mt-0.5">{incluse ? INCLUS : NON_INCLUS}</Legende>
        </View>
        <Icone nom={incluse ? 'valider' : 'cadenas'} taille={16} couleur={incluse ? t.ok : t.muted} />
      </View>
    </Ligne>
  );
}
