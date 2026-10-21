/**
 * Surfaces : carte, ligne de liste, en-tête de section. Coins arrondis,
 * bordure fine, jamais d'ombre lourde.
 */

import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { Etiquette, Legende } from './texte';
import { impulsion } from './haptique';

type CarteProps = ViewProps & { children: ReactNode; className?: string; onPress?: () => void; desactivee?: boolean };

export function Carte({ children, className = '', onPress, desactivee, ...p }: CarteProps) {
  const classes = `rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${className}`;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={desactivee}
        onPress={() => {
          impulsion('leger');
          onPress();
        }}
        className={`${classes} active:opacity-80`}
        {...(p as PressableProps)}>
        {children}
      </Pressable>
    );
  }
  return (
    <View {...p} className={classes}>
      {children}
    </View>
  );
}

/** Groupe de lignes façon « Réglages iOS » : bord commun, séparateurs internes. */
export function Groupe({ children, className = '', titre, note }: { children: ReactNode; className?: string; titre?: string; note?: string }) {
  return (
    <View className={`mb-6 ${className}`}>
      {titre ? (
        <Etiquette accessibilityRole="header" className="mb-2 ml-1">
          {titre}
        </Etiquette>
      ) : null}
      <View className="rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark overflow-hidden">
        {children}
      </View>
      {note ? <Legende className="mt-2 ml-1">{note}</Legende> : null}
    </View>
  );
}

type LigneProps = {
  children: ReactNode;
  onPress?: () => void;
  /** Dernière ligne du groupe : pas de séparateur */
  derniere?: boolean;
  className?: string;
  accessibilityLabel?: string;
};

/** Ligne d'un Groupe. Le contenu gère sa propre mise en page horizontale. */
export function Ligne({ children, onPress, derniere, className = '', accessibilityLabel }: LigneProps) {
  const classes = `px-4 py-3 flex-row items-center gap-3 min-h-[52px] ${derniere ? '' : 'border-b border-line dark:border-line-dark'} ${className}`;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          impulsion('leger');
          onPress();
        }}
        className={`${classes} active:bg-surface2 dark:active:bg-surface2-dark`}>
        {children}
      </Pressable>
    );
  }
  return <View className={classes}>{children}</View>;
}

export function Separateur({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-line dark:bg-line-dark ${className}`} />;
}

/** Titre de section avec action optionnelle à droite. */
export function Section({ titre, droite, children, className = '' }: { titre: string; droite?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <View className={`mb-6 ${className}`}>
      <View className="flex-row items-center justify-between mb-2 ml-1 mr-1">
        <Etiquette accessibilityRole="header">{titre}</Etiquette>
        {droite}
      </View>
      {children}
    </View>
  );
}
