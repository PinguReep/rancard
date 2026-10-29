/**
 * Dernier ajout fait par l'assistant ouvert depuis le planning. L'assistant
 * se ferme au lieu d'ouvrir la fiche (on enchaîne les dépôts sans
 * « Retour ») ; le planning, resté monté sous la modale, se place sur le
 * jour du créneau et montre l'avis « Ajouté · … » avec « Ouvrir ».
 */

import { create } from 'zustand';

import type { Intervention } from '@/domain/types';

export type Ajout = {
  intervention: Intervention;
  /** « Renault Kangoo III », lu par l'assistant (le véhicule peut être nouveau) */
  vehicule: string;
  /** « Le véhicule est déjà au garage » demandé mais le passage en « Véhicule reçu » a échoué */
  receptionEchouee?: boolean;
};

type EtatAjout = {
  dernier: Ajout | null;
  signaler: (a: Ajout) => void;
  /** Le planning a traité l'ajout : il ne se rejoue pas au prochain rendu. */
  oublier: () => void;
};

export const useAjout = create<EtatAjout>((set) => ({
  dernier: null,
  signaler: (a) => set({ dernier: a }),
  oublier: () => set({ dernier: null }),
}));

export const signalerAjout = (a: Ajout) => useAjout.getState().signaler(a);
