/**
 * État global : session (membre + garage) et instantané des données.
 *
 * Un seul store zustand. Les écrans lisent avec des sélecteurs
 * (`useDonnees(s => s.interventions)`) et écrivent via `repo()`, jamais
 * directement dans le store : la couche de données notifie le store.
 */

import { create } from 'zustand';

import { repo } from '@/data';
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
  connecterDemo(): Promise<void>;
  deconnecter(): Promise<void>;
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
      const s = await repo().sessionCourante();
      if (s) await ouvrir(s, set);
      else set({ session: null });
    } catch (e) {
      set({ session: null, erreur: (e as Error).message });
    }
  },

  async connecter(email, motDePasse) {
    const s = await repo().connecter({ email, motDePasse });
    await ouvrir(s, set);
  },

  async connecterDemo() {
    const s = await repo().connecterDemo();
    await ouvrir(s, set);
  },

  async deconnecter() {
    await repo().deconnecter();
    desabonner?.();
    desabonner = null;
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
