/**
 * Navigateur : le SDK Twilio Voice n'a pas de version web. Aucun moteur ; le
 * mode démonstration utilise le simulateur. Version native : `twilio.native.ts`.
 */

import type { Moteur } from './moteur';

export function moteurTwilio(): Moteur | null {
  return null;
}
