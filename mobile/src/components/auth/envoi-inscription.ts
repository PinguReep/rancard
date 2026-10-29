/**
 * Automate de l'envoi de « Créer un compte » avec la vérification anti-robot
 * (Cloudflare Turnstile) : quand envoyer, avec quel jeton, quand relancer le
 * widget, quel échec montrer et combien de temps. Pur et sans dépendance
 * (testé par `scripts/envoi-inscription.test.mjs`) : l'écran garde l'état
 * dans une ref, applique chaque évènement et exécute les effets rendus.
 *
 * Règles :
 * - un seul envoi à la fois : tant qu'une réponse est attendue, tout appui
 *   est ignoré (le verrou est posé avant le rendu suivant) ;
 * - l'appui sur « Créer mon compte » part avec le jeton prêt, sinon attend
 *   le prochain, qui part seul ; un jeton ne sert qu'une fois ;
 * - un échec du widget s'efface au jeton suivant (et l'envoi demandé
 *   repart) ; un refus du serveur reste affiché jusqu'au geste suivant ;
 * - le serveur reste juge : si le widget ne marche pas sur l'appareil (non
 *   pris en charge, ou plusieurs pannes), l'envoi part sans jeton, et la
 *   fonction l'accepte tant que la vérification n'est pas posée ;
 * - après plusieurs échecs, ou un envoi sans jeton refusé, l'écran invite
 *   à écrire à l'assistance.
 */

/** Pourquoi le widget n'a pas donné de jeton ; `silence` : rien reçu longtemps après l'appui. */
export type PanneWidget = 'erreur' | 'delai' | 'non_pris_en_charge' | 'chargement' | 'silence';

/** Refus de la fonction `inscription` (codes `verification_*`). */
export type RefusServeur = 'refusee' | 'absente' | 'indisponible';

export type EchecEnvoi = {
  message: string;
  /** `widget` : effacé par le jeton suivant ; `serveur` : gardé jusqu'au geste suivant. */
  origine: 'widget' | 'serveur';
};

export type EtatEnvoi = {
  /** Vérification active (backend Supabase et clé de site présente). */
  active: boolean;
  /** Jeton prêt, pas encore envoyé. */
  jeton: string | null;
  /** L'envoi a été demandé et attend un jeton. */
  voulu: boolean;
  /** Un envoi est parti : réponse attendue. */
  enCours: boolean;
  echec: EchecEnvoi | null;
  /** Vérifications manquées (widget ou serveur). */
  echecs: number;
  /** Pannes du widget lui-même (le délai de la case non cochée n'en est pas une). */
  pannes: number;
  /** Le widget ne marche pas ici : l'envoi part sans jeton, le serveur décide. */
  sansJeton: boolean;
  /** Le widget est en panne : la prochaine demande le relance. */
  widgetEnPanne: boolean;
  /** Le dernier jeton a servi (envoi réussi) : la prochaine demande en redemande un. */
  jetonServi: boolean;
  /** Un envoi sans jeton a été refusé : seule l'assistance peut ouvrir le compte. */
  assistanceForcee: boolean;
};

export type Evenement =
  /** « Créer mon compte » (ou « Réessayer » après un refus du serveur), formulaire valide. */
  | { type: 'demande' }
  /** « Réessayer » après une panne du widget. */
  | { type: 'reessayer' }
  | { type: 'jeton'; jeton: string | null }
  | { type: 'panne'; raison: PanneWidget }
  | { type: 'succes' }
  | { type: 'refus'; raison: RefusServeur; message: string }
  /** Autre erreur (réseau, champ refusé, limite) : l'écran l'affiche lui-même. */
  | { type: 'erreur' }
  /** Le formulaire n'était plus valide au moment de partir : rien n'est parti, le jeton reste. */
  | { type: 'invalide'; jeton: string | null };

export type Effet = { type: 'envoyer'; jeton: string | null } | { type: 'relancer' };

/** Échecs avant d'inviter à écrire à l'assistance. */
export const ECHECS_AVANT_ASSISTANCE = 3;
/** Pannes du widget avant d'envoyer sans jeton. */
export const PANNES_AVANT_ENVOI_SANS_JETON = 3;

export const MESSAGES_PANNE: Record<PanneWidget, string> = {
  erreur: 'La vérification anti-robot n’a pas abouti.',
  delai: 'La vérification a expiré. Cochez la case pour continuer.',
  silence: 'La vérification a pris trop de temps.',
  non_pris_en_charge: 'La vérification anti-robot ne fonctionne pas sur cet appareil.',
  chargement: 'La vérification anti-robot ne se charge pas. Vérifiez la connexion.',
};

/** Envoi sans jeton refusé (le widget ne marche pas ici et le serveur exige la vérification). */
export const MESSAGE_SANS_JETON_REFUSE =
  'La vérification anti-robot ne fonctionne pas sur cet appareil. Écrivez-nous pour ouvrir votre compte.';

