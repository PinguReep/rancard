/**
 * Choisir un jour au-delà des puces (P5) : six semaines à la suite, à
 * partir de la semaine en cours, puis les six suivantes, jours fermés et
 * passés grisés et inertes. Sert au planning (« Autre jour »), à
 * l’assistant, à Déplacer, à Reprogrammer, à la date de pièce et au retour
 * prévu.
 *
 * Six semaines plutôt qu’un mois (intégration v2c) : un jour des cinq
 * semaines qui viennent se choisit toujours en un appui, même quand il
 * tombe le mois suivant (le 10 novembre depuis le 27 octobre). Le 1er de
 * chaque mois porte le nom du mois.
 *
 * `onChoisir` reçoit le jour (minuit, heure locale) ; l’appelant ferme la
 * feuille. Ouverte depuis une autre feuille, elle se rend **dans** le
 * contenu de cette feuille (une seule fenêtre modale à la fois sur iOS).
 */

import { addDays, addWeeks, differenceInCalendarDays, format, isAfter, isBefore, isSameDay, startOfDay, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { plageDuJour } from '@/components/nouvelle-intervention/creneaux';
import type { Garage } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

import { Feuille } from './feuille';
import { impulsion } from './haptique';
import { Icone } from './icone';
import { Legende } from './texte';

/** Au plus loin, par défaut : aujourd’hui + 90 jours. */
export const HORIZON_FEUILLE_DATE_JOURS = 90;

/** Semaines montrées à la fois (la hauteur d’un mois de six semaines). */
const SEMAINES = 6;

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  horaires: Garage['horaires'];
  /** Jour choisi, sélectionné à l’ouverture (et semaines affichées) */
  valeur?: Date | null;
  /** Premier jour choisissable (défaut : aujourd’hui) */
  min?: Date;
  /** Dernier jour choisissable (défaut : aujourd’hui + 90 jours) */
  max?: Date;
  onChoisir: (jour: Date) => void;
};

function Fleche({ sens, possible, onPress }: { sens: 'precedent' | 'suivant'; possible: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sens === 'precedent' ? 'Semaines précédentes' : 'Semaines suivantes'}
      accessibilityState={{ disabled: !possible }}
      disabled={!possible}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`h-11 w-11 items-center justify-center rounded-full ${possible ? 'active:bg-surface2 dark:active:bg-surface2-dark' : 'opacity-30'}`}>
      <Icone nom={sens === 'precedent' ? 'chevron.gauche' : 'chevron.droite'} taille={18} couleur={t.ink} />
    </Pressable>
  );
}

const ENTETES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const lundiDe = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

/** Les `SEMAINES` semaines (lundi à dimanche) à partir du lundi `debut`. */
function semainesDepuis(debut: Date): Date[][] {
  return Array.from({ length: SEMAINES }, (_, s) => Array.from({ length: 7 }, (_, k) => addDays(debut, s * 7 + k)));
}

