/**
 * État de la sonnerie sur ce téléphone : inscription (« Recevoir les
 * appels »), appel qui sonne, appel en ligne. Un store zustand à part : ce
 * n'est pas une donnée du garage, mais l'état de cet appareil. Écrit par les
 * moteurs (Twilio en natif, simulateur en démonstration), lu par l'écran
 * d'appel, la carte en direct et le profil.
 */

import { create } from 'zustand';

/** Un appel qui sonne sur ce téléphone. */
export type AppelEntrant = {
  /** Identifiant du moteur (CallSid chez Twilio) */
  id: string;
  /** Ligne `appels` du garage (paramètre `appel` du TwiML), null pour un essai */
  appelId: string | null;
  /** Nom affiché (prénom et véhicule, jamais le nom de famille ni la plaque) */
  nom: string;
  essai: boolean;
};

export type EtatLigne = 'connexion' | 'en_ligne' | 'reconnexion' | 'termine';

/** L'appel décroché sur ce téléphone. */
export type AppelActif = {
  id: string;
  appelId: string | null;
  nom: string;
  essai: boolean;
  etat: EtatLigne;
  /** Début de la conversation (ms), null tant que la voix n'est pas établie */
  debut: number | null;
  microCoupe: boolean;
  hautParleur: boolean;
};

/**
 * - indisponible : pas de sonnerie possible ici (navigateur, module absent, option ou permission)
 * - inconnue     : pas encore relue
 * - inactive     : ce téléphone ne sonne pas
 * - en_cours     : inscription ou désinscription en cours
 * - active       : ce téléphone sonne pour le membre
 * - erreur       : la dernière opération a échoué (message)
 */
export type Inscription = 'indisponible' | 'inconnue' | 'inactive' | 'en_cours' | 'active' | 'erreur';

type EtatSonnerie = {
  inscription: Inscription;
  /** Message d'erreur ou d'aide, en français, prêt à afficher */
  message: string | null;
  entrant: AppelEntrant | null;
  actif: AppelActif | null;
};

export const useTelephone = create<EtatSonnerie>(() => ({
  inscription: 'inconnue',
  message: null,
  entrant: null,
  actif: null,
}));

export function majTelephone(p: Partial<EtatSonnerie>): void {
  useTelephone.setState(p);
}

export function majActif(p: Partial<AppelActif>): void {
  const a = useTelephone.getState().actif;
  if (a) useTelephone.setState({ actif: { ...a, ...p } });
}
