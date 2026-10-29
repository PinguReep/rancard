/**
 * Erreurs propres au contrat Repo, communes aux deux implémentations.
 */

import type { Intervention } from '@/domain/types';

import { MESSAGE_ACCES_SUSPENDU } from './repo';

/** Phrase d’un compte authentifié qui n’ouvre ni garage ni demande d’inscription. */
export const MESSAGE_SANS_GARAGE = 'Ce compte n’est rattaché à aucun garage actif.';

/**
 * Session refusée à l’ouverture ou à la reprise : accès coupé par le gérant
 * (`suspendu`, phrase `MESSAGE_ACCES_SUSPENDU`), sinon compte sans garage
 * actif ni demande en attente (demande refusée ou supprimée entre-temps,
 * membre retiré). La session locale est déjà refermée.
 */
export class AccesRefuse extends Error {
  readonly suspendu: boolean;

  constructor(suspendu: boolean) {
    super(suspendu ? MESSAGE_ACCES_SUSPENDU : MESSAGE_SANS_GARAGE);
    this.name = 'AccesRefuse';
    this.suspendu = suspendu;
  }
}

/**
 * `creerIntervention` avec `dejaAuGarage` : la fiche est créée (première
 * écriture) mais son passage en « Véhicule reçu » (seconde écriture) a
 * échoué. L’écran retrouve la fiche dans `intervention` et dit « Ajouté,
 * mais pas encore réceptionné » ; `origine` porte le refus du serveur.
 */
export class ReceptionEchouee extends Error {
  readonly intervention: Intervention;
  readonly origine: Error;

  constructor(intervention: Intervention, cause: unknown) {
    const c = cause instanceof Error ? cause : new Error(String(cause));
    super(`Ajouté, mais pas encore réceptionné : ${c.message}`);
    this.name = 'ReceptionEchouee';
    this.intervention = intervention;
    this.origine = c;
  }
}
