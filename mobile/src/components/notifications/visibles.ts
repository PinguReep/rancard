/**
 * Notifications que le membre peut réellement ouvrir : les siennes et celles
 * du garage, mais seulement si la cible lui est visible (permission
 * « Voir tout le planning » pour une fiche d’autrui, « Voir les appels »
 * pour un appel). Partagé par la feuille et par le compteur de la cloche.
 *
 * Les notifications d’équipe (v2c : attribution, pièce, accord, rappel,
 * retour depuis « Prêt ») sont écrites une par destinataire (`membreId`) :
 * elles ne sont visibles que de lui, et seulement tant que la voiture lui
 * reste visible (une voiture confiée puis reprise ne laisse pas de
 * notification sans fiche à ouvrir).
 *
 * Les demandes à traiter au comptoir suivent la permission de leur type,
 * comme la politique de lecture de 0006 et le push (`PERMISSION_NOTIFICATION`) :
 * « Nouveau rendez-vous depuis le site » demande « Voir tout le planning »,
 * « Le réceptionniste a créé une fiche » demande « Voir les appels ». La
 * démo montrait au mécanicien celles de ses voitures, que Supabase ne lui
 * envoie pas : il apprend qu’une voiture lui est confiée par « Nouvelle
 * voiture pour vous ».
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
    if (n.type === 'rdv_site' && !p.voirTout) return false;
    if (n.type === 'ia' && !p.appels) return false;
    if (!n.cible) return true;
    if (n.cible.type === 'appel') return p.appels;
    if (p.voirTout) return true;
    const cible = n.cible.id;
    return s.interventions.some((i) => i.id === cible && i.membreId === membre.id);
  });
}
