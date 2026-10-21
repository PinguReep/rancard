/**
 * Typographie. Une échelle courte et stable, toujours via ces composants
 * pour que l'app garde une seule voix.
 *
 * La couleur se choisit par la prop `ton` (jamais par une classe `text-…`
 * ajoutée dans className : Tailwind émet les utilitaires de couleur dans un
 * ordre fixe, la classe de base l’emporterait).
 */

import { Text, type TextProps } from 'react-native';

export const TONS = {
  ink: 'text-ink dark:text-ink-dark',
  muted: 'text-muted dark:text-muted-dark',
  faint: 'text-faint dark:text-faint-dark',
  accent: 'text-accent dark:text-accent-dark',
  danger: 'text-danger dark:text-danger-dark',
  ok: 'text-ok dark:text-ok-dark',
  warn: 'text-warn dark:text-warn-dark',
  blanc: 'text-white',
} as const;

export type Ton = keyof typeof TONS;

type Props = TextProps & { className?: string; ton?: Ton };

/** Grand titre d'écran (32 px, comme les « Large Title » iOS). Annoncé comme en-tête. */
export function Titre({ ton = 'ink', className = '', ...p }: Props) {
  return <Text accessibilityRole="header" {...p} className={`${TONS[ton]} text-[32px] font-bold tracking-tight leading-[38px] ${className}`} />;
}

/** Titre de section ou de carte. Annoncé comme en-tête. */
export function SousTitre({ ton = 'ink', className = '', ...p }: Props) {
  return <Text accessibilityRole="header" {...p} className={`${TONS[ton]} text-[20px] font-semibold tracking-tight leading-[26px] ${className}`} />;
}

/** Texte courant (17 px, taille iOS par défaut). */
export function Texte({ ton = 'ink', className = '', ...p }: Props) {
  return <Text {...p} className={`${TONS[ton]} text-[17px] leading-[22px] ${className}`} />;
}

/** Texte secondaire. */
export function Secondaire({ ton = 'muted', className = '', ...p }: Props) {
  return <Text {...p} className={`${TONS[ton]} text-[15px] leading-[20px] ${className}`} />;
}

/** Petite légende (13 px). Bornée à ×1,5 avec la taille de texte système. */
export function Legende({ ton = 'muted', className = '', ...p }: Props) {
  return <Text maxFontSizeMultiplier={1.5} {...p} className={`${TONS[ton]} text-[13px] leading-[18px] ${className}`} />;
}

/** Message d’erreur de formulaire (13 px, danger). */
export function Erreur(p: Props) {
  return <Legende ton="danger" accessibilityLiveRegion="polite" {...p} />;
}

/** Étiquette de section en capitales espacées. */
export function Etiquette({ ton = 'muted', className = '', ...p }: Props) {
  return <Text maxFontSizeMultiplier={1.5} {...p} className={`${TONS[ton]} text-[12px] font-semibold uppercase tracking-[1.5px] ${className}`} />;
}

/** Grand chiffre des tuiles d’activité (28 px). */
export function Chiffre({ ton = 'ink', className = '', ...p }: Props) {
  return <Text {...p} className={`${TONS[ton]} text-[28px] font-bold leading-[34px] tracking-tight ${className}`} />;
}

/** Monospace pour les plaques et numéros. */
export function Mono({ ton = 'ink', className = '', ...p }: Props) {
  return <Text maxFontSizeMultiplier={1.5} {...p} className={`${TONS[ton]} font-mono text-[14px] ${className}`} />;
}
