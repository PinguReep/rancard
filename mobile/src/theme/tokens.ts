/**
 * Jetons de design partagés entre NativeWind (classes) et le code (StyleSheet,
 * couleurs dynamiques). Les valeurs doivent rester identiques à
 * tailwind.config.js : ce fichier est la source pour tout ce qui se calcule
 * en JavaScript (pastilles de statut, graphiques, onglets natifs).
 *
 * Contrastes (WCAG AA, texte ≥ 4,5:1) vérifiés sur les fonds « soft » et sur
 * le fond d’écran pour les couleurs « sens » (accent, ok, warn, danger, muted).
 * `faint` (texte discret, frise, chevrons) atteint aussi 4,5:1, en clair comme
 * en sombre, sur bg, surface, surface2, mutedSoft et accentSoft.
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
    faint: '#6b6b73',
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
    faint: '#7f8899',
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

/** Luminance relative d’une couleur « #rrggbb » (WCAG 2.x). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/**
 * Fond d’un avatar sous des initiales blanches : la couleur du membre, assombrie
 * juste assez pour un contraste d’au moins 4,5:1 (WCAG AA). Une couleur déjà
 * lisible est rendue telle quelle ; une couleur illisible (saisie ancienne,
 * autre palette) ne laisse jamais les initiales pâles.
 */
export function fondAvatar(couleur: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(couleur)) return couleur;
  const n = parseInt(couleur.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let k = 0; k <= 20; k += 1) {
    const f = 1 - k * 0.05;
    const hex = `#${rgb.map((c) => Math.round(c * f).toString(16).padStart(2, '0')).join('')}`;
    if (1.05 / (luminance(hex) + 0.05) >= 4.5) return hex;
  }
  return '#000000';
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
