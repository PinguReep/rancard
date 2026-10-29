/**
 * Vérification anti-robot de « Créer un compte » (Cloudflare Turnstile),
 * partagée par les deux variantes du widget : `VerificationHumaine.tsx`
 * (iOS, Android : page dans une WebView, servie sous https://rencar.fr/
 * pour que le domaine corresponde au widget) et `VerificationHumaine.web.tsx`
 * (script injecté dans la page).
 *
 * Le widget est en apparence « interaction-only » : invisible (hauteur
 * nulle) tant que Cloudflare ne demande rien, il apparaît dans le formulaire
 * quand une interaction est nécessaire. Le jeton vaut 5 minutes et ne sert
 * qu'une fois : Turnstile le renouvelle seul à l'expiration, et l'écran
 * relance le widget après chaque envoi. La fonction `inscription` le fait
 * valider par Cloudflare (`supabase/functions/_partage/turnstile.ts`).
 *
 * Clé de site publique : EXPO_PUBLIC_TURNSTILE_SITEKEY. En démonstration
 * (backend « demo »), ou sans clé, aucun widget et rien n'est envoyé.
 */

import { useCallback, useRef, useState, type Ref } from 'react';

import { BACKEND } from '@/data';

/** Clé de site du widget Turnstile (publique, lisible dans le build). */
export const CLE_SITE_TURNSTILE = (process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY ?? '').trim();
/** Action du widget, contrôlée par la fonction `inscription`. */
export const ACTION_TURNSTILE = 'inscription';
/** Script de Cloudflare, à charger depuis cette adresse exacte (jamais copié ni mis en cache ailleurs). */
export const URL_SCRIPT_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Adresse sous laquelle l'app native sert la page du widget : un domaine déclaré sur le widget. */
export const ORIGINE_WIDGET = 'https://rencar.fr/';
/** Hauteur du widget quand Cloudflare demande une interaction (65 px, plus une marge). */
export const HAUTEUR_WIDGET = 70;

/** Le widget sert-il ? Non en démonstration, ni sans clé de site. */
export function verificationHumaineActive(): boolean {
  return BACKEND === 'supabase' && CLE_SITE_TURNSTILE.length > 0;
}

/** Pourquoi le widget n'a pas produit de jeton. */
export type EchecVerification = 'erreur' | 'delai' | 'non_pris_en_charge' | 'chargement';

/** Ce que la page du widget signale (les deux variantes parlent la même langue). */
export type EvenementTurnstile =
  | { type: 'pret' }
  | { type: 'jeton'; jeton: string }
  | { type: 'expire' }
  | { type: 'erreur'; code?: string }
  | { type: 'delai' }
  | { type: 'interaction'; visible: boolean }
  | { type: 'non_pris_en_charge' }
  | { type: 'chargement' };

export type PoigneeVerification = {
  /** Demande un nouveau jeton (après un envoi, un refus ou une erreur). */
  relancer(): void;
};

export type PropsVerification = {
  /** Jeton prêt, ou null quand il n'y en a plus (expiré, relancé). */
  onJeton(jeton: string | null): void;
  /** Le widget n'a pas pu produire de jeton : l'écran propose « Réessayer ». */
  onEchec(raison: EchecVerification): void;
  /** Cloudflare demande (true) ou ne demande plus (false) une interaction. */
  onInteraction?(visible: boolean): void;
  ref?: Ref<PoigneeVerification>;
};

/**
 * Options du widget, communes aux deux variantes (les rappels s'ajoutent
 * dans chacune). `auto` : le widget suit le thème du navigateur.
 */
export function optionsWidget(theme: 'light' | 'dark' | 'auto') {
  return {
    sitekey: CLE_SITE_TURNSTILE,
    action: ACTION_TURNSTILE,
    theme,
    language: 'fr',
    appearance: 'interaction-only',
    size: 'flexible',
    'refresh-expired': 'auto',
    'refresh-timeout': 'auto',
    retry: 'auto',
    'response-field': false,
  } as const;
}

/**
 * Traduit les évènements du widget pour l'écran, et dit s'il faut le
 * montrer. Les rappels de l'écran sont lus au moment de l'évènement : un
 * rendu de l'écran ne recharge jamais le widget.
 */
export function useEvenementsTurnstile({ onJeton, onEchec, onInteraction }: PropsVerification) {
  const [visible, setVisible] = useState(false);
  const rappels = useRef({ onJeton, onEchec, onInteraction });
  rappels.current = { onJeton, onEchec, onInteraction };

  const montrer = useCallback((v: boolean) => {
    setVisible(v);
    rappels.current.onInteraction?.(v);
  }, []);

  const traiter = useCallback(
    (e: EvenementTurnstile) => {
      const r = rappels.current;
      switch (e.type) {
        case 'jeton':
          montrer(false);
          r.onJeton(e.jeton);
          break;
        case 'expire':
          // Turnstile en redemande un seul (refresh-expired) : l'envoi attend le suivant.
          r.onJeton(null);
          break;
        case 'interaction':
          // La fin de l'interaction ne cache rien : le jeton (ou l'erreur) suit et range le widget.
          if (e.visible) montrer(true);
          break;
        case 'delai':
          // Interaction non faite à temps : Turnstile relance la case lui-même.
          r.onJeton(null);
          r.onEchec('delai');
          break;
        case 'erreur':
        case 'non_pris_en_charge':
        case 'chargement':
          montrer(false);
          r.onJeton(null);
          r.onEchec(e.type);
          break;
        case 'pret':
          break;
      }
    },
    [montrer],
  );

  return { visible, traiter, montrer };
}
