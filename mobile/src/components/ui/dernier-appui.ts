/**
 * Dernier appui sur l’écran (hauteur et instant), pour poser un avis à
 * bouton loin du doigt (relecture du 29 octobre). Sur le planning, les
 * boutons de geste des cartes sont alignés à droite, comme le bouton
 * « Annuler » d’un avis : posé là où le doigt va faire le geste suivant, il
 * défaisait le geste précédent. L’avis à bouton se pose donc en haut de
 * l’écran, sauf si l’appui qui vient de le produire y était : il se pose
 * alors en bas.
 *
 * Natif : `onTouchStart` de la racine (_layout.tsx), où remontent tous les
 * appuis, feuilles comprises. Web : écouteur `pointerdown` du document
 * (souris et toucher). Un confort : sans appui connu, l’avis va en haut.
 */

import { Dimensions, Platform } from 'react-native';

/** Au-delà, l’appui n’est plus celui du geste qui produit l’avis. */
const APPUI_RECENT_MS = 4000;

let dernier: { y: number; t: number } | null = null;

const instant = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** Note un appui à la hauteur `y` (coordonnée de la fenêtre). */
export function noterAppui(y: number): void {
  if (Number.isFinite(y)) dernier = { y, t: instant() };
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => noterAppui(e.clientY), { capture: true, passive: true });
}

/** Côté où poser un avis à bouton : en haut, sauf si le dernier appui récent était dans le haut de l’écran. */
export function coteLoinDuDoigt(): 'haut' | 'bas' {
  if (!dernier || instant() - dernier.t > APPUI_RECENT_MS) return 'haut';
  return dernier.y < Dimensions.get('window').height / 3 ? 'bas' : 'haut';
}
