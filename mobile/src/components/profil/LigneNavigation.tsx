/**
 * Ligne de Groupe « titre → valeur › » : navigation ou simple valeur.
 * Le chevron n'apparaît qu'avec une action ; le ton danger reste sans chevron.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icone, Ligne, Secondaire, Texte, type NomIcone } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

type Props = {
  titre: string;
  valeur?: string;
  onPress?: () => void;
  ton?: 'normal' | 'danger' | 'accent';
  icone?: NomIcone;
  derniere?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
};

export function LigneNavigation({ titre, valeur, onPress, ton = 'normal', icone, derniere, accessibilityLabel, children }: Props) {
  const t = useTheme();
  return (
    <Ligne onPress={onPress} derniere={derniere} accessibilityLabel={accessibilityLabel ?? (valeur ? `${titre}, ${valeur}` : titre)}>
      {icone ? (
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface2 dark:bg-surface2-dark">
          <Icone nom={icone} taille={17} couleur={ton === 'danger' ? t.danger : t.muted} />
        </View>
      ) : null}
      <Texte ton={ton === 'danger' ? 'danger' : ton === 'accent' ? 'accent' : 'ink'} numberOfLines={1} className="flex-1">
        {titre}
      </Texte>
      {children}
      {valeur ? (
        <Secondaire numberOfLines={1} className="max-w-[55%] text-right">
          {valeur}
        </Secondaire>
      ) : null}
      {onPress && ton !== 'danger' ? <Icone nom="chevron.droite" taille={14} couleur={t.faint} /> : null}
    </Ligne>
  );
}
