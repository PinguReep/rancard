/**
 * Champs de saisie. Grande zone tactile, libellé au-dessus, erreur en
 * dessous. Le clavier est choisi par le type. Hauteur minimale, pour suivre
 * la taille de texte du système.
 */

import { useState, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/tokens';

import { Erreur, Legende } from './texte';

type Props = Omit<TextInputProps, 'className'> & {
  libelle?: string;
  erreur?: string | null;
  aide?: string;
  type?: 'texte' | 'email' | 'telephone' | 'motdepasse' | 'nombre' | 'plaque' | 'multiligne';
  /** Marge basse (mb-4 par défaut) et classes du conteneur */
  className?: string;
  /** Référence vers le TextInput (enchaînement des champs au clavier) */
  ref?: Ref<TextInput>;
};

const parType: Record<NonNullable<Props['type']>, Partial<TextInputProps>> = {
  texte: { autoCapitalize: 'sentences' },
  email: { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', textContentType: 'emailAddress', autoCorrect: false },
  telephone: { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' },
  motdepasse: { secureTextEntry: true, autoCapitalize: 'none', autoComplete: 'password', textContentType: 'password' },
  nombre: { keyboardType: 'number-pad' },
  plaque: { autoCapitalize: 'characters', autoCorrect: false },
  multiligne: { multiline: true, textAlignVertical: 'top' },
};

export function Champ({ libelle, erreur, aide, type = 'texte', className = 'mb-4', ref, ...p }: Props) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View className={className}>
      {libelle ? <Legende className="mb-1.5 ml-1 font-medium">{libelle}</Legende> : null}
      <TextInput
        ref={ref}
        {...parType[type]}
        {...p}
        onFocus={(e) => {
          setFocus(true);
          p.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          p.onBlur?.(e);
        }}
        placeholderTextColor={t.muted}
        accessibilityLabel={p.accessibilityLabel ?? libelle}
        className={`rounded-xl bg-surface dark:bg-surface-dark border px-4 text-[17px] text-ink dark:text-ink-dark ${
          type === 'multiligne' ? 'min-h-[96px] py-3' : 'min-h-[48px] py-3'
        } ${erreur ? 'border-danger dark:border-danger-dark' : focus ? 'border-accent dark:border-accent-dark' : 'border-line dark:border-line-dark'}`}
      />
      {erreur ? <Erreur className="mt-1.5 ml-1">{erreur}</Erreur> : aide ? <Legende className="mt-1.5 ml-1">{aide}</Legende> : null}
    </View>
  );
}
