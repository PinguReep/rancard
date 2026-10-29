/**
 * La sonnerie fait-elle partie de ce binaire ? Seulement dans « Rencar Test »
 * (APP_VARIANT=test, `extra.sonnerie` écrit par app.config.ts). Dans « Rencar »
 * (App Store, version 1), le module natif Twilio n’est pas lié : le SDK ne doit
 * jamais être chargé (il lèverait au chargement), et aucune entrée de la
 * sonnerie n’est montrée, démonstration comprise (règle Apple 2.1). Le reste
 * du réceptionniste (fiches, réécoute, renvoi d’appel) ne dépend pas de ce drapeau.
 *
 * Lu une fois : la valeur vient du manifeste embarqué (ou de celui de la mise
 * à jour, qui a la même empreinte, donc la même variante).
 */

import Constants from 'expo-constants';

export const SONNERIE_INCLUSE: boolean = Constants.expoConfig?.extra?.sonnerie === true;
