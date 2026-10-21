/**
 * Point d'entrée de la couche de données : choisit l'implémentation selon
 * EXPO_PUBLIC_BACKEND (« demo » par défaut).
 */

import type { Backend, Repo } from './repo';
import { DemoRepo } from './demo/repo';

export const BACKEND: Backend = process.env.EXPO_PUBLIC_BACKEND === 'supabase' ? 'supabase' : 'demo';

let instance: Repo | null = null;

export function repo(): Repo {
  if (instance) return instance;
  if (BACKEND === 'supabase') {
    // Import différé : le client Supabase n'est chargé qu'en mode réseau.
    const { SupabaseRepo } = require('./supabase/repo') as typeof import('./supabase/repo');
    instance = new SupabaseRepo();
  } else {
    instance = new DemoRepo();
  }
  return instance;
}

export type { Repo, Snapshot, NouvelleIntervention, NouveauMembre } from './repo';
