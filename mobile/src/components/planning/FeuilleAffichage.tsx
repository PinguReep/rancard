/**
 * Feuille « Affichage » du planning : choisir la vue (la liste, la grille
 * « Journée », la grille « Équipe » ou une vue à soi). Sous chaque nom, ce
 * qu’elle montre. Un appui choisit la vue et ferme la feuille ; « Modifier »
 * sur les vues personnelles, « Créer ma vue » en bas.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { Feuille, Icone, Legende, Texte, impulsion, type NomIcone } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

import { decrireVue, type Disposition, type VuePlanning } from './vues';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
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

export function FeuilleAffichage({ ouverte, onFermer, vues, active, onChoisir, onModifier, onCreer }: Props) {
  const t = useTheme();
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Affichage" legende="Ce que montre le planning, sur ce téléphone">
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <View className="mb-3 overflow-hidden rounded-2xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
          {vues.map((v, k) => {
            const choisie = v.id === active;
            const derniere = k === vues.length - 1;
            return (
              <View key={v.id} className={`flex-row items-center ${derniere ? '' : 'border-b border-line dark:border-line-dark'}`}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: choisie }}
                  accessibilityLabel={`${v.nom}${choisie ? ', vue affichée' : ''}. ${decrireVue(v)}`}
                  onPress={() => {
                    impulsion('leger');
                    onChoisir(v.id);
                  }}
                  className="min-h-[60px] flex-1 flex-row items-center gap-3 py-2.5 pl-4 pr-2 active:bg-surface2 dark:active:bg-surface2-dark">
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
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Créer ma vue"
          onPress={() => {
            impulsion('leger');
            onCreer();
          }}
          className="mb-4 min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-dashed border-line px-4 active:opacity-70 dark:border-line-dark">
          <Icone nom="plus" taille={16} couleur={t.accent} poids="bold" />
          <Texte ton="accent" className="font-semibold">
            Créer ma vue
          </Texte>
        </Pressable>
      </ScrollView>
    </Feuille>
  );
}
