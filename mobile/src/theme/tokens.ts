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
  // Sombre « cockpit » : noir bleuté, surfaces à peine levées, couleurs
  // vives réservées au sens (étape en cours, blocage, prêt).
  dark: {
    bg: '#06080c',
    surface: '#0f131a',
    surface2: '#171c25',
    line: '#232a35',
    ink: '#eef1f6',
    muted: '#8b94a5',
    mutedSoft: '#1a1f29',
    faint: '#5b6474',
    accent: '#6a9bff',
    accentFond: '#3568f5',
    accentSoft: '#14203a',
    danger: '#ff5b61',
    dangerSoft: '#34151a',
    ok: '#2fd6a1',
    okSoft: '#0e2a22',
    warn: '#ffb224',
    warnSoft: '#2d2310',
    blanc: '#ffffff',
  },
};

/** Couleurs du thème courant (clair ou sombre) pour le code non NativeWind. */
export function useTheme(): Palette & { scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { ...palette[scheme], scheme };
}

export const radius = { sm: 8, md: 12, lg: 14, xl: 22, xxl: 28 } as const;

/** Halo lumineux (iOS) : ombre colorée, sans décalage, autour des éléments « vivants ». */
export const halo = (couleur: string, rayon = 14, opacite = 0.55) => ({
  shadowColor: couleur,
  shadowOpacity: opacite,
  shadowRadius: rayon,
  shadowOffset: { width: 0, height: 0 },
});

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Durées d'animation : courtes et régulières, jamais spectaculaires. */
export const motion = {
  fast: 160,
  base: 240,
  slow: 360,
  /** Courbe « premium » des sites vitrines */
  ease: [0.16, 1, 0.3, 1] as const,
} as const;