/** « 26 oct. au 6 déc. 2026 » (affiché) et « du lundi 26 octobre au dimanche 6 décembre 2026 » (lu). */
function etendue(debut: Date, fin: Date): { texte: string; parle: string } {
  const memeAnnee = debut.getFullYear() === fin.getFullYear();
  const d = format(debut, memeAnnee ? 'd MMM' : 'd MMM yyyy', { locale: fr });
  const f = format(fin, 'd MMM yyyy', { locale: fr });
  const dl = format(debut, memeAnnee ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy', { locale: fr });
  const fl = format(fin, 'EEEE d MMMM yyyy', { locale: fr });
  return { texte: `${d} au ${f}`, parle: `Du ${dl} au ${fl}` };
}

export function FeuilleDate({ ouverte, onFermer, titre, horaires, valeur, min, max, onChoisir }: Props) {
  const premier = startOfDay(min ?? new Date());
  const dernier = startOfDay(max ?? addDays(new Date(), HORIZON_FEUILLE_DATE_JOURS));
  const depart = valeur && !isBefore(valeur, premier) && !isAfter(valeur, dernier) ? valeur : premier;
  // Page 0 : les six semaines qui commencent avec la semaine du premier jour choisissable.
  const origine = lundiDe(premier);
  const pageDe = (d: Date) => Math.max(0, Math.floor(differenceInCalendarDays(lundiDe(d), origine) / (7 * SEMAINES)));
  const [page, setPage] = useState(() => pageDe(depart));

  // Chaque ouverture repart des semaines du jour choisi (ou du premier jour possible).
  const pageDepart = pageDe(depart);
  useEffect(() => {
    if (ouverte) setPage(pageDepart);
  }, [ouverte, pageDepart]);

  const debut = addWeeks(origine, SEMAINES * page);
  const fin = addDays(debut, 7 * SEMAINES - 1);
  const precedentPossible = page > 0;
  const suivantPossible = !isAfter(addDays(fin, 1), dernier);
  const titrePage = etendue(debut, fin);

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre}>
      <View className="mb-2 flex-row items-center justify-between">
        <Fleche sens="precedent" possible={precedentPossible} onPress={() => setPage((k) => Math.max(0, k - 1))} />
        <Text accessibilityRole="header" accessibilityLabel={titrePage.parle} className="text-[17px] font-semibold text-ink dark:text-ink-dark">
          {titrePage.texte}
        </Text>
        <Fleche sens="suivant" possible={suivantPossible} onPress={() => setPage((k) => k + 1)} />
      </View>
      <View className="flex-row" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {ENTETES.map((j) => (
          <View key={j} className="flex-1 items-center pb-1">
            <Legende ton="faint" className="font-semibold uppercase">
              {j.slice(0, 1)}
            </Legende>
          </View>
        ))}
      </View>
      {semainesDepuis(debut).map((semaine) => (
        <View key={semaine[0].toISOString()} className="flex-row">
          {semaine.map((d) => {
            const passe = isBefore(d, premier);
            const horsPortee = isAfter(d, dernier);
            const ferme = !plageDuJour(horaires, d);
            const inactif = passe || horsPortee || ferme;
            const choisi = Boolean(valeur && isSameDay(d, valeur));
            const auj = isSameDay(d, new Date());
            // Le 1er porte le nom du mois : on voit où commence le mois suivant.
            const nouveauMois = d.getDate() === 1;
            // « dimanche 1er novembre » : l’ordinal du premier du mois, comme à l’oral.
            const lu = format(d, 'EEEE d MMMM', { locale: fr }).replace(/^(\S+) 1 /, '$1 1er ');
            return (
              <Pressable
                key={d.toISOString()}
                accessibilityRole="button"
                accessibilityLabel={`${lu}, ${passe ? 'passé' : ferme ? 'fermé' : horsPortee ? 'indisponible' : 'choisir'}`}
                accessibilityState={{ disabled: inactif, selected: choisi }}
                disabled={inactif}
                onPress={() => {
                  impulsion('leger');
                  onChoisir(startOfDay(d));
                }}
                className={`h-11 flex-1 items-center justify-center ${inactif ? 'opacity-50' : ''}`}>
                <View
                  className={`h-10 w-10 items-center justify-center rounded-full ${
                    choisi ? 'bg-accent dark:bg-accent-fond' : auj ? 'border border-accent dark:border-accent-dark' : ''
                  }`}>
                  {nouveauMois ? (
                    <Text
                      className={`-mb-0.5 text-[9px] font-bold uppercase leading-[10px] ${
                        choisi ? 'text-white' : 'text-accent dark:text-accent-dark'
                      }`}>
                      {format(d, 'MMM', { locale: fr }).replace('.', '')}
                    </Text>
                  ) : null}
                  <Text
                    className={`${nouveauMois ? 'text-[14px] leading-[16px]' : 'text-[16px]'} ${
                      choisi ? 'font-semibold text-white' : inactif ? 'text-faint dark:text-faint-dark' : 'text-ink dark:text-ink-dark'
                    }`}>
                    {format(d, 'd')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Feuille>
  );
}
