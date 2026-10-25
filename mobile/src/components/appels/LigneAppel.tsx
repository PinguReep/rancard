/**
 * Carte d'un appel passé dans l'historique : qui, quand, combien de temps,
 * résumé sur deux lignes, issue et mention « hors horaires ».
 */

import { View } from 'react-native';

import { Carte } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { Legende, Secondaire, Texte } from '@/components/ui/texte';
import type { Appel } from '@/domain/types';
import { dureeSecondes, formaterTelephone, quand } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

import { PastilleHorsHoraires, PastilleIssue } from './PastilleIssue';

export function LigneAppel({ appel, onPress }: { appel: Appel; onPress?: () => void }) {
  const t = useTheme();
  const nom = appel.appelant ?? formaterTelephone(appel.numero);
  return (
    <Carte
      className="p-4"
      onPress={onPress}
      accessibilityLabel={`${nom}, ${quand(appel.debut)}, ${dureeSecondes(appel.dureeSec)}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texte className="font-semibold" numberOfLines={1}>
            {nom}
          </Texte>
          <Legende className="mt-0.5">
            {quand(appel.debut)} · {dureeSecondes(appel.dureeSec)}
          </Legende>
        </View>
        {onPress ? (
          <View className="mt-1">
            <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
          </View>
        ) : null}
      </View>
      <Secondaire numberOfLines={1} className="mt-1.5">
        {appel.resume || 'Aucun compte rendu reçu pour cet appel.'}
      </Secondaire>
      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <PastilleIssue issue={appel.issue} />
        {appel.horsHoraires ? <PastilleHorsHoraires /> : null}
      </View>
    </Carte>
  );
}
