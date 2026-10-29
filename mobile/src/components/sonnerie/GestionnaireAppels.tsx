/**
 * Monté par le layout racine pendant une session : tient l'inscription de ce
 * téléphone à jour (option réceptionniste et permission appels, relues en
 * direct), ouvre l'écran d'appel dès qu'un appel est décroché ici, et montre
 * le bandeau d'appel entrant de la démonstration.
 */

import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { synchroniserSonnerie, useTelephone } from '@/lib/sonnerie';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

import { BandeauAppelEntrant } from './BandeauAppelEntrant';

export function GestionnaireAppels() {
  const router = useRouter();
  const segments = useSegments();
  const membre = useMembre();
  const p = usePermissions();
  const option = useDonnees((s) => s.garage.options.receptionniste);
  const eligible = option && p.appels && membre.actif;
  const actifId = useTelephone((s) => s.actif?.id ?? null);
  const [avis, montrerAvis] = useAvis();

  useEffect(() => {
    void synchroniserSonnerie({ membreId: membre.id, eligible });
  }, [membre.id, eligible]);

  const surEcranAppel = segments[0] === 'ecran-appel';
  useEffect(() => {
    if (actifId && !surEcranAppel) router.push('/ecran-appel');
    // Seulement quand un nouvel appel est décroché : « Réduire » doit laisser revenir à l'app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actifId]);

  return (
    <>
      <BandeauAppelEntrant onErreur={montrerAvis} />
      <Avis texte={avis} flottant />
    </>
  );
}
