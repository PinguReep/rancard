/**
 * Garde du double appui (v2c) : après chaque changement de statut, pose ou
 * levée d’un blocage, les boutons de geste (carte, barre, feuille
 * d’actions, pied « Confirmer ») et la liste du planning restent inertes
 * un instant. Le second appui d’un double appui, même lent, ne tombe ni
 * sur le geste suivant (« Livré » après « Prêt ») ni sur la carte d’une
 * autre voiture.
 *
 * Un seul mécanisme pour toute l’app : un petit store global, armé par
 * `passage-statut` et lu par les écrans (`useGardeActive`). La garde se
 * compte par minuteries, jamais par l’horloge : l’heure peut être figée
 * (tests au pilote), les minuteries tournent. Deux gardes qui se
 * chevauchent durent jusqu’à la fin de la plus tardive.
 */

import { create } from 'zustand';

/** Après tout changement de statut, de blocage ou levée. */
export const GARDE_MS = 1000;
/** Après un passage en « Véhicule prêt » (avec ou sans SMS) : le geste suivant serait « Livré ». */
export const GARDE_PRET_MS = 1200;

type EtatGarde = { active: boolean };

const useGarde = create<EtatGarde>(() => ({ active: false }));

/** Gardes en cours (minuteries ou gestes pas encore terminés). */
let enCours = 0;

function mettreAJour() {
  const active = enCours > 0;
  if (useGarde.getState().active !== active) useGarde.setState({ active });
}

/**
 * Rend la garde active tout de suite, jusqu’à l’appel de la fonction
 * rendue (appelée une seule fois). Sert pendant un geste en cours : de
 * l’appui à la fin de l’écriture, puis `armerGarde` prend le relais.
 */
export function prendreGarde(): () => void {
  enCours += 1;
  mettreAJour();
  let rendue = false;
  return () => {
    if (rendue) return;
    rendue = true;
    enCours = Math.max(0, enCours - 1);
    mettreAJour();
  };
}

/** Arme la garde pour `ms` millisecondes (sans raccourcir une garde plus longue déjà en cours). */
export function armerGarde(ms: number = GARDE_MS): void {
  const rendre = prendreGarde();
  setTimeout(rendre, ms);
}

/** Lecture immédiate, entre deux appuis plus rapides qu’un rendu. */
export function gardeActive(): boolean {
  return useGarde.getState().active;
}

/** Vrai pendant la garde ; l’écran est rendu de nouveau à sa fin. */
export function useGardeActive(): boolean {
  return useGarde((s) => s.active);
}
