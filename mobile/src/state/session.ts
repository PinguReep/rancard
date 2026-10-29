/**
 * État global : session (membre + garage) et instantané des données.
 *
 * Un seul store zustand. Les écrans lisent avec des sélecteurs
 * (`useDonnees(s => s.interventions)`) et écrivent via `repo()`, jamais
 * directement dans le store : la couche de données notifie le store.
 *
 * Un compte créé par « Créer un compte » et pas encore validé par Rencar
 * n'a pas de session : `demande` le tient, et la racine montre l'écran
 * d'attente au lieu du garage.
 */

import { create } from 'zustand';

import { AdresseNonConfirmee, BACKEND_BUILD, choisirBackend, demoLocale, repo, restaurerBackend, type NouvelleInscription } from '@/data';
import { AccesRefuse } from '@/data/erreurs';
import type { Snapshot } from '@/data/repo';
import { permissionsDe } from '@/domain/permissions';
import { quitterSonnerie } from '@/lib/sonnerie';
import type { Acces, DemandeInscription, Membre, Permissions, Session } from '@/domain/types';

type EtatSession = {
  /** undefined = pas encore su, null = déconnecté (ou demande en attente) */
  session: Session | null | undefined;
  /** Demande d'inscription en attente de validation (écran d'attente), sinon null */
  demande: DemandeInscription | null;
  donnees: Snapshot | null;
  erreur: string | null;
  /** Information calme pour l'écran de connexion (demande qui n'existe plus…) */
  avis: string | null;
  demarrer(): Promise<void>;
  connecter(email: string, motDePasse: string): Promise<void>;
  /** Invitation : code de l'e-mail, puis mot de passe choisi. */
  activer(email: string, code: string, motDePasse: string): Promise<void>;
  /** Mot de passe oublié : code de l'e-mail, puis nouveau mot de passe. */
  reinitialiser(email: string, code: string, motDePasse: string): Promise<void>;
  /** « Créer un compte » : le code de confirmation part par e-mail. */
  inscrire(n: NouvelleInscription): Promise<{ codeEnvoye: boolean }>;
  /**
   * Code reçu après l'inscription : ouvre l'écran d'attente. Le mot de passe
   * est celui saisi à l'inscription (gardé en mémoire), ou `motDePasse` quand
   * l'écran a dû le redemander (`motDePasseInscriptionConnu`).
   */
  confirmerInscription(email: string, code: string, motDePasse?: string): Promise<void>;
  renvoyerCodeInscription(email: string): Promise<void>;
  /** Écran d'attente : la demande a-t-elle été validée (ou refusée) ? */
  actualiserDemande(): Promise<void>;
  /** Écran d'attente : supprime le compte et la demande, puis revient à la connexion. */
  supprimerDemande(): Promise<void>;
  connecterDemo(): Promise<void>;
  deconnecter(): Promise<void>;
  /** Recharge tout le garage (« tirer pour actualiser »). */
  rafraichir(): Promise<void>;
};

let desabonner: (() => void) | null = null;

/**
 * Mot de passe choisi à « Créer un compte » (ou saisi à la connexion d'un
 * compte pas encore confirmé), gardé en mémoire seulement, jamais écrit ni
 * passé dans une adresse, jusqu'à la saisie du code : le compte naît avec un
 * mot de passe aléatoire, celui-ci le remplace une fois l'adresse prouvée.
 */
let inscriptionEnCours: { email: string; motDePasse: string } | null = null;

/** L'écran de confirmation doit-il redemander le mot de passe ? (app relancée entre-temps) */
export function motDePasseInscriptionConnu(email: string): boolean {
  return inscriptionEnCours?.email === email.trim().toLowerCase();
}

type Poser = (p: Partial<EtatSession>) => void;

async function ouvrir(session: Session, set: Poser) {
  const r = repo();
  const donnees = await r.charger();
  desabonner?.();
  desabonner = r.abonner((s) => set({ donnees: s }));
  set({ session, demande: null, donnees, erreur: null, avis: null });
}

