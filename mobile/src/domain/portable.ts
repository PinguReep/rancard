/**
 * Transfert vers les portables (version 1, migration 0019) : quand le
 * réceptionniste passe un appel à l’équipe, Twilio compose le portable des
 * membres qui l’ont accepté, sur le réseau téléphonique classique (pas dans
 * l’app). Le membre entend une annonce et appuie sur 1 pour prendre l’appel ;
 * sans appui (messagerie vocale), sa branche raccroche.
 *
 * Seuls les portables français (06, 07) sont acceptés, en E.164 : jamais de
 * transfert vers un numéro surtaxé, un fixe ou l’étranger (fraude au
 * transfert). Même règle que `portable_francais()` (0019) et que la fonction
 * Edge (`_partage/twilio.ts`).
 */

/** Réglage du membre connecté : son numéro (E.164) et son accord. */
export type TransfertPortable = { numero: string | null; accepte: boolean };

/** Message de refus d’un numéro, identique à celui du serveur. */
export const MESSAGE_PORTABLE_INVALIDE = 'Saisissez un numéro de portable français, en 06 ou en 07.';

/** Accord demandé sans numéro (même message que le serveur). */
export const MESSAGE_PORTABLE_ABSENT = 'Saisissez votre numéro de portable.';

/** Portable français en E.164 (« +33639980011 ») à partir d’une saisie libre, ou null. */
export function portableFrancais(saisie: string | null | undefined): string | null {
  if (typeof saisie !== 'string') return null;
  let s = saisie.replace(/[\s  .()/-]/g, '');
  if (s.startsWith('0033')) s = `+${s.slice(2)}`;
  if (/^\+330[67]/.test(s)) s = `+33${s.slice(4)}`;
  if (/^0[67]\d{8}$/.test(s)) s = `+33${s.slice(1)}`;
  return /^\+33[67]\d{8}$/.test(s) ? s : null;
}

/** « 06 39 98 00 11 » pour l’affichage ; le numéro tel quel s’il n’est pas un portable français. */
export function portableAffiche(e164: string | null | undefined): string {
  const n = portableFrancais(e164);
  if (!n) return e164 ?? '';
  return `0${n.slice(3)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
}
