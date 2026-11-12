/**
 * Orientation de l’écran (iOS, Android) : l’app reste en portrait, sauf
 * l’onglet Planning quand il affiche une grille horaire. Tourné, le
 * téléphone y montre la semaine (`app/(tabs)/planning.tsx`).
 *
 * - Démarrage : greffon `expo-screen-orientation` (orientation initiale en
 *   portrait, app.json) puis `verrouillerPortrait()` dans `app/_layout.tsx`.
 * - Planning en grille, onglet au premier plan : `permettreRotation()` ;
 *   en le quittant (autre onglet, fiche, retour à la liste) :
 *   `verrouillerPortrait()`, qui remet le téléphone droit.
 * - Les feuilles (`components/ui/feuille.tsx`, une `Modal`) acceptent le
 *   paysage : iOS les borne au verrou en cours (le module répond à
 *   `supportedInterfaceOrientationsForWindow` avec ce verrou), elles ne
 *   tournent donc que sur la grille.
 * - `paysageGrille` : la grille est affichée en paysage. Les onglets s’y
 *   masquent (`components/app-tabs*.tsx`), la grille prend toute la hauteur.
 *
 * Rien ne s’exécute sur le web : la grille y passe en paysage d’après les
 * dimensions de la fenêtre seulement (aperçu à 812 × 375).
 */

import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';
import { create } from 'zustand';

type Etat = {
  /** La grille du planning est affichée en paysage : onglets masqués */
  paysageGrille: boolean;
};

export const useOrientation = create<Etat>(() => ({ paysageGrille: false }));

const NATIF = Platform.OS === 'ios' || Platform.OS === 'android';

/** Portrait seulement, à l’endroit (iOS refuse le portrait renversé sur les téléphones à encoche). */
export function verrouillerPortrait() {
  if (!NATIF) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/** Portrait et paysage : iOS tout sauf le portrait renversé, Android selon le réglage de rotation du téléphone. */
export function permettreRotation() {
  if (!NATIF) return;
  ScreenOrientation.unlockAsync().catch(() => {});
}

export function signalerPaysageGrille(paysage: boolean) {
  if (useOrientation.getState().paysageGrille !== paysage) useOrientation.setState({ paysageGrille: paysage });
}

/** Seuil de hauteur sous lequel une fenêtre plus large que haute est un téléphone couché. */
export const HAUTEUR_PAYSAGE_MAX = 520;

/** Téléphone couché (ou fenêtre web de 812 × 375) ; une fenêtre d’ordinateur, large et haute, n’en est pas un. */
export const estPaysage = (largeur: number, hauteur: number) => largeur > hauteur && hauteur < HAUTEUR_PAYSAGE_MAX;
