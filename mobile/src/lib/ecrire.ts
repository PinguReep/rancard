/**
 * Écriture « en arrière-plan » (interrupteur, attribution, mémo) : l’écran
 * n’attend pas la promesse, mais un échec (RLS, réseau) doit lui remonter
 * sous forme d’avis au lieu d’un rejet silencieux.
 */

export const MESSAGE_ECHEC = 'L’enregistrement n’a pas abouti. Réessayez.';

export function ecrire(promesse: Promise<unknown>, onErreur: (message: string) => void, message = MESSAGE_ECHEC): void {
  promesse.catch((e: unknown) => onErreur((e instanceof Error && e.message) || message));
}
