/**
 * Lecture à l’ouverture d’une fiche (repris de v2b, relais d’équipe) : les
 * notifications non lues qui visent l’intervention affichée, celles du
 * membre comme celles du garage, passent en lues dès que la fiche s’ouvre.
 * La cloche et la pastille « Nouvelle » de la carte retombent d’autant.
 *
 * Une seule écriture par notification : celles déjà demandées ne sont pas
 * redemandées si la liste change avant que le store ne les voie lues
 * (nouvelle notification arrivée entre-temps, rechargement).
 */

import { useEffect, useMemo, useRef } from 'react';

import { repo } from '@/data';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

import { notificationsVisibles } from './visibles';

/** `interventionId` à null tant que la fiche n’est pas visible du membre. */
export function useLireALOuverture(interventionId: string | null | undefined) {
  const membre = useMembre();
  const p = usePermissions();
  const notifications = useDonnees((s) => s.notifications);
  const interventions = useDonnees((s) => s.interventions);
  const demandees = useRef(new Set<string>());

  // Clé stable (identifiants joints) : l’effet ne repart que si la liste à lire change.
  const aLire = useMemo(() => {
    if (!interventionId) return '';
    return notificationsVisibles({ notifications, interventions }, membre, p)
      .filter((n) => !n.lue && n.cible?.type === 'intervention' && n.cible.id === interventionId)
      .map((n) => n.id)
      .join(',');
  }, [interventionId, notifications, interventions, membre, p]);

  useEffect(() => {
    if (!aLire) return;
    for (const id of aLire.split(',')) {
      if (demandees.current.has(id)) continue;
      demandees.current.add(id);
      // Marquer lue est un confort : un échec ne bloque rien, on pourra réessayer à la prochaine ouverture.
      repo()
        .marquerLue(id)
        .catch(() => {
          demandees.current.delete(id);
        });
    }
  }, [aLire]);
}
