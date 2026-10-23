/**
 * État global : session (membre + garage) et instantané des données.
 *
 * Un seul store zustand. Les écrans lisent avec des sélecteurs
 * (`useDonnees(s => s.interventions)`) et écrivent via `repo()`, jamais
 * directement dans le store : la couche de données notifie le store.
 */

import { create } from 'zustand';

import { BACKEND_BUILD, choisirBackend, demoLocale, repo, restaurerBackend } from '@/data';
import type { Snapshot } from '@/data/repo';
import { permissionsDe } from '@/domain/permissions';
import type { Membre, Permissions, Session } from '@/domain/types';

type EtatSession = {
  /** undefined = pas encore su, null = déconnecté */
  session: Session | null | undefined;
  donnees: Snapshot | null;
  erreur: string | null;
  demarrer(): Promise<void>;
  connecter(email: string, motDePasse: string): Promise<void>;
  /** Invitation : code de l'e-mail, puis mot de passe choisi. */
  activer(email: string, code: string, motDePasse: string): Promise<void>;
  /** Mot de passe oublié : code de l'e-mail, puis nouveau mot de passe. */
  reinitialiser(email: string, code: string, motDePasse: string): Promise<void>;
  connecterDemo(): Promise<void>;
  deconnecter(): Promise<void>;
  /** Recharge tout le garage (« tirer pour actualiser »). */
  rafraichir(): Promise<void>;
};

let desabonner: (() => void) | null = null;

async function ouvrir(session: Session, set: (p: Partial<EtatSession>) => void) {
  const r = repo();
  const donnees = await r.charger();
  desabonner?.();
  desabonner = r.abonner((s) => set({ donnees: s }));
  set({ session, donnees, erreur: null });
}

export const useSession = create<EtatSession>((set) => ({
  session: undefined,
  donnees: null,
  erreur: null,

  async demarrer() {
    try {
      await restaurerBackend();
      const s = await repo().sessionCourante();
      if (s) await ouvrir(s, set);
      else {
        // Démonstration locale refermée entre-temps : retour à la connexion réelle.
        if (demoLocale()) await choisirBackend(BACKEND_BUILD);
        set({ session: null });
      }
    } catch (e) {
      set({ session: null, erreur: (e as Error).message });
    }
  },

  async connecter(email, motDePasse) {
    const s = await repo().connecter({ email, motDePasse });
    await ouvrir(s, set);
  },

  async rafraichir() {
    const donnees = await repo().charger();
    set({ donnees });
  },

  async activer(email, code, motDePasse) {
    const s = await repo().activerCompte(email, code, motDePasse);
    await ouvrir(s, set);
  },

  async reinitialiser(email, code, motDePasse) {
    const s = await repo().reinitialiserMotDePasse(email, code, motDePasse);
    await ouvrir(s, set);
  },

  async connecterDemo() {
    // Dans un build supabase, la démonstration est locale : jamais de connexion au projet.
    await choisirBackend('demo');
    try {
      const s = await repo().connecterDemo();
      await ouvrir(s, set);
    } catch (e) {
      if (demoLocale()) await choisirBackend(BACKEND_BUILD);
      throw e;
    }
  },

  async deconnecter() {
    await repo().deconnecter();
    desabonner?.();
    desabonner = null;
    // Quitter la démonstration locale ramène au backend du build (écran de connexion réelle).
    if (demoLocale()) await choisirBackend(BACKEND_BUILD);
    set({ session: null, donnees: null });
  },
}));

// ── Sélecteurs pratiques

/** Membre connecté. À n'utiliser que derrière la garde d'authentification. */
export function useMembre(): Membre {
  // Version « vivante » : suit les modifications du membre (prénom, permissions) dans l'instantané.
  const id = useSession((s) => s.session?.membre.id);
  const m = useSession((s) => s.donnees?.membres.find((x) => x.id === id) ?? s.session?.membre);
  if (!m) throw new Error('useMembre appelé sans session');
  return m;
}

export function usePermissions(): Permissions {
  const m = useMembre();
  return permissionsDe(m);
}

/** Instantané complet ; les écrans dérivent leurs listes avec useMemo. */
export function useDonnees<T>(selecteur: (s: Snapshot) => T): T {
  const d = useSession((s) => s.donnees);
  if (!d) throw new Error('useDonnees appelé avant le chargement');
  return selecteur(d);
}
