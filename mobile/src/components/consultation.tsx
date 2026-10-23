/**
 * « Adrien consulte aussi cette fiche » : collègues présents sur la même
 * fiche, en direct. Rien ne s'affiche s'il n'y en a pas.
 */

import { View } from 'react-native';

import { Avatars, Legende } from '@/components/ui';
import { useCollegues } from '@/hooks/use-consultation';

export function ConsultationFiche({ fiche, className = '' }: { fiche: string; className?: string }) {
  const collegues = useCollegues(fiche);
  if (!collegues.length) return null;
  const prenoms = collegues.map((m) => m.prenom);
  const texte =
    prenoms.length === 1
      ? `${prenoms[0]} consulte aussi cette fiche`
      : `${prenoms.slice(0, -1).join(', ')} et ${prenoms[prenoms.length - 1]} consultent aussi cette fiche`;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={texte}
      className={`flex-row items-center gap-2 self-start rounded-full bg-surface2 py-1.5 pl-1.5 pr-3 dark:bg-surface2-dark ${className}`}>
      <Avatars membres={collegues} taille={20} />
      <Legende numberOfLines={1} className="shrink">
        {texte}
      </Legende>
    </View>
  );
}
