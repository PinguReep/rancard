/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Mêmes valeurs que src/theme/tokens.ts (clair / sombre gérés par les variantes dark:)
        bg: { DEFAULT: '#f5f5f7', dark: '#0b0b0e' },
        surface: { DEFAULT: '#ffffff', dark: '#151519' },
        surface2: { DEFAULT: '#f0f0f3', dark: '#1e1e24' },
        line: { DEFAULT: '#e5e5ea', dark: '#2a2a31' },
        ink: { DEFAULT: '#111114', dark: '#f5f5f7' },
        muted: { DEFAULT: '#606068', soft: '#f0f0f3', dark: '#9a9aa5', softdark: '#26262d' },
        faint: { DEFAULT: '#a0a0a8', dark: '#6b6b76' },
        // `accent` = texte et liens ; `accent-fond` = fond des boutons pleins en sombre (blanc dessus ≥ 4,5:1)
        accent: { DEFAULT: '#2559e0', soft: '#e8efff', dark: '#5b8cff', softdark: '#18244a', fond: '#3568f5' },
        danger: { DEFAULT: '#c31e2a', soft: '#fdecee', dark: '#ff5d67', softdark: '#3d1418' },
        ok: { DEFAULT: '#157a45', soft: '#e6f7ec', dark: '#3ccf74', softdark: '#12331f' },
        warn: { DEFAULT: '#9a6100', soft: '#fff4de', dark: '#ffb020', softdark: '#3a2a08' },
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      fontFamily: {
        sans: ['system-ui', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
