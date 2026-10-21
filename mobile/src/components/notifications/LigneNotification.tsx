/**
 * Ligne d'une notification : icône par type, titre, détail, ancienneté,
 * point accent si non lue.
 */

import { View } from 'react-native';

import { Icone, Legende, Ligne, Secondaire, Texte, type NomIcone } from '@/components/ui';
import type { Notification, TypeNotification } from '@/domain/types';
import { ilYA } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

export const ICONE_PAR_TYPE: Record<TypeNotification, NomIcone> = {
  rdv_site: 'planning',
  ia: 'appels',
  accord: 'valider',
  piece: 'cle',
  equipe: 'clients',
};

type Props = { notification: Notification; onPress: () => void; derniere?: boolean };

export function LigneNotification({ notification: n, onPress, derniere }: Props) {
  const t = useTheme();
  return (
    <Ligne
      onPress={onPress}
      derniere={derniere}
      accessibilityLabel={`${n.lue ? '' : 'Non lue. '}${n.titre}. ${n.detail}. ${ilYA(n.creeLe)}`}>
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${
          n.lue ? 'bg-surface2 dark:bg-surface2-dark' : 'bg-accent-soft dark:bg-accent-softdark'
        }`}>
        <Icone nom={ICONE_PAR_TYPE[n.type]} taille={18} couleur={n.lue ? t.muted : t.accent} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-2">
          <Texte numberOfLines={1} className={`flex-1 ${n.lue ? '' : 'font-semibold'}`}>
            {n.titre}
          </Texte>
          <Legende>{ilYA(n.creeLe)}</Legende>
        </View>
        <Secondaire numberOfLines={2} className="mt-0.5">
          {n.detail}
        </Secondaire>
      </View>
      {!n.lue ? <View accessibilityLabel="Non lue" className="h-2.5 w-2.5 rounded-full bg-accent dark:bg-accent-dark" /> : null}
    </Ligne>
  );
}
