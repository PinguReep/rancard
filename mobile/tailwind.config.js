/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Mêmes valeurs que src/theme/tokens.ts (clair / sombre gérés par les variantes dark:)
        bg: { DEFAULT: '#f5f5f7', dark: '#06080c' },
        surface: { DEFAULT: '#ffffff', dark: '#0f131a' },
        surface2: { DEFAULT: '#f0f0f3', dark: '#171c25' },
        line: { DEFAULT: '#e5e5ea', dark: '#232a35' },
        ink: { DEFAULT: '#111114', dark: '#eef1f6' },
        muted: { DEFAULT: '#606068', soft: '#f0f0f3', dark: '#8b94a5', softdark: '#1a1f29' },
        faint: { DEFAULT: '#a0a0a8', dark: '#5b6474' },
        // `accent` = texte et liens ; `accent-fond` = fond des boutons pleins en sombre (blanc dessus ≥ 4,5:1)
        accent: { DEFAULT: '#2559e0', soft: '#e8efff', dark: '#6a9bff', softdark: '#14203a', fond: '#3568f5' },
        danger: { DEFAULT: '#c31e2a', soft: '#fdecee', dark: '#ff5b61', softdark: '#34151a' },
        ok: { DEFAULT: '#157a45', soft: '#e6f7ec', dark: '#2fd6a1', softdark: '#0e2a22' },
        warn: { DEFAULT: '#9a6100', soft: '#fff4de', dark: '#ffb224', softdark: '#2d2310' },
      },
      borderRadius: { xl: '14px', '2xl': '22px', '3xl': '28px' },
      fontFamily: {
        sans: ['system-ui', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
