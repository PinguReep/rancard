/**
 * Menu « Affichage » du planning : choisir la vue (la liste, la grille
 * « Journée », la grille « Équipe » ou une vue à soi). Une bulle qui s’ouvre
 * depuis le bouton, comme un menu d’iOS : le planning reste visible autour,
 * un appui à côté referme. Sous chaque nom, ce que la vue montre. Un appui
 * choisit la vue ; « Modifier » sur les vues personnelles, « Créer ma vue »
 * en dernière ligne.
 */

import type { RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Bulle, Icone, Legende, Texte, impulsion, type NomIcone } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

import { decrireVue, type Disposition, type VuePlanning } from './vues';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  /** Vue qui entoure le bouton « Affichage » : la bulle s’ouvre depuis elle */
  ancre: RefObject<View | null>;
  vues: VuePlanning[];
  active: string;
  onChoisir: (id: string) => void;
  onModifier: (id: string) => void;
  onCreer: () => void;
};

const ICONE: Record<Disposition, NomIcone> = {
  liste: 'vue.liste',
  journee: 'vue.journee',
  equipe: 'vue.equipe',
};

export function MenuAffichage({ ouverte, onFermer, ancre, vues, active, onChoisir, onModifier, onCreer }: Props) {
  const t = useTheme();
  return (
    <Bulle ouverte={ouverte} onFermer={onFermer} ancre={ancre} label="Affichage du planning">
      {vues.map((v) => {
        const choisie = v.id === active;
        return (
          <View key={v.id} className="flex-row items-center border-b border-line dark:border-line-dark">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: choisie }}
              accessibilityLabel={`${v.nom}${choisie ? ', vue affichée' : ''}. ${decrireVue(v)}`}
              onPress={() => {
                impulsion('leger');
                onChoisir(v.id);
              }}
              className="min-h-[56px] flex-1 flex-row items-center gap-3 py-2 pl-4 pr-2 active:opacity-60">
              <Icone nom={ICONE[v.disposition]} taille={18} couleur={choisie ? t.accent : t.muted} />
              <View className="flex-1">
                <Texte ton={choisie ? 'accent' : 'ink'} className="font-semibold">
                  {v.nom}
                </Texte>
                <Legende numberOfLines={2}>{decrireVue(v)}</Legende>
              </View>
              {choisie ? <Icone nom="valider" taille={16} couleur={t.accent} poids="bold" /> : null}
            </Pressable>
            {v.prefaite ? (
              <View className="w-2" />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Modifier la vue ${v.nom}`}
                onPress={() => {
                  impulsion('leger');
                  onModifier(v.id);
                }}
                className="min-h-[44px] justify-center px-4 active:opacity-60">
                <Text maxFontSizeMultiplier={1.4} className="text-[15px] font-semibold text-accent dark:text-accent-dark">
                  Modifier
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Créer ma vue"
        onPress={() => {
          impulsion('leger');
          onCreer();
        }}
        className="min-h-[52px] flex-row items-center gap-3 px-4 active:opacity-60">
        <Icone nom="plus" taille={16} couleur={t.accent} poids="bold" />
        <Texte ton="accent" className="font-semibold">
          Créer ma vue
        </Texte>
      </Pressable>
    </Bulle>
  );
}
