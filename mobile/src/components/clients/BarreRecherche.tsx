/**
 * Barre de recherche : un Champ du kit avec la loupe à gauche et un bouton
 * d'effacement à droite. Jamais de focus automatique dans les onglets.
 * « Effacer » vide le champ et lui rend le focus : le clavier reste ouvert
 * pour l'appel suivant.
 *
 * v2c (repris de la v2b) : l’écran peut tenir la référence du champ pour lui
 * rendre le focus au retour d’une fiche, et `selectionnerAuFocus` sélectionne
 * toute la requête à ce moment : on retape par-dessus sans l’effacer.
 */

import { useRef, type RefObject } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { useTheme } from '@/theme/tokens';

type Props = {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Référence vers le champ, pour le refocaliser depuis l’écran (retour d’une fiche) */
  champRef?: RefObject<TextInput | null>;
  /** Le focus sélectionne toute la requête : on retape par-dessus sans l’effacer */
  selectionnerAuFocus?: boolean;
};

export function BarreRecherche({ valeur, onChange, placeholder = 'Nom, plaque, téléphone…', autoFocus, champRef, selectionnerAuFocus }: Props) {
  const t = useTheme();
  const interne = useRef<TextInput>(null);
  const champ = champRef ?? interne;
  return (
    <View>
      <Champ
        ref={champ}
        type="texte"
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        selectTextOnFocus={selectionnerAuFocus}
        accessibilityLabel="Rechercher un client"
        style={{ paddingLeft: 42, paddingRight: valeur ? 44 : 16 }}
      />
      <View pointerEvents="none" className="absolute left-3.5 top-0 h-12 justify-center">
        <Icone nom="recherche" taille={18} couleur={t.muted} />
      </View>
      {valeur ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Effacer la recherche"
          onPress={() => {
            impulsion();
            onChange('');
            champ.current?.focus();
          }}
          className="absolute right-0 top-0 h-12 w-12 items-center justify-center active:opacity-70">
          <View className="h-5 w-5 items-center justify-center rounded-full bg-faint dark:bg-faint-dark">
            <Icone nom="fermer" taille={11} couleur={t.surface} poids="bold" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
