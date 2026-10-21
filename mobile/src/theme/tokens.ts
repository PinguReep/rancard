/**
 * Jetons de design partagés entre NativeWind (classes) et le code (StyleSheet,
 * couleurs dynamiques). Les valeurs doivent rester identiques à
 * tailwind.config.js : ce fichier est la source pour tout ce qui se calcule
 * en JavaScript (pastilles de statut, graphiques, onglets natifs).
 *
 * Contrastes (WCAG AA, texte ≥ 4,5:1) vérifiés sur les fonds « soft » et sur
 * le fond d’écran pour les couleurs « sens » (accent, ok, warn, danger, muted).
 * En sombre, `accent` sert au texte et aux liens ; `accentFond` porte le blanc
 * des boutons pleins (le même bleu ne peut pas faire les deux).
 */

import { useColorScheme } from 'react-native';

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  muted: string;
  mutedSoft: string;
  faint: string;
  accent: string;
  /** Fond des boutons pleins et des puces actives (texte blanc dessus) */
  accentFond: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  /** Blanc absolu, pour les icônes sur fond plein ou sur photo */
  blanc: string;
};

export const palette: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#f5f5f7',
    surface: '#ffffff',
    surface2: '#f0f0f3',
    line: '#e5e5ea',
    ink: '#111114',
    muted: '#606068',
    mutedSoft: '#f0f0f3',
    faint: '#a0a0a8',
    accent: '#2559e0',
    accentFond: '#2559e0',
    accentSoft: '#e8efff',
    danger: '#c31e2a',
    dangerSoft: '#fdecee',
    ok: '#157a45',
    okSoft: '#e6f7ec',
    warn: '#9a6100',
    warnSoft: '#fff4de',
    blanc: '#ffffff',
  },
  dark: {
    bg: '#0b0b0e',
    surface: '#151519',
    surface2: '#1e1e24',
    line: '#2a2a31',
    ink: '#f5f5f7',
    muted: '#9a9aa5',
    mutedSoft: '#26262d',
    faint: '#6b6b76',
    accent: '#5b8cff',
    accentFond: '#3568f5',
    accentSoft: '#18244a',
    danger: '#ff5d67',
    dangerSoft: '#3d1418',
    ok: '#3ccf74',
    okSoft: '#12331f',
    warn: '#ffb020',
    warnSoft: '#3a2a08',
    blanc: '#ffffff',
  },
};

/** Couleurs du thème courant (clair ou sombre) pour le code non NativeWind. */
export function useTheme(): Palette & { scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { ...palette[scheme], scheme };
}

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, xxl: 28 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Durées d'animation : courtes et régulières, jamais spectaculaires. */
export const motion = {
  fast: 160,
  base: 240,
  slow: 360,
  /** Courbe « premium » des sites vitrines */
  ease: [0.16, 1, 0.3, 1] as const,
} as const;
