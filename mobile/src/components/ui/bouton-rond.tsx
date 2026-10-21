/**
 * Bouton rond à icône, une seule taille (40 pt + zone tactile élargie à 44) :
 * cloche et « + » des en-têtes, « Fermer » des modales et des feuilles.
 */

import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme/tokens';

import { impulsion } from './haptique';
import { Icone, type NomIcone } from './icone';

type Props = {
  nom: NomIcone;
  /** Libellé lu par VoiceOver (le bouton n'a pas de texte) */
  label: string;
  onPress: () => void;
  /** Icône en couleur d'accent */
  accent?: boolean;
  /** Superposition (badge de compteur, par exemple) */
  children?: ReactNode;
  className?: string;
};

export function BoutonRond({ nom, label, onPress, accent, children, className = '' }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={() => {
        impulsion();
        onPress();
      }}
      className={`h-10 w-10 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark active:opacity-70 ${className}`}>
      <Icone nom={nom} taille={18} couleur={accent ? t.accent : t.ink} poids={nom === 'fermer' ? 'bold' : 'medium'} />
      {children}
    </Pressable>
  );
}
