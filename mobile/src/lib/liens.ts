/**
 * Pages publiques de Rencar (site rencar.fr, dossier `site/` du dépôt) et
 * adresse d’assistance. Les mêmes adresses figurent dans la fiche App Store
 * (`store.config.json`) : une page absente fait refuser l’app à l’examen,
 * elles doivent donc être en ligne avant tout build ou toute mise à jour qui
 * les affiche.
 *
 * Les liens s’ouvrent dans le navigateur intégré (Safari dans l’app) ; en cas
 * d’échec, dans le navigateur du téléphone.
 */

import { Linking, Platform } from 'react-native';

export const SITE = 'https://rencar.fr';
export const URL_CONFIDENTIALITE = `${SITE}/confidentialite`;
export const URL_ASSISTANCE = `${SITE}/assistance`;
export const URL_MENTIONS_LEGALES = `${SITE}/mentions-legales`;
export const EMAIL_ASSISTANCE = 'support@rencar.fr';

/** Ouvre une page publique de Rencar, sans jamais lever d’erreur. */
export async function ouvrirPage(url: string): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
      await WebBrowser.openBrowserAsync(url);
      return;
    } catch {
      // module natif absent : repli sur le navigateur du téléphone
    }
  }
  try {
    await Linking.openURL(url);
  } catch {
    // aucun navigateur disponible : rien à faire
  }
}
