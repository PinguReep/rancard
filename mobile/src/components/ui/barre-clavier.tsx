/**
 * Barre au-dessus du clavier : flèches « champ précédent » et « champ
 * suivant », et « OK » pour fermer le clavier. Indispensable avec les pavés
 * numériques (kilométrage, montant), qui n’ont pas de touche de validation.
 * À placer une seule fois, en fin d’écran, à côté du défilement. Absente sur
 * le web, où le navigateur gère le clavier.
 */

import type { PropsWithChildren } from 'react';
import { Platform, Pressable, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { KeyboardToolbar, type KeyboardToolbarProps } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/theme/tokens';

/**
 * Place occupée au-dessus du clavier quand la barre est visible (42 pt, plus
 * l’écart de la barre flottante sur iOS 26), à ajouter au `bottomOffset` des
 * défilements qui suivent le clavier.
 */
export const HAUTEUR_BARRE_CLAVIER = 54;

/** Couleurs du thème : la bibliothèque choisit clair ou sombre selon l’apparence du clavier. */
const THEME: NonNullable<KeyboardToolbarProps['theme']> = {
  light: { primary: palette.light.accent, disabled: palette.light.faint, background: palette.light.surface2, ripple: palette.light.line },
  dark: { primary: palette.dark.accent, disabled: palette.dark.faint, background: palette.dark.surface2, ripple: palette.dark.line },
};

/** Libellés VoiceOver en français (la bibliothèque les fournit en anglais), repérés par `testID`. */
const LIBELLES: Record<string, { label: string; hint?: string }> = {
  'keyboard.toolbar.previous': { label: 'Champ précédent' },
  'keyboard.toolbar.next': { label: 'Champ suivant' },
  'keyboard.toolbar.done': { label: 'OK', hint: 'Ferme le clavier' },
};

type ProprietesBouton = PropsWithChildren<{
  disabled?: boolean;
  onPress: (event: GestureResponderEvent) => void;
  accessibilityLabel: string;
  testID: string;
  style?: ViewStyle;
}>;

/** Bouton de la barre : toute la hauteur de la barre, 44 pt de large au moins. */
function BoutonBarre({ children, disabled, onPress, accessibilityLabel, testID, style }: ProprietesBouton) {
  const libelle = LIBELLES[testID];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle?.label ?? accessibilityLabel}
      accessibilityHint={libelle?.hint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [style, { minWidth: 44, height: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function BarreClavier() {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') return null;
  return (
    <KeyboardToolbar theme={THEME} insets={{ left: insets.left, right: insets.right }}>
      <KeyboardToolbar.Prev button={BoutonBarre} />
      <KeyboardToolbar.Next button={BoutonBarre} />
      <KeyboardToolbar.Done button={BoutonBarre} text="OK" />
    </KeyboardToolbar>
  );
}
