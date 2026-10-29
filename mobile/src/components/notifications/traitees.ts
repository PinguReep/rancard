/**
 * Une notification traitée n’est plus « non lue ». Une fiche annoncée par le
 * site ou par le réceptionniste qui a quitté « À valider » depuis l’annonce
 * (validée, donc planifiée ; ignorée, donc annulée) est marquée lue pour le
 * membre, qu’elle ait été traitée depuis l’onglet Appels, depuis la fiche ou
 * par un collègue. Jamais pour un accord, une pièce ou un message d’équipe :
 * ils n’ont pas de fiche à traiter, seul le membre sait s’il les a lus.
 */

import { useEffect, useRef } from 'react';

import { repo } from '@/data';
import type { Snapshot } from '@/data/repo';
import type { Membre, Notification, Permissions, TypeNotification } from '@/domain/types';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

import { notificationsVisibles } from './visibles';

/** Types dont la cible est une fiche « À valider » : les seuls qui se lisent d’eux-mêmes. */
const TYPES_A_TRAITER: TypeNotification[] = ['rdv_site', 'ia'];

/**
 * Notifications non lues du membre dont la fiche a été traitée. « N’est plus
 * à valider » se lit sur les événements : un changement de statut a eu lieu
 * après la notification. Une fiche déjà planifiée quand elle a été annoncée
 * reste donc une nouvelle à lire.
 */
export function notificationsTraitees(
  s: Pick<Snapshot, 'notifications' | 'interventions' | 'appels' | 'evenements'>,
  membre: Pick<Membre, 'id'>,
  p: Pick<Permissions, 'voirTout' | 'appels'>,
): Notification[] {
  return notificationsVisibles(s, membre, p).filter((n) => {
    if (n.lue || !n.cible || !TYPES_A_TRAITER.includes(n.type)) return false;
    const cible = n.cible;
    const interventionId = cible.type === 'intervention' ? cible.id : s.appels.find((a) => a.id === cible.id)?.interventionId;
    const i = interventionId ? s.interventions.find((x) => x.id === interventionId) : undefined;
    if (!i || i.statut === 'a_valider') return false;
    const annonce = Date.parse(n.creeLe);
    return s.evenements.some((ev) => ev.interventionId === i.id && ev.type === 'statut' && Date.parse(ev.creeLe) >= annonce);
  });
}

/**
 * Monté une fois sous les onglets. Une seule écriture par notification et
 * par membre (mémo des identifiants déjà envoyés) ; un échec est sans
 * conséquence, la pastille reviendra au prochain chargement.
 */
export function useNotificationsQuiSuivent() {
  const membreId = useMembre().id;
  const { voirTout, appels: voirAppels } = usePermissions();
  const notifications = useDonnees((s) => s.notifications);
  const interventions = useDonnees((s) => s.interventions);
  const appels = useDonnees((s) => s.appels);
  const evenements = useDonnees((s) => s.evenements);
  const envoyees = useRef(new Set<string>());

  useEffect(() => {
    const aMarquer = notificationsTraitees(
      { notifications, interventions, appels, evenements },
      { id: membreId },
      { voirTout, appels: voirAppels },
    ).filter((n) => !envoyees.current.has(`${membreId}:${n.id}`));
    if (!aMarquer.length) return;
    for (const n of aMarquer) envoyees.current.add(`${membreId}:${n.id}`);
    void (async () => {
      for (const n of aMarquer) {
        try {
          await repo().marquerLue(n.id);
        } catch {
          // Confort : rien à montrer.
        }
      }
    })();
  }, [notifications, interventions, appels, evenements, membreId, voirTout, voirAppels]);
}
