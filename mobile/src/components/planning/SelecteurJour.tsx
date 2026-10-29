/**
 * Dix jours, de J-3 à J+6, en bande qui défile. À l’ouverture, la bande
 * montre J-3 à J+3 comme avant (aujourd’hui au même endroit) et laisse
 * dépasser la moitié du jour suivant pour inviter à faire défiler. Le jour
 * choisi s’allume ; aujourd’hui reste repérable en couleur ; un point
 * signale les jours avec rendez-vous.
 *
 * Au-delà de J+6 (v2c, P5) : une case « Autre jour » (calendrier) ouvre le
 * choix d’une date (`onAutreJour`, feuille rendue par le planning). Le jour
 * choisi hors de la bande s’affiche comme une case de plus, sélectionnée,
 * avec son mois (« mar. 10 nov. ») ; revenir sur un jour de la bande la
 * retire. Un ajout depuis l’assistant au-delà de J+6 s’y place de même.
 */

import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Icone, LARGEUR_MAX, impulsion } from '@/components/ui';
import { dateLongue } from '@/lib/format';
import { halo, useTheme } from '@/theme/tokens';

const DECALAGES = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

/** Les dix jours de la bande, de J-3 à J+6. */
export const joursDeLaBande = (aujourdhui: Date = startOfDay(new Date())) => DECALAGES.map((n) => addDays(aujourdhui, n));

/** Case d’un jour (dimensions v1) et marge latérale de l’écran. */
const CASE_L = 48;
const MARGE = 16;
/** Cases visibles sans défiler : sept entières et la moitié de la huitième. */
const VISIBLES = 7.5;

type Props = {
  jour: Date;
  onChanger: (d: Date) => void;
  aDesRendezVous?: (d: Date) => boolean;
  /** « Autre jour » : ouvre le choix d’une date au-delà de la bande */
  onAutreJour?: () => void;
};

type Case = { type: 'jour'; d: Date; hors: boolean } | { type: 'autre' };

export function SelecteurJour({ jour, onChanger, aDesRendezVous, onAutreJour }: Props) {
  const t = useTheme();
  // Largeur de l’écran, bornée comme le contenu (`Ecran`) : sur iPad, la bande garde l’écart d’un téléphone.
  const width = Math.min(useWindowDimensions().width, LARGEUR_MAX);
  const bande = useRef<ScrollView>(null);
  const decalage = useRef(0);
  const aujourdhui = startOfDay(new Date());
  const ecart = Math.max(2, (width - MARGE - VISIBLES * CASE_L) / 7);

  const jours = joursDeLaBande(aujourdhui);
  const dansLaBande = jours.some((d) => isSameDay(d, jour));
  const cases: Case[] = jours.map((d) => ({ type: 'jour', d, hors: false }));
  if (!dansLaBande) {
    const hors: Case = { type: 'jour', d: startOfDay(jour), hors: true };
    if (jour < jours[0]) cases.unshift(hors);
    else cases.push(hors);
  }
  if (onAutreJour) cases.push({ type: 'autre' });
  const index = cases.findIndex((c) => c.type === 'jour' && isSameDay(c.d, jour));

  // Jour choisi hors de la vue (ajout depuis l’assistant, « Autre jour », case à moitié visible) : la bande défile pour le montrer.
  useEffect(() => {
    if (index < 0) return;
    const debut = MARGE + index * (CASE_L + ecart);
    const fin = debut + CASE_L;
    const x = decalage.current;
    if (debut < x) {
      bande.current?.scrollTo({ x: Math.max(0, debut - MARGE), animated: true });
    } else if (fin > x + width) {
      // La case « Autre jour » qui suit reste visible elle aussi.
      const suivante = onAutreJour && index === cases.length - 2 ? CASE_L + ecart : 0;
      bande.current?.scrollTo({ x: fin + suivante + MARGE - width, animated: true });
    }
  }, [index, ecart, width, cases.length, onAutreJour]);

  return (
    <ScrollView
      ref={bande}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={(e) => {
        decalage.current = e.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
      contentContainerStyle={{ paddingHorizontal: MARGE }}>
      <View className="flex-row" style={{ gap: ecart }} accessibilityRole="tablist">
        {cases.map((c) => {
          if (c.type === 'autre') {
            return (
              <Pressable
                key="autre"
                accessibilityRole="button"
                accessibilityLabel="Autre jour : choisir une date"
                onPress={() => {
                  impulsion('leger');
                  onAutreJour?.();
                }}
                className="h-[62px] w-[48px] items-center justify-center gap-1 rounded-2xl active:opacity-70">
                <Icone nom="calendrier" taille={20} couleur={t.accent} />
                <Text maxFontSizeMultiplier={1.3} className="text-[11px] font-semibold text-accent dark:text-accent-dark">
                  Autre
                </Text>
              </Pressable>
            );
          }
          const d = c.d;
          const actif = isSameDay(d, jour);
          const estAujourdhui = isSameDay(d, aujourdhui);
          const point = aDesRendezVous?.(d);
          return (
            <Pressable
              key={c.hors ? 'hors' : d.toISOString()}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={estAujourdhui ? `Aujourd’hui, ${dateLongue(d.toISOString())}` : dateLongue(d.toISOString())}
              onPress={() => {
                if (actif) return;
                impulsion('leger');
                onChanger(d);
              }}
              style={actif && t.scheme === 'dark' ? halo(t.accentFond, 14, 0.7) : undefined}
              className={`h-[62px] w-[48px] items-center justify-center rounded-2xl ${actif ? 'bg-accent dark:bg-accent-fond' : 'active:opacity-70'}`}>
              <Text
                maxFontSizeMultiplier={1.3}
                className={`text-[12px] font-semibold ${actif ? 'text-white/80' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-muted dark:text-muted-dark'}`}>
                {format(d, 'EEE', { locale: fr }).replace('.', '')}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                className={`text-[19px] font-bold ${c.hors ? 'leading-[22px]' : ''} ${actif ? 'text-white' : estAujourdhui ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'}`}>
                {format(d, 'd')}
              </Text>
              {c.hors ? (
                // Hors de la bande, le mois remplace le point : « mar. 10 nov. » se lit d’un coup d’œil.
                <Text maxFontSizeMultiplier={1.3} className={`text-[10px] font-semibold ${actif ? 'text-white/80' : 'text-muted dark:text-muted-dark'}`}>
                  {format(d, 'MMM', { locale: fr })}
                </Text>
              ) : (
                <View className={`mt-0.5 h-1 w-1 rounded-full ${point ? (actif ? 'bg-white' : 'bg-accent dark:bg-accent-dark') : 'bg-transparent'}`} />
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
