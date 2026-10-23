/**
 * Ligne d'horaires d'un jour : ouvert/fermé et deux heures « de / à »
 * validées au format HH:MM (saisie souple : « 8h30 », « 8:30 », « 8 »).
 */

import { useState } from 'react';
import { AccessibilityInfo, Switch, TextInput, View } from 'react-native';

import { Erreur, Legende, Ligne, Texte, impulsion } from '@/components/ui';
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

const MESSAGE_HEURE = 'Heure non reconnue, exemple : 8h30.';

type PropsChamp = {
  valeur: string;
  libelle: string;
  /** Bord rouge : la dernière saisie de ce champ n'était pas une heure */
  enErreur: boolean;
  onValider: (v: string) => void;
  /** Saisie refusée : la valeur précédente est déjà remise */
  onInvalide: () => void;
  onSaisie: () => void;
};

function ChampHeure({ valeur, libelle, enErreur, onValider, onInvalide, onSaisie }: PropsChamp) {
  const t = useTheme();
  const [texte, setTexte] = useState(valeur);
  return (
    <TextInput
      accessibilityLabel={libelle}
      value={texte}
      onChangeText={(v) => {
        setTexte(v);
        onSaisie();
      }}
      onBlur={() => {
        const n = normaliserHeure(texte);
        if (!n) {
          // Heure illisible : on remet la dernière valeur valide et on dit pourquoi.
          setTexte(valeur);
          impulsion('erreur');
          onInvalide();
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
        enErreur ? 'border-danger dark:border-danger-dark' : 'border-line dark:border-line-dark'
      }`}
    />
  );
}

type Props = { jour: number; plage: Plage | null; onChange: (p: Plage | null) => void; derniere?: boolean };

export function LigneHoraire({ jour, plage, onChange, derniere }: Props) {
  const t = useTheme();
  const nom = JOURS[jour];
  // Champ dont la dernière saisie a été refusée, le temps d'afficher le message.
  const [refuse, setRefuse] = useState<'de' | 'a' | null>(null);

  function invalide(champ: 'de' | 'a') {
    setRefuse(champ);
    AccessibilityInfo.announceForAccessibility(MESSAGE_HEURE);
  }

  return (
    <Ligne derniere={derniere}>
      <Texte className="w-[76px]" numberOfLines={1}>
        {nom}
      </Texte>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {plage ? (
            <>
              <ChampHeure
                key={`de-${plage.de}`}
                libelle={`${nom}, ouverture`}
                valeur={plage.de}
                enErreur={refuse === 'de'}
                onValider={(de) => {
                  setRefuse(null);
                  onChange({ de, a: plage.a });
                }}
                onInvalide={() => invalide('de')}
                onSaisie={() => setRefuse(null)}
              />
              <Legende>à</Legende>
              <ChampHeure
                key={`a-${plage.a}`}
                libelle={`${nom}, fermeture`}
                valeur={plage.a}
                enErreur={refuse === 'a'}
                onValider={(a) => {
                  setRefuse(null);
                  onChange({ de: plage.de, a });
                }}
                onInvalide={() => invalide('a')}
                onSaisie={() => setRefuse(null)}
              />
            </>
          ) : (
            <Legende>Fermé</Legende>
          )}
        </View>
        {plage && refuse ? <Erreur className="mt-1">{MESSAGE_HEURE}</Erreur> : null}
      </View>
      <Switch
        accessibilityLabel={`${nom}, ouvert`}
        value={plage !== null}
        onValueChange={(ouvert) => {
          impulsion();
          setRefuse(null);
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