async function ouvrirAcces(acces: Acces, set: Poser) {
  if (acces.type === 'session') await ouvrir(acces.session, set);
  else set({ session: null, demande: acces.demande, donnees: null, erreur: null, avis: null });
}

export const useSession = create<EtatSession>((set, get) => ({
  session: undefined,
  demande: null,
  donnees: null,
  erreur: null,
  avis: null,

  async demarrer() {
    try {
      await restaurerBackend();
      const acces = await repo().sessionCourante();
      if (acces) await ouvrirAcces(acces, set);
      else {
        // Démonstration locale refermée entre-temps : retour à la connexion réelle.
        if (demoLocale()) await choisirBackend(BACKEND_BUILD);
        set({ session: null });
      }
    } catch (e) {
      // Session refusée (accès coupé) pendant une démonstration locale : la connexion revient au serveur du build.
      if (demoLocale()) await choisirBackend(BACKEND_BUILD).catch(() => undefined);
      set({ session: null, erreur: (e as Error).message });
    }
  },

  async connecter(email, motDePasse) {
    try {
      await ouvrirAcces(await repo().connecter({ email, motDePasse }), set);
    } catch (e) {
      // Compte pas encore confirmé, mot de passe exact : l'écran du code le reposera après la preuve.
      if (e instanceof AdresseNonConfirmee) inscriptionEnCours = { email: e.email, motDePasse };
      throw e;
    }
  },

  async rafraichir() {
    const donnees = await repo().charger();
    set({ donnees });
  },

  async activer(email, code, motDePasse) {
    await ouvrirAcces(await repo().activerCompte(email, code, motDePasse), set);
  },

  async reinitialiser(email, code, motDePasse) {
    await ouvrirAcces(await repo().reinitialiserMotDePasse(email, code, motDePasse), set);
  },

  async inscrire(n) {
    const r = await repo().inscrire(n);
    inscriptionEnCours = { email: n.email.trim().toLowerCase(), motDePasse: n.motDePasse };
    return r;
  },

  async confirmerInscription(email, code, motDePasse) {
    const adresse = email.trim().toLowerCase();
    const mdp = motDePasse || (inscriptionEnCours?.email === adresse ? inscriptionEnCours.motDePasse : '');
    if (!mdp) throw new Error('Choisissez votre mot de passe.');
    await ouvrirAcces(await repo().confirmerInscription(adresse, code, mdp), set);
    inscriptionEnCours = null;
  },

  renvoyerCodeInscription(email) {
    return repo().renvoyerCodeInscription(email);
  },

  async actualiserDemande() {
    if (!get().demande) return;
    let acces: Acces | null;
    try {
      acces = await repo().sessionCourante();
    } catch (e) {
      // Refus du serveur (session déjà refermée) : la demande n'est plus là. Une autre erreur (réseau) remonte.
      if (!(e instanceof AccesRefuse)) throw e;
      acces = null;
    }
    if (acces) {
      await ouvrirAcces(acces, set);
      return;
    }
    // Demande refusée ou supprimée entre-temps : le compte n'existe plus.
    await repo().deconnecter();
    set({ session: null, demande: null, donnees: null, avis: 'Cette demande n’est plus en attente. Connectez-vous ou créez un nouveau compte.' });
  },

  async supprimerDemande() {
    await repo().supprimerMonCompte();
    await repo().deconnecter();
    set({ session: null, demande: null, donnees: null, avis: 'Votre demande a été supprimée.' });
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
    // Sonnerie (0016) : ce téléphone ne sonne plus pour ce compte, tant que la session permet de le dire au serveur.
    await quitterSonnerie();
    await repo().deconnecter();
    desabonner?.();
    desabonner = null;
    // Quitter la démonstration locale ramène au backend du build (écran de connexion réelle).
    if (demoLocale()) await choisirBackend(BACKEND_BUILD);
    inscriptionEnCours = null;
    set({ session: null, demande: null, donnees: null });
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
