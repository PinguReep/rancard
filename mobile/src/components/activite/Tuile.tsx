/**
 * Tuile de chiffre : un libellé, une grande valeur, un détail optionnel.
 * Se pose par deux dans une rangée.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Carte } from '@/components/ui/carte';
import { Chiffre, Legende } from '@/components/ui/texte';

export type TuileDef = { id: string; libelle: string; valeur: string; detail?: string; ton?: 'warn' | 'ok' | 'accent' };

export function Tuile({ libelle, valeur, detail, ton }: Omit<TuileDef, 'id'>) {
  return (
    <Carte className="flex-1 p-4" accessible accessibilityLabel={`${libelle} : ${valeur}${detail ? `, ${detail}` : ''}`}>
      <Legende numberOfLines={2}>{libelle}</Legende>
      <Chiffre ton={ton ?? 'ink'} className="mt-1" numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Chiffre>
      {detail ? (
        <Legende className="mt-0.5" numberOfLines={1}>
          {detail}
        </Legende>
      ) : null}
    </Carte>
  );
}

/** Grille à deux colonnes ; une tuile seule sur sa rangée garde la largeur d'une colonne. */
export function GrilleTuiles({ tuiles }: { tuiles: TuileDef[] }) {
  const rangees: ReactNode[] = [];
  for (let k = 0; k < tuiles.length; k += 2) {
    const [a, b] = [tuiles[k], tuiles[k + 1]];
    rangees.push(
      <View key={a.id} className="flex-row gap-2">
        <Tuile {...a} />
        {b ? <Tuile {...b} /> : <View className="flex-1" />}
      </View>,
    );
  }
  return <View className="gap-2">{rangees}</View>;
}
