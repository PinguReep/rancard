/**
 * Point d'entrée de la couche de données : choisit l'implémentation.
 *
 * Le build fixe son backend par EXPO_PUBLIC_BACKEND (« demo » par défaut).
 * Un build « supabase » peut en plus ouvrir le garage de démonstration
 * LOCAL (DemoRepo, AsyncStorage, aucune connexion au serveur) : le bouton
 * « Essayer avec le garage de démonstration » bascule `BACKEND` vers
 * « demo », la déconnexion le ramène au backend du build, donc à l'écran de
 * connexion réelle. Le choix est mémorisé pour le prochain lancement.
 *
 * Aucun identifiant de démonstration n'existe dans le bundle : la démo d'un
 * build supabase ne parle jamais au projet.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend, Repo } from './repo';
import { DemoRepo } from './demo/repo';

/** Backend du build (EXPO_PUBLIC_BACKEND). */
export const BACKEND_BUILD: Backend = process.env.EXPO_PUBLIC_BACKEND === 'supabase' ? 'supabase' : 'demo';

/**
 * Backend en cours : celui du build, ou « demo » quand un build supabase
 * fait tourner la démonstration locale. Lu au rendu par les écrans (libellés
 * propres à la démo) ; ne change qu'entre deux sessions.
 */
export let BACKEND: Backend = BACKEND_BUILD;

const CLE_MODE = 'rencar.backend.v1';

const instances: Partial<Record<Backend, Repo>> = {};

function creer(b: Backend): Repo {
  if (b === 'supabase') {
    // Import différé : le client Supabase n'est chargé qu'en mode réseau.
    const { SupabaseRepo } = require('./supabase/repo') as typeof import('./supabase/repo');
    return new SupabaseRepo();
  }
  return new DemoRepo();
}

/** Implémentation du backend en cours (une instance par backend, créée à la demande). */
export function repo(): Repo {
  return (instances[BACKEND] ??= creer(BACKEND));
}

/** true quand un build supabase fait tourner la démonstration locale. */
export function demoLocale(): boolean {
  return BACKEND_BUILD === 'supabase' && BACKEND === 'demo';
}

/** Au démarrage : reprend la démonstration locale si elle était ouverte à la fermeture de l'app. */
export async function restaurerBackend(): Promise<void> {
  if (BACKEND_BUILD !== 'supabase') return;
  try {
    if ((await AsyncStorage.getItem(CLE_MODE)) === 'demo') BACKEND = 'demo';
  } catch {
    // stockage illisible : on reste sur le backend du build
  }
}

/**
 * Bascule entre la démonstration locale et le backend du build, hors
 * session ouverte. Un build démo n'a pas d'autre backend : sans effet.
 */
export async function choisirBackend(b: Backend): Promise<void> {
  if (BACKEND_BUILD !== 'supabase' || BACKEND === b) return;
  BACKEND = b;
  try {
    if (b === 'demo') await AsyncStorage.setItem(CLE_MODE, 'demo');
    else await AsyncStorage.removeItem(CLE_MODE);
  } catch {
    // non bloquant : au pire, le prochain lancement revient au backend du build
  }
}

export type { Repo, Snapshot, NouvelleIntervention, NouveauMembre, NouvelleInscription, RenvoiReceptionniste, TransfertPortable } from './repo';
export { AdresseNonConfirmee, VerificationHumaineRefusee } from './repo';
