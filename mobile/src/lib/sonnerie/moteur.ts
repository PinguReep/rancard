/**
 * Contrat d'un moteur de sonnerie : Twilio Voice (iPhone, `twilio.native.ts`)
 * ou simulateur (démonstration, `simulateur.ts`). Les moteurs écrivent l'état
 * de l'appel dans `etat.ts` ; l'orchestration (`index.ts`) gère
 * l'inscription du téléphone et le lien avec le serveur.
 */

export interface Moteur {
  readonly nom: 'twilio' | 'simulateur';
  /** Prépare la réception au démarrage de l'app (PushKit et CallKit en natif), avant toute session. */
  demarrer(): Promise<void>;
  /** Inscrit ce téléphone auprès de Twilio avec le jeton d'accès du membre. */
  inscrire(jeton: string): Promise<void>;
  desinscrire(jeton: string): Promise<void>;
  /** Jeton PushKit de l'appareil (pour se réinscrire s'il change), null s'il n'est pas connu. */
  jetonAppareil(): Promise<string | null>;
  decrocher(): Promise<void>;
  refuser(): Promise<void>;
  raccrocher(): Promise<void>;
  couperMicro(coupe: boolean): Promise<void>;
  hautParleur(actif: boolean): Promise<void>;
}

/** Nom affiché d'un essai de la sonnerie (sans paramètre DisplayName). */
export const NOM_ESSAI = 'Essai de la sonnerie';
