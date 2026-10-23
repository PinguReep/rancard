/**
 * Contrat de la couche de données. Deux implémentations :
 *   - `demo`     : tout vit sur le téléphone (zustand + AsyncStorage), avec
 *                  un garage de démonstration déjà rempli ;
 *   - `supabase` : Postgres + RLS + temps réel, même contrat.
 *
 * Les écrans ne parlent qu'à ce contrat, jamais à Supabase directement.
 * Toutes les méthodes sont asynchrones pour que le passage au réseau soit
 * transparent. `abonner` permet la mise à jour en direct.
 */

import type {
  Appel,
  Blocage,
  Client,
  Commentaire,
  Evenement,
  Garage,
  Intervention,
  Membre,
  Notification,
  Origine,
  Permissions,
  Poste,
  Role,
  Session,
  Statut,
  Vehicule,
} from '@/domain/types';

export type Identifiants = { email: string; motDePasse: string };

export type NouvelleIntervention = {
  client: { id: string } | { prenom: string; nom: string; telephone: string; email?: string };
  vehicule:
    | { id: string }
    | { plaque: string; marque: string; modele: string; version?: string; annee?: number; km?: number };
  prestation: string;
  demande?: string;
  debut: string;
  dureeMin: number;
  membreId: string | null;
  origine: Origine;
  prioritaire?: boolean;
  memo?: string;
  montantEstime?: number;
  /** true = arrive directement en « planifié » (comptoir), sinon « à valider » */
  confirmee: boolean;
};

export type NouveauMembre = {
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  poste: Poste;
  permissions: Permissions;
};

export type Snapshot = {
  garage: Garage;
  membres: Membre[];
  clients: Client[];
  vehicules: Vehicule[];
  interventions: Intervention[];
  commentaires: Commentaire[];
  evenements: Evenement[];
  appels: Appel[];
  notifications: Notification[];
};

/**
 * Qui consulte quelle fiche en ce moment : « client:<id> » ou
 * « intervention:<id> » → identifiants des membres. Présence en direct,
 * jamais stockée.
 */
export type Consultations = Record<string, string[]>;

export interface Repo {
  // ── Session
  sessionCourante(): Promise<Session | null>;
  connecter(id: Identifiants): Promise<Session>;
  /**
   * Connexion au garage de démonstration. Toujours locale : un build supabase
   * bascule d'abord vers DemoRepo (data/index.ts) et SupabaseRepo la refuse.
   */
  connecterDemo(): Promise<Session>;
  deconnecter(): Promise<void>;
  /** Envoie par e-mail un code à 6 chiffres pour choisir un nouveau mot de passe. */
  demanderReinitialisation(email: string): Promise<void>;
  /** Code reçu (mot de passe oublié), puis nouveau mot de passe : ouvre la session. */
  reinitialiserMotDePasse(email: string, code: string, motDePasse: string): Promise<Session>;
  /** Code de l'e-mail d'invitation, puis choix du mot de passe : ouvre la session. */
  activerCompte(email: string, code: string, motDePasse: string): Promise<Session>;
  changerMotDePasse(actuel: string, nouveau: string): Promise<void>;
  supprimerMonCompte(): Promise<void>;

  // ── Présence sur les fiches (« Simon consulte cette fiche »)
  /** Fiche affichée par ce membre ; null quand il la quitte. */
  signalerConsultation(fiche: string | null): void;
  /** Collègues présents, fiche par fiche, en direct. Retourne la fonction de désabonnement. */
  abonnerConsultations(cb: (c: Consultations) => void): () => void;

  // ── Lecture globale (le garage entier tient en mémoire : quelques Mo au plus)
  charger(): Promise<Snapshot>;
  /** Appelé à chaque changement, local ou distant. Retourne la fonction de désabonnement. */
  abonner(cb: (s: Snapshot) => void): () => void;

  // ── Interventions
  // Note : `auteurId` est informatif ; en mode supabase l'auteur est toujours
  // l'utilisateur connecté (RLS et triggers signent avec auth.uid()).
  creerIntervention(n: NouvelleIntervention, auteurId: string): Promise<Intervention>;
  changerStatut(id: string, vers: Statut, auteurId: string): Promise<void>;
  changerBlocage(id: string, vers: Blocage | null, auteurId: string): Promise<void>;
  affecter(id: string, membreId: string | null, auteurId: string): Promise<void>;
  modifierIntervention(
    id: string,
    patch: Partial<Pick<Intervention, 'prestation' | 'demande' | 'debut' | 'dureeMin' | 'restitutionPrevue' | 'memo' | 'prioritaire' | 'montantEstime'>>,
  ): Promise<void>;
  commenter(c: {
    interventionId: string;
    auteurId: string;
    texte: string;
    visibleClient: boolean;
    photos?: { uri: string; video?: boolean }[];
  }): Promise<Commentaire>;
  /** Enregistre l'envoi (réel ou simulé) du SMS « véhicule prêt » */
  envoyerSmsPret(interventionId: string, auteurId: string, texte: string): Promise<void>;

  // ── Clients et véhicules
  creerClient(c: Omit<Client, 'id' | 'garageId' | 'creeLe'>): Promise<Client>;
  modifierClient(id: string, patch: Partial<Omit<Client, 'id' | 'garageId'>>): Promise<void>;
  creerVehicule(v: Omit<Vehicule, 'id' | 'garageId' | 'origineDonnees'>): Promise<Vehicule>;
  modifierVehicule(id: string, patch: Partial<Omit<Vehicule, 'id' | 'garageId' | 'clientId'>>): Promise<void>;

  // ── Appels (option réceptionniste)
  validerAppel(appelId: string, auteurId: string): Promise<Intervention | null>;
  ignorerAppel(appelId: string): Promise<void>;
  /** Relie un appel « rappel demandé » à l'intervention créée depuis sa fiche */
  lierAppel(appelId: string, interventionId: string): Promise<void>;

  // ── Notifications
  marquerLue(id: string): Promise<void>;
  toutMarquerLu(membreId: string): Promise<void>;
  enregistrerJetonPush(membreId: string, jeton: string): Promise<void>;

  // ── Équipe et réglages (gérant)
  // Un membre renvoyé avec `invitationEnAttente` peut porter l'id de l'invitation
  // (pas encore d'utilisateur) ; `modifierMembre(id, { actif: false })` la révoque.
  inviterMembre(n: NouveauMembre): Promise<Membre>;
  modifierMembre(id: string, patch: Partial<Pick<Membre, 'prenom' | 'nom' | 'role' | 'poste' | 'permissions' | 'actif'>>): Promise<void>;
  modifierGarage(patch: Partial<Omit<Garage, 'id'>>): Promise<void>;
}

export type Backend = 'demo' | 'supabase';
