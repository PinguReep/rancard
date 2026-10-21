/**
 * Ligne d'horaires d'un jour : ouvert/fermé et deux heures « de / à »
 * validées au format HH:MM (saisie souple : « 8h30 », « 8:30 », « 8 »).
 */

import { useState } from 'react';
import { Switch, TextInput, View } from 'react-native';

import { Legende, Ligne, Texte, impulsion } from '@/components/ui';
import { useTheme } from '@/theme/tokens';

export type Plage = { de: string; a: string };

export const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Lundi → dimanche, comme on lit une semaine de travail. */
export const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];

const PLAGE_PAR_DEFAUT: Plage = { de: '08:30', a: '18:00' };

/** « 8h30 » → « 08:30 », null si ce n'est pas une heure. */
export function normaliserHeure(saisie: string): string | null {
  const m = /^\s*(\d{1,2})\s*(?:[:hH]\s*(\d{0,2}))?\s*$/.exec(saisie);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (h > 23 || mn > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

function ChampHeure({ valeur, libelle, onValider }: { valeur: string; libelle: string; onValider: (v: string) => void }) {
  const t = useTheme();
  const [texte, setTexte] = useState(valeur);
  const [erreur, setErreur] = useState(false);
  return (
    <TextInput
      accessibilityLabel={libelle}
      value={texte}
      onChangeText={(v) => {
        setTexte(v);
        setErreur(false);
      }}
      onBlur={() => {
        const n = normaliserHeure(texte);
        if (!n) {
          setErreur(true);
          impulsion('erreur');
          return;
        }
        setTexte(n);
        if (n !== valeur) onValider(n);
      }}
      keyboardType="numbers-and-punctuation"
      placeholder="08:30"
      placeholderTextColor={t.muted}
      maxLength={5}
      selectTextOnFocus
      className={`min-h-[44px] min-w-[64px] rounded-lg border bg-surface2 dark:bg-surface2-dark px-1 py-2 text-center text-[15px] text-ink dark:text-ink-dark ${
        erreur ? 'border-danger dark:border-danger-dark' : 'border-line dark:border-line-dark'
      }`}
    />
  );
}

type Props = { jour: number; plage: Plage | null; onChange: (p: Plage | null) => void; derniere?: boolean };

export function LigneHoraire({ jour, plage, onChange, derniere }: Props) {
  const t = useTheme();
  const nom = JOURS[jour];
  return (
    <Ligne derniere={derniere}>
      <Texte className="w-[76px]" numberOfLines={1}>
        {nom}
      </Texte>
      <View className="flex-1 flex-row items-center gap-2">
        {plage ? (
          <>
            <ChampHeure key={`de-${plage.de}`} libelle={`${nom}, ouverture`} valeur={plage.de} onValider={(de) => onChange({ de, a: plage.a })} />
            <Legende>à</Legende>
            <ChampHeure key={`a-${plage.a}`} libelle={`${nom}, fermeture`} valeur={plage.a} onValider={(a) => onChange({ de: plage.de, a })} />
          </>
        ) : (
          <Legende>Fermé</Legende>
        )}
      </View>
      <Switch
        accessibilityLabel={`${nom}, ouvert`}
        value={plage !== null}
        onValueChange={(ouvert) => {
          impulsion();
          onChange(ouvert ? PLAGE_PAR_DEFAUT : null);
        }}
        trackColor={{ true: t.accentFond, false: t.line }}
        thumbColor={t.blanc}
        {...({ activeThumbColor: t.blanc } as object)}
        ios_backgroundColor={t.line}
      />
    </Ligne>
  );
}
