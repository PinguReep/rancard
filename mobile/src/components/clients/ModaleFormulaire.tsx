/**
 * Coquille de formulaire en feuille de page (pageSheet sur iOS, plein écran
 * ailleurs) : titre, bouton Fermer, contenu défilant qui suit le clavier,
 * action principale en fin de formulaire. Utilisée pour « Nouveau client »
 * et « Ajouter un véhicule », sans toucher à la pile de navigation.
 */

import type { ReactNode } from 'react';
import { Modal, Platform, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoutonRond } from '@/components/ui/bouton-rond';
import { LARGEUR_MAX } from '@/components/ui/ecran';
import { SousTitre } from '@/components/ui/texte';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  children: ReactNode;
  /** Bouton principal, rendu en fin de formulaire */
  pied?: ReactNode;
};

export function ModaleFormulaire({ ouverte, onFermer, titre, children, pied }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={ouverte}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onFermer}
      onDismiss={() => {
        // Balayage vers le bas sur iOS : on resynchronise l'état.
        if (ouverte) onFermer();
      }}>
      <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: Platform.OS === 'ios' ? 8 : insets.top }}>
        <View className="w-full flex-1 self-center" style={{ maxWidth: LARGEUR_MAX }}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <SousTitre>{titre}</SousTitre>
            <BoutonRond nom="fermer" label="Fermer" onPress={onFermer} />
          </View>
          <KeyboardAwareScrollView
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
            {children}
            {pied ? <View className="mt-2">{pied}</View> : null}
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
