/**
 * Bouton « Fermer » rond pour l'en-tête natif d'une pile modale : le
 * BoutonRond du kit, même taille que partout ailleurs.
 */

import { useRouter } from 'expo-router';

import { BoutonRond } from '@/components/ui';

export function BoutonFermer() {
  const router = useRouter();
  return (
    <BoutonRond
      nom="fermer"
      label="Fermer"
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/planning');
      }}
    />
  );
}
