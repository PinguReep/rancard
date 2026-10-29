/**
 * Bandeau « À traiter » du planning (v2c, repris de la v2b et corrigé) :
 * vue « Tout l’atelier », chaque jour. Puces comptées de ce qui demande un
 * geste : « À attribuer » pour le jour affiché (voitures immobilisées et
 * demandes à valider comprises), et pour aujourd’hui seulement « En retard »,
 * « À prévenir », « Pas arrivées » (rendez-vous manqués des jours passés
 * compris, `aTraiter`). Seules les puces non nulles s’affichent ;
 * sans puce, une légende calme et vraie : « Rien à traiter pour ce jour. »
 *
 * Un appui isole ces voitures dans la liste (les titres de section restent),
 * un second appui ou « Tout afficher » rend la liste entière. Le filtre
 * tombe au changement de jour ou de segment (le planning l’oublie).
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { Legende, impulsion } from '@/components/ui';
import type { aTraiter } from '@/domain/echeances';

import { FILTRES_A_TRAITER, pluriel, type FiltreATraiter } from './logique';

type Props = {
  comptes: ReturnType<typeof aTraiter>;
  /** Puce choisie, ou null : liste entière */
  filtre: FiltreATraiter | null;
  onFiltrer: (f: FiltreATraiter | null) => void;
};

const COULEUR_COMPTE = {
  warn: 'text-warn dark:text-warn-dark',
  danger: 'text-danger dark:text-danger-dark',
} as const;

export function BandeauATraiter({ comptes, filtre, onFiltrer }: Props) {
  const puces = FILTRES_A_TRAITER.filter((f) => comptes[f.cle].length > 0);
  const choisi = FILTRES_A_TRAITER.find((f) => f.cle === filtre);

  if (puces.length === 0) {
    return <Legende className="mx-5 mb-3">Rien à traiter pour ce jour.</Legende>;
  }

  return (
    <View className="mb-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {puces.map((f) => {
          const n = comptes[f.cle].length;
          const actif = f.cle === filtre;
          return (
            <Pressable
              key={f.cle}
              accessibilityRole="button"
              accessibilityLabel={`${f.label}, ${pluriel(n, 'voiture')}`}
              accessibilityHint={actif ? 'Affiche toutes les voitures' : 'Affiche seulement ces voitures'}
              accessibilityState={{ selected: actif }}
              onPress={() => {
                impulsion('leger');
                onFiltrer(actif ? null : f.cle);
              }}
              className={`min-h-[44px] flex-row items-center gap-1 rounded-full border px-3.5 ${
                actif
                  ? 'border-accent bg-accent dark:border-accent-fond dark:bg-accent-fond'
                  : 'border-line bg-surface active:opacity-75 dark:border-line-dark dark:bg-surface-dark'
              }`}>
              <Text maxFontSizeMultiplier={1.4} className={`text-[14px] font-medium ${actif ? 'text-white' : 'text-ink dark:text-ink-dark'}`}>
                {f.label} ·
              </Text>
              <Text maxFontSizeMultiplier={1.4} className={`font-mono text-[14px] font-semibold ${actif ? 'text-white' : COULEUR_COMPTE[f.ton]}`}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {choisi ? (
        <View className="mx-5 mt-0.5 flex-row items-center gap-1.5">
          <Legende>Filtre : {choisi.label} ·</Legende>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tout afficher : retirer le filtre"
            hitSlop={{ left: 8, right: 8 }}
            onPress={() => {
              impulsion('leger');
              onFiltrer(null);
            }}
            className="min-h-[44px] justify-center active:opacity-60">
            <Legende ton="accent" className="font-semibold">
              Tout afficher
            </Legende>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
