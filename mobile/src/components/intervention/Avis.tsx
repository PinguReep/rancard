/**
 * Avis transitoire (« SMS envoyé », « Lien de suivi copié ») : une pastille
 * sombre qui apparaît quelques secondes, jamais une erreur bloquante.
 * `flottant` la pose au-dessus de la barre d’onglets, ou au-dessus de la
 * barre d’action de la fiche avec `auDessus`.
 *
 * Avec une action (« Annuler » après un changement de statut), l’avis reste
 * plus longtemps et seul son bouton reçoit les appuis : le reste de la
 * pastille laisse passer le doigt vers l’écran. Un nouvel avis remplace le
 * précédent, et avec lui la possibilité d’annuler.
 *
 * `loinDuDoigt` (planning, appels, fiche) : un avis à bouton ne se pose
 * jamais là où le doigt va faire le geste suivant (cartes du planning ;
 * sur la fiche, la place de « Sans SMS » dans la feuille « Véhicule prêt »,
 * juste au-dessus de la barre d’action). Il va en haut de l’écran (sous
 * `margeHaute`), ou en bas si l’appui qui l’a produit était en haut
 * (`coteLoinDuDoigt`) ; le côté est choisi à l’apparition et ne bouge plus.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { coteLoinDuDoigt, gardeActive, useGardeActive, useMargeBasse } from '@/components/ui';
import { plaquesInsecables } from '@/lib/format';

/** Avis simple */
const DUREE_MS = 3200;
/**
 * Avis à bouton : le temps de voir l’erreur et de se reprendre (v2c : 8 s,
 * comme v2b ; le serveur accepte « Annuler » pendant 30 s, la latence est
 * absorbée).
 */
export const DUREE_AVIS_ACTION_MS = 8000;

export type ActionAvis = { libelle: string; onPress: () => void };
export type EtatAvis = {
  texte: string;
  action?: ActionAvis;
  /** Côté de l’écran loin du dernier appui, choisi à l’apparition d’un avis à bouton */
  cote?: 'haut' | 'bas';
};

export function useAvis(): [EtatAvis | null, (texte: string, action?: ActionAvis) => void] {
  const [avis, setAvis] = useState<EtatAvis | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  function montrer(texte: string, action?: ActionAvis) {
    if (minuterie.current) clearTimeout(minuterie.current);
    const fermer = () => {
      if (minuterie.current) clearTimeout(minuterie.current);
      setAvis(null);
    };
    // Un appui sur le bouton ferme l’avis avant de lancer l’action.
    setAvis({
      texte,
      cote: action ? coteLoinDuDoigt() : undefined,
      action: action
        ? {
            libelle: action.libelle,
            onPress: () => {
              fermer();
              action.onPress();
            },
          }
        : undefined,
    });
    minuterie.current = setTimeout(() => setAvis(null), action ? DUREE_AVIS_ACTION_MS : DUREE_MS);
  }

  return [avis, montrer];
}

type Props = {
  texte: EtatAvis | string | null;
  flottant?: boolean;
  /** Hauteur à laisser libre sous l’avis flottant (barre d’action de la fiche) ; par défaut la barre d’onglets */
  auDessus?: number;
  /** Avis à bouton posé loin du doigt, jamais sur les boutons des cartes (planning, appels) ni sous le pouce (fiche) */
  loinDuDoigt?: boolean;
  /** Écart sous le haut de l’écran pour un avis posé en haut (en-tête natif transparent de la fiche) */
  margeHaute?: number;
};

/** Écart sous le haut de l’écran (zone sûre déjà comptée par `Ecran`). */
const MARGE_HAUTE = 8;

export function Avis({ texte: entree, flottant, auDessus, loinDuDoigt, margeHaute = MARGE_HAUTE }: Props) {
  const margeBasse = useMargeBasse();
  // Pendant la garde du double appui, le bouton de l’avis est inerte : l’avis s’ouvre souvent là où
  // était le bouton de geste (dernière carte du planning), et le second appui défairait aussitôt le geste.
  const garde = useGardeActive();
  const avis = typeof entree === 'string' ? { texte: entree } : entree;
  if (!avis) return null;
  const action = avis.action;
  const enHaut = Boolean(flottant && loinDuDoigt && action && avis.cote === 'haut');
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents={action ? 'box-none' : 'none'}
      accessibilityLiveRegion="polite"
      className={flottant ? 'absolute left-4 right-4 items-center' : 'mt-3 items-center'}
      style={flottant ? (enHaut ? { top: margeHaute } : { bottom: auDessus ?? margeBasse }) : undefined}>
      <View
        pointerEvents={action ? 'box-none' : 'none'}
        className={`rounded-full bg-ink dark:bg-ink-dark ${action ? 'flex-row items-center gap-3 py-0.5 pl-4 pr-1.5' : 'px-4 py-2.5'}`}>
        <Text className={`text-[14px] font-medium text-bg dark:text-bg-dark ${action ? 'flex-shrink' : ''}`} numberOfLines={action ? 2 : undefined}>
          {/* Le libellé accessible du bouton garde le texte brut. */}
          {plaquesInsecables(avis.texte)}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action.libelle} : ${avis.texte}`}
            accessibilityState={{ disabled: garde }}
            hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
            onPress={() => {
              // Lu au moment de l’appui, pas au rendu : deux appuis peuvent tomber entre deux rendus.
              if (!gardeActive()) action.onPress();
            }}
            className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2.5 active:opacity-60 ${garde ? 'opacity-50' : ''}`}>
            <Text className="text-[15px] font-bold text-accent-dark dark:text-accent">{action.libelle}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
