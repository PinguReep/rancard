/**
 * Ligne cochable dans un Groupe : un seul choix parmi plusieurs
 * (rôle, poste). La coche accent marque le choix courant.
 */

import { View } from 'react-native';

import { Icone, Legende, Ligne, Texte } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

type Props = {
  titre: string;
  description?: string;
  choisi: boolean;
  onPress: () => void;
  desactive?: boolean;
  derniere?: boolean;
};

export function LigneChoix({ titre, description, choisi, onPress, desactive, derniere }: Props) {
  const t = useTheme();
  return (
    <Ligne
      onPress={desactive ? undefined : onPress}
      derniere={derniere}
      accessibilityLabel={`${titre}${choisi ? ', sélectionné' : ''}${desactive ? ', indisponible' : ''}`}>
      <View className={`flex-1 ${desactive ? 'opacity-40' : ''}`}>
        <Texte>{titre}</Texte>
        {description ? (
          <Legende numberOfLines={2} className="mt-0.5">
            {description}
          </Legende>
        ) : null}
      </View>
      <View className="w-6 items-end">{choisi ? <Icone nom="valider" taille={18} couleur={t.accent} poids="bold" /> : null}</View>
    </Ligne>
  );
}
