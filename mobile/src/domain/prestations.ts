/**
 * Prestations à la carte (docs/09 § 1) : site internet avec prise de
 * rendez-vous, relances SMS, réceptionniste IA. Ce sont des droits réglés
 * par Rencar et stockés côté serveur (`garages.options`) ; l'app les lit,
 * ne les modifie jamais et ne vend rien.
 *
 * Règle d'affichage (App Store 3.1.3(f)) : la fonction d'une prestation non
 * souscrite reste visible, grisée, avec la phrase `NON_INCLUS`, sans prix,
 * sans bouton d'achat, sans invitation à contacter Rencar pour l'activer.
 */

import type { Garage } from './types';

export type Prestation = 'site' | 'sms' | 'receptionniste';

export const PRESTATIONS: Prestation[] = ['site', 'sms', 'receptionniste'];

export const LIBELLES_PRESTATION: Record<Prestation, string> = {
  site: 'Site internet',
  sms: 'Relances SMS',
  receptionniste: 'Réceptionniste IA',
};

/** Phrase neutre d'une fonction non souscrite. */
export const NON_INCLUS = 'Non inclus dans l’offre de votre garage.';

/** Phrase d'une prestation souscrite. */
export const INCLUS = 'Inclus dans l’offre de votre garage.';

/** La prestation est souscrite : seulement si elle vaut exactement true. */
export function aPrestation(garage: Pick<Garage, 'options'>, p: Prestation): boolean {
  return garage.options?.[p] === true;
}
