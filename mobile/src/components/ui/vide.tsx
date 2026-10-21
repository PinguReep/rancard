/**
 * État vide : une icône, un titre, une phrase, une action au plus.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/tokens';

import { Icone, type NomIcone } from './icone';
import { Secondaire, SousTitre } from './texte';

export function Vide({ icone, titre, texte, action }: { icone: NomIcone; titre: string; texte?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View className="items-center px-8 py-16">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-surface2 dark:bg-surface2-dark">
        <Icone nom={icone} taille={26} couleur={t.muted} />
      </View>
      <SousTitre className="text-center">{titre}</SousTitre>
      {texte ? <Secondaire className="mt-2 text-center">{texte}</Secondaire> : null}
      {action ? <View className="mt-6">{action}</View> : null}
    </View>
  );
}
