/**
 * Boutons. Quatre variantes, une hauteur minimale (48 px, 36 px en compact
 * avec zone tactile élargie à 44) : l'action principale est toujours pleine,
 * les autres sont calmes. Les hauteurs sont des minimums pour suivre la
 * taille de texte du système. Un onPress asynchrone bloque le bouton et
 * affiche l'attente jusqu'à sa fin : un double appui n'envoie rien deux fois.
 */

import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { halo, useTheme } from '@/theme/tokens';

import { impulsion } from './haptique';

type Variante = 'principal' | 'secondaire' | 'discret' | 'danger';

type Props = {
  children: ReactNode;
  onPress?: () => void | Promise<void>;
  variante?: Variante;
  desactive?: boolean;
  chargement?: boolean;
  /** Bouton compact (36 px + zone tactile de 44) pour les barres d'actions */
  compact?: boolean;
  icone?: ReactNode;
  className?: string;
  accessibilityLabel?: string;
};

const fond: Record<Variante, string> = {
  principal: 'bg-accent dark:bg-accent-fond',
  secondaire: 'bg-surface2 dark:bg-surface2-dark',
  discret: 'bg-transparent',
  danger: 'bg-danger-soft dark:bg-danger-softdark',
};

const texte: Record<Variante, string> = {
  principal: 'text-white',
  secondaire: 'text-ink dark:text-ink-dark',
  discret: 'text-accent dark:text-accent-dark',
  danger: 'text-danger dark:text-danger-dark',
};

export function Bouton({
  children,
  onPress,
  variante = 'principal',
  desactive,
  chargement,
  compact,
  icone,
  className = '',
  accessibilityLabel,
}: Props) {
  const t = useTheme();
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const attente = chargement || occupe;
  const inactif = desactive || attente;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactif, busy: attente }}
      disabled={inactif}
      hitSlop={compact ? 4 : undefined}
      onPress={() => {
        if (verrou.current) return;
        impulsion(variante === 'principal' ? 'moyen' : 'leger');
        const resultat = onPress?.();
        if (resultat && typeof resultat.then === 'function') {
          verrou.current = true;
          setOccupe(true);
          const fin = () => {
            verrou.current = false;
            setOccupe(false);
          };
          void resultat.then(fin, fin);
        }
      }}
      style={variante === 'principal' && !inactif && t.scheme === 'dark' ? halo(t.accentFond, compact ? 10 : 18, 0.6) : undefined}
      className={`flex-row items-center justify-center gap-2 ${compact ? 'min-h-[36px] rounded-xl px-3 py-1.5' : 'min-h-[52px] rounded-2xl px-5 py-2.5'} ${fond[variante]} ${
        inactif ? 'opacity-50' : 'active:opacity-75'
      } ${className}`}>
      {attente ? (
        <ActivityIndicator color={variante === 'principal' ? t.blanc : t.ink} />
      ) : (
        <>
          {icone ? <View>{icone}</View> : null}
          <Text className={`${compact ? 'text-[15px]' : 'text-[17px]'} font-semibold ${texte[variante]}`}>{children}</Text>
        </>
      )}
    </Pressable>
  );
}
