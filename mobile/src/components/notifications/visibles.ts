/**
 * Notifications que le membre peut réellement ouvrir : les siennes et celles
 * du garage, mais seulement si la cible lui est visible (permission
 * « Voir tout le planning » pour une fiche d’autrui, « Voir les appels »
 * pour un appel). Partagé par la feuille et par le compteur de la cloche.
 */

import type { Snapshot } from '@/data/repo';
import type { Membre, Notification, Permissions } from '@/domain/types';

export function notificationsVisibles(
  s: Pick<Snapshot, 'notifications' | 'interventions'>,
  membre: Pick<Membre, 'id'>,
  p: Pick<Permissions, 'voirTout' | 'appels'>,
): Notification[] {
  return s.notifications.filter((n) => {
    if (n.membreId !== null && n.membreId !== membre.id) return false;
    if (!n.cible) return true;
    if (n.cible.type === 'appel') return p.appels;
    if (p.voirTout) return true;
    const cible = n.cible.id;
    return s.interventions.some((i) => i.id === cible && i.membreId === membre.id);
  });
}
