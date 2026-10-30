/**
 * Messages des clients (« Répondre au garage » sur la page de suivi, 0020).
 *
 * Le client écrit depuis sa page ; l’équipe lui répond par une note
 * visible client, qu’il lit juste dessous sur la même page. Un message
 * attend donc une réponse tant qu’aucune note visible écrite par l’équipe
 * (ni phrase automatique, ni note retirée de la page) ne l’a suivi sur la
 * fiche. Fonctions pures, partagées par le fil, l’activité et la démo.
 */

import type { Commentaire, MessageClient } from './types';

const temps = (iso: string) => new Date(iso).getTime();

/** La note est-elle une réponse lisible du client, écrite par l’équipe ? */
function reponseDeLEquipe(c: Commentaire): boolean {
  return c.visibleClient && !c.automatique && !c.evenementId && !c.retireeLe;
}

/** Messages d’une fiche, du plus ancien au plus récent. */
export function messagesDe(messages: MessageClient[], interventionId: string): MessageClient[] {
  return messages.filter((m) => m.interventionId === interventionId).sort((a, b) => temps(a.creeLe) - temps(b.creeLe));
}

/** Dernier message de la fiche s’il attend encore une réponse, sinon null. */
export function messageARepondre(
  messages: MessageClient[],
  commentaires: Commentaire[],
  interventionId: string,
): MessageClient | null {
  const dernier = messagesDe(messages, interventionId).at(-1);
  if (!dernier) return null;
  const apres = temps(dernier.creeLe);
  const repondu = commentaires.some(
    (c) => c.interventionId === interventionId && reponseDeLEquipe(c) && temps(c.creeLe) > apres,
  );
  return repondu ? null : dernier;
}

/** Messages qui attendent une réponse, un par fiche, du plus récent au plus ancien. */
export function messagesARepondre(
  messages: MessageClient[],
  commentaires: Commentaire[],
  interventionIds: Iterable<string>,
): MessageClient[] {
  const sortie: MessageClient[] = [];
  for (const id of new Set(interventionIds)) {
    const m = messageARepondre(messages, commentaires, id);
    if (m) sortie.push(m);
  }
  return sortie.sort((a, b) => temps(b.creeLe) - temps(a.creeLe));
}

/** Extrait d’un message pour une ligne de liste : une ligne, 120 caractères au plus. */
export function extraitMessage(texte: string, max = 120): string {
  const plat = texte.replace(/\s+/g, ' ').trim();
  return plat.length > max ? `${plat.slice(0, max - 1).trimEnd()}…` : plat;
}
