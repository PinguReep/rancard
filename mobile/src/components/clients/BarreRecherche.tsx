/**
 * Barre de recherche : un Champ du kit avec la loupe à gauche et un bouton
 * d'effacement à droite. Jamais de focus automatique dans les onglets.
 */

import { Pressable, View } from 'react-native';

import { Champ } from '@/components/ui/champ';
import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { useTheme } from '@/theme/tokens';

type Props = {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function BarreRecherche({ valeur, onChange, placeholder = 'Nom, plaque, téléphone…', autoFocus }: Props) {
  const t = useTheme();
  return (
    <View>
      <Champ
        type="texte"
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
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
