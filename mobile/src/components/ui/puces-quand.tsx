/**
 * Puces du « quand » (v2c) : un jour parmi quelques-uns, une heure parmi
 * les heures libres. Servent à la date de la pièce, au rappel, au retour
 * prévu et à l’assistant. Puces de 44 pt, état `selected`, clair et
 * sombre. Les listes de jours et d’heures viennent du domaine
 * (`joursOuvres`, `heuresProposees` de `domain/echeances.ts`) : ces
 * composants ne décident de rien.
 */

import { format, isSameDay, isToday, isTomorrow } from 'date-fns';
import { useState } from 'react';
import { fr } from 'date-fns/locale';
import { Pressable, Text, View } from 'react-native';

import { impulsion } from './haptique';

type PropsPuce = {
  libelle: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

function Puce({ libelle, active, onPress, accessibilityLabel }: PropsPuce) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? libelle}
      accessibilityState={{ selected: active }}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`min-h-[44px] flex-row items-center justify-center rounded-full border px-4 ${
        active
          ? 'border-accent bg-accent dark:border-accent-fond dark:bg-accent-fond'
          : 'border-line bg-surface active:opacity-75 dark:border-line-dark dark:bg-surface-dark'
      }`}>
      <Text maxFontSizeMultiplier={1.4} className={`text-[15px] font-medium ${active ? 'text-white' : 'text-ink dark:text-ink-dark'}`}>
        {libelle}
      </Text>
    </Pressable>
  );
}

/** « Aujourd’hui », « Demain », « jeu. 29 » */
export function libelleJourPuce(d: Date): string {
  if (isToday(d)) return 'Aujourd’hui';
  if (isTomorrow(d)) return 'Demain';
  return format(d, 'EEE d', { locale: fr });
}

/** « jeudi 29 octobre », lu par VoiceOver */
const jourLu = (d: Date) => format(d, 'EEEE d MMMM', { locale: fr });

type PropsJours = {
  /** Jours proposés, dans l’ordre (aujourd’hui, demain, jours ouvrés suivants) */
  jours: Date[];
  /** Jour choisi ; un jour hors de la liste (choisi par « Autre date… ») s’affiche en plus, sélectionné */
  valeur: Date | null;
  onChoisir: (jour: Date) => void;
  /** Ajoute « Autre date… » en dernier (ouvre `FeuilleDate`, rendue par l’appelant) */
  autreDate?: () => void;
};

export function PucesJours({ jours, valeur, onChoisir, autreDate }: PropsJours) {
  const horsListe = valeur && !jours.some((j) => isSameDay(j, valeur)) ? valeur : null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {jours.map((j) => (
        <Puce
          key={j.toISOString()}
          libelle={libelleJourPuce(j)}
          active={valeur !== null && isSameDay(j, valeur)}
          accessibilityLabel={jourLu(j)}
          onPress={() => onChoisir(j)}
        />
      ))}
      {horsListe ? (
        <Puce
          libelle={format(horsListe, 'EEE d MMM', { locale: fr })}
          active
          accessibilityLabel={jourLu(horsListe)}
          onPress={() => (autreDate ? autreDate() : onChoisir(horsListe))}
        />
      ) : null}
      {autreDate ? <Puce libelle="Autre date…" active={false} accessibilityLabel="Choisir une autre date" onPress={autreDate} /> : null}
    </View>
  );
}

type PropsHeures = {
  /** Heures proposées, « 12:00 », « 14:00 », « 17:00 », fermeture */
  heures: string[];
  /** Heure choisie ; null : sans heure. Une heure hors de la liste (valeur déjà posée) s’affiche en tête, sélectionnée. */
  valeur: string | null;
  onChoisir: (heure: string | null) => void;
  /** Ajoute « Sans heure » en dernier (choisie quand `valeur` est nulle) */
  sansHeure?: boolean;
  /**
   * Heures de plus, derrière « Autre heure… » (toutes les heures pleines du
   * jour, `heuresDuJour`) : un appui les déplie à la suite, sans feuille de plus.
   */
  autres?: string[];
};

export function PucesHeures({ heures, valeur, onChoisir, sansHeure, autres }: PropsHeures) {
  const supplementaires = (autres ?? []).filter((h) => !heures.includes(h));
  const [deplie, setDeplie] = useState(false);
  const montrees = deplie ? supplementaires : [];
  const horsListe = valeur !== null && !heures.includes(valeur) && !montrees.includes(valeur) ? valeur : null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {horsListe ? <Puce libelle={horsListe} active onPress={() => onChoisir(horsListe)} /> : null}
      {heures.map((h) => (
        <Puce key={h} libelle={h} active={valeur === h} onPress={() => onChoisir(h)} />
      ))}
      {sansHeure ? <Puce libelle="Sans heure" active={valeur === null} onPress={() => onChoisir(null)} /> : null}
      {supplementaires.length && !deplie ? (
        <Puce libelle="Autre heure…" active={false} accessibilityLabel="Choisir une autre heure" onPress={() => setDeplie(true)} />
      ) : null}
      {montrees.map((h) => (
        <Puce key={`autre-${h}`} libelle={h} active={valeur === h} onPress={() => onChoisir(h)} />
      ))}
    </View>
  );
}