export function etatInitial(active: boolean): EtatEnvoi {
  return {
    active,
    jeton: null,
    voulu: false,
    enCours: false,
    echec: null,
    echecs: 0,
    pannes: 0,
    sansJeton: false,
    widgetEnPanne: false,
    jetonServi: false,
    assistanceForcee: false,
  };
}

type Transition = { etat: EtatEnvoi; effets: Effet[] };

const rien = (etat: EtatEnvoi): Transition => ({ etat, effets: [] });

/** L'envoi part : verrou posé, jeton consommé, échec effacé. */
function partir(etat: EtatEnvoi, jeton: string | null): Transition {
  return {
    etat: { ...etat, enCours: true, voulu: false, echec: null, jeton: jeton ? null : etat.jeton },
    effets: [{ type: 'envoyer', jeton }],
  };
}

/** Le widget en panne, ou dont le jeton a servi, est relancé ; l'échec du widget s'efface. */
function relancerSiBesoin(etat: EtatEnvoi): Transition {
  const relance = etat.widgetEnPanne || etat.jetonServi;
  return {
    etat: { ...etat, widgetEnPanne: false, jetonServi: false, echec: etat.echec?.origine === 'widget' ? null : etat.echec },
    effets: relance ? [{ type: 'relancer' }] : [],
  };
}

export function transition(etat: EtatEnvoi, ev: Evenement): Transition {
  switch (ev.type) {
    case 'demande': {
      if (etat.enCours) return rien(etat);
      if (!etat.active) return partir(etat, null);
      const e = { ...etat, echec: null };
      if (e.jeton) return partir(e, e.jeton);
      if (e.sansJeton) return partir(e, null);
      const r = relancerSiBesoin(e);
      return { etat: { ...r.etat, voulu: true }, effets: r.effets };
    }

    case 'reessayer':
      if (etat.enCours) return rien(etat);
      return relancerSiBesoin(etat);

    case 'jeton': {
      if (!ev.jeton) return rien({ ...etat, jeton: null });
      const e: EtatEnvoi = {
        ...etat,
        jeton: ev.jeton,
        widgetEnPanne: false,
        jetonServi: false,
        echec: etat.echec?.origine === 'widget' ? null : etat.echec,
      };
      if (e.voulu && !e.enCours && !e.echec) return partir(e, ev.jeton);
      return rien(e);
    }

    case 'panne': {
      const pannes = etat.pannes + (ev.raison === 'delai' ? 0 : 1);
      const e: EtatEnvoi = {
        ...etat,
        jeton: null,
        pannes,
        sansJeton: etat.sansJeton || ev.raison === 'non_pris_en_charge' || pannes >= PANNES_AVANT_ENVOI_SANS_JETON,
        widgetEnPanne: true,
        echecs: etat.echecs + 1,
        // Un refus du serveur affiché reste : il attend un geste, pas le widget.
        echec: etat.echec?.origine === 'serveur' ? etat.echec : { message: MESSAGES_PANNE[ev.raison], origine: 'widget' },
      };
      if (e.sansJeton && e.voulu && !e.enCours) return partir(e, null);
      return rien(e);
    }

    case 'succes':
      return rien({ ...etat, enCours: false, voulu: false, echec: null, jetonServi: true });

    case 'refus': {
      const e: EtatEnvoi = {
        ...etat,
        enCours: false,
        voulu: false,
        echecs: etat.echecs + 1,
        assistanceForcee: etat.assistanceForcee || ev.raison === 'absente',
        echec: { message: ev.raison === 'absente' ? MESSAGE_SANS_JETON_REFUSE : ev.message, origine: 'serveur' },
      };
      // Le jeton envoyé a servi (ou n'existait pas) : le suivant se prépare dès maintenant, sauf si le widget ne marche pas ici.
      if (!e.active || e.sansJeton) return rien(e);
      return { etat: { ...e, widgetEnPanne: false, jetonServi: false }, effets: [{ type: 'relancer' }] };
    }

    case 'erreur': {
      const e: EtatEnvoi = { ...etat, enCours: false, voulu: false };
      if (!e.active || e.sansJeton) return rien(e);
      return { etat: { ...e, widgetEnPanne: false, jetonServi: false }, effets: [{ type: 'relancer' }] };
    }

    case 'invalide':
      return rien({ ...etat, enCours: false, voulu: false, jeton: etat.jeton ?? ev.jeton });
  }
}

/** Ce que l'écran montre. */
export function affichage(etat: EtatEnvoi) {
  return {
    /** « Vérification en cours… » : l'envoi attend le jeton, sans échec affiché. */
    attente: etat.active && etat.voulu && !etat.jeton && !etat.echec && !etat.enCours,
    assistance: etat.echecs >= ECHECS_AVANT_ASSISTANCE || etat.assistanceForcee,
  };
}
