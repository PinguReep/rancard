/**
 * Coquille de formulaire en feuille de page (pageSheet sur iOS, plein écran
 * ailleurs) : titre, bouton Fermer, contenu défilant qui suit le clavier,
 * action principale dans un pied collé au clavier. Utilisée pour « Nouveau
 * client » et « Ajouter un véhicule », sans toucher à la pile de navigation.
 */

import { useState, type ReactNode } from 'react';
import { Modal, Platform, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoutonRond } from '@/components/ui/bouton-rond';
import { LARGEUR_MAX } from '@/components/ui/ecran';
import { SousTitre } from '@/components/ui/texte';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  children: ReactNode;
  /** Bouton principal, toujours visible au-dessus du clavier */
  pied?: ReactNode;
  /**
   * true = rien n'a encore été saisi : la feuille se ferme aussi d'un
   * glissement vers le bas (iOS). Sinon, seule la croix la ferme.
   */
  vide?: boolean;
};

export function ModaleFormulaire({ ouverte, onFermer, titre, children, pied, vide = false }: Props) {
  const insets = useSafeAreaInsets();
  // Hauteur du pied collé au clavier : le champ actif reste visible juste au-dessus.
  const [hauteurPied, setHauteurPied] = useState(0);
  const ecartPied = hauteurPied > 0 ? hauteurPied - insets.bottom + 16 : 96;

  return (
    <Modal
      visible={ouverte}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      allowSwipeDismissal={vide}
      onRequestClose={onFermer}
      onDismiss={() => {
        // Fermeture native (balayage) : on resynchronise l'état si besoin.
        if (ouverte) onFermer();
      }}>
      <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: Platform.OS === 'ios' ? 8 : insets.top }}>
        <View className="w-full flex-1 self-center" style={{ maxWidth: LARGEUR_MAX }}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <SousTitre>{titre}</SousTitre>
            <BoutonRond nom="fermer" label="Fermer" onPress={onFermer} />
          </View>
          <KeyboardAwareScrollView
            bottomOffset={pied ? ecartPied : 24}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: pied ? 24 : insets.bottom + 24 }}>
            {children}
          </KeyboardAwareScrollView>
          {pied ? (
            // Collé au clavier ouvert ; la marge de la zone sûre passe alors sous le clavier.
            <KeyboardStickyView offset={{ opened: insets.bottom }}>
              <View
                className="border-t border-line bg-bg px-4 pt-3 dark:border-line-dark dark:bg-bg-dark"
                style={{ paddingBottom: insets.bottom + 12 }}
                onLayout={(e) => setHauteurPied(e.nativeEvent.layout.height)}>
                {pied}
              </View>
            </KeyboardStickyView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
