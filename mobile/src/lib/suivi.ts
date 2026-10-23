/**
 * Page de suivi client : chaque intervention porte un jeton, et une page web
 * (hors application) montre au client les étapes visibles. L’adresse a la
 * même forme que celle servie par la fonction Edge `suivi` et par le SMS
 * envoyé côté serveur : `<base>?t=<jeton>`. La base vient de
 * EXPO_PUBLIC_SUIVI_URL (voir .env.example) ; à défaut, un espace réservé.
 */

import { Platform } from 'react-native';

import { numeroLien } from './format';

export const URL_SUIVI_BASE = (process.env.EXPO_PUBLIC_SUIVI_URL ?? 'https://suivi.rencar.example/suivi').replace(/\/+$/, '');

export const lienSuivi = (token: string) => `${URL_SUIVI_BASE}?t=${encodeURIComponent(token)}`;

/** Lien `sms:` avec corps prérempli (iOS sépare par « & », Android et web par « ? »). */
export function smsHref(tel: string, corps?: string): string {
  const numero = numeroLien(tel);
  if (!corps) return `sms:${numero}`;
  const separateur = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${numero}${separateur}body=${encodeURIComponent(corps)}`;
}

/** Texte du SMS qui envoie le lien de suivi au client. */
export function texteSmsSuivi(v: { prenom: string; garage: string; token: string }): string {
  return `Bonjour ${v.prenom}, suivez l’avancement de votre véhicule ici : ${lienSuivi(v.token)} · ${v.garage}`;
}
