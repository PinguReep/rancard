/**
 * Pastilles : statut, blocage, origine. Couleur = sens, jamais décorative.
 * Les fonds « soft » viennent des jetons, jamais d’une valeur en dur ici.
 */

import { Text, View } from 'react-native';

import { BLOCAGES, ORIGINES, STATUTS } from '@/domain/statuts';
import type { Blocage, Origine, Statut } from '@/domain/types';
import { useTheme, type Palette } from '@/theme/tokens';

type Ton = 'accent' | 'ok' | 'warn' | 'muted' | 'danger';

function couleurs(t: Palette, ton: Ton) {
  switch (ton) {
    case 'accent':
      return { texte: t.accent, fond: t.accentSoft };
    case 'ok':
      return { texte: t.ok, fond: t.okSoft };
    case 'warn':
      return { texte: t.warn, fond: t.warnSoft };
    case 'danger':
      return { texte: t.danger, fond: t.dangerSoft };
    default:
      return { texte: t.muted, fond: t.mutedSoft };
  }
}

export function Pastille({ label, ton = 'muted', point }: { label: string; ton?: Ton; point?: boolean }) {
  const t = useTheme();
  const c = couleurs(t, ton);
  return (
    <View
      accessibilityRole="text"
      className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 self-start"
      style={{ backgroundColor: c.fond }}>
      {point ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.texte }} /> : null}
      <Text maxFontSizeMultiplier={1.5} className="text-[12px] font-semibold" style={{ color: c.texte }}>
        {label}
      </Text>
    </View>
  );
}

export function PastilleStatut({ statut, court }: { statut: Statut; court?: boolean }) {
  const s = STATUTS[statut];
  return <Pastille label={court ? s.court : s.label} ton={s.couleur} point={statut === 'en_cours'} />;
}

export function PastilleBlocage({ blocage }: { blocage: Blocage }) {
  return <Pastille label={BLOCAGES[blocage].label} ton="warn" />;
}

export function PastilleOrigine({ origine }: { origine: Origine }) {
  return <Pastille label={ORIGINES[origine].court} ton="muted" />;
}
