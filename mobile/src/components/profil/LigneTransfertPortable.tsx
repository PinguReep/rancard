/**
 * Ligne du profil « Appels sur mon portable » (0019) : ouvre le réglage
 * « Recevoir les appels transférés sur mon portable » et dit s’il est
 * activé. Relu à chaque retour sur le profil. Sans la prestation
 * réceptionniste, la ligne reste visible, grisée, avec « Non inclus »
 * (docs/09 § 1), comme la sonnerie.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { repo } from '@/data';
import { NON_INCLUS } from '@/domain/prestations';

import { LigneInterrupteur } from './LigneInterrupteur';
import { LigneNavigation } from './LigneNavigation';

export function LigneTransfertPortable({ inclus, derniere }: { inclus: boolean; derniere?: boolean }) {
  const router = useRouter();
  const [accepte, setAccepte] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!inclus) return undefined;
      let actif = true;
      repo()
        .transfertPortable()
        .then(
          (r) => {
            if (actif) setAccepte(r.accepte);
          },
          () => {
            if (actif) setAccepte(null);
          },
        );
      return () => {
        actif = false;
      };
    }, [inclus]),
  );

  if (!inclus) {
    return (
      <LigneInterrupteur
        titre="Recevoir les appels transférés sur mon portable"
        aide={NON_INCLUS}
        valeur={false}
        onChange={() => undefined}
        desactive
        derniere={derniere}
      />
    );
  }
  const valeur = accepte === null ? undefined : accepte ? 'Activés' : 'Désactivés';
  return (
    <LigneNavigation
      titre="Appels sur mon portable"
      valeur={valeur}
      onPress={() => router.push('/profil/portable')}
      accessibilityLabel={`Recevoir les appels transférés sur mon portable${valeur ? `, ${valeur.toLowerCase()}` : ''}`}
      derniere={derniere}
    />
  );
}
