/**
 * Contrat de la couche de données. Deux implémentations :
 *   - `demo`     : tout vit sur le téléphone (zustand + AsyncStorage), avec
 *                  un garage de démonstration déjà rempli ;
 *   - `supabase` : Postgres + RLS + temps réel, même contrat.
 *
 * Les écrans ne parlent qu'à ce contrat, jamais à Supabase directement.
 * Toutes les méthodes sont asynchrones pour que le passage au réseau soit
 * transparent. `abonner` permet la mise à jour en direct.
 */

import type {
  Acces,
  Appel,
  Blocage,
  CanalAccord,
  CanalPrevenu,
  Client,
  Commentaire,
  EcouteAppel,
  DetailBlocage,
  Evenement,
  Garage,
  Intervention,
  Membre,
  MessageClient,
  MotifAnnulation,
  Notification,
  Origine,
  Permissions,
  Poste,
  Role,
  Session,
  Statut,
  Vehicule,
} from '@/domain/types';
import type { TransfertPortable } from '@/domain/portable';
import type { IntentionSms } from '@/lib/redaction';

export type { TransfertPortable } from '@/domain/portable';

export type Identifiants = { email: string; motDePasse: string };

/** « Créer un compte » : le demandeur et son garage. Le garage attend la validation de Rencar. */
export type NouvelleInscription = {
  email: string;
  motDePasse: string;
  prenom: string;
  nom: string;
  garage: { nom: string; adresse: string; telephone: string };
  /** Jeton de la vérification anti-robot (Cloudflare Turnstile) ; absent en démonstration. */
  verification?: string;
};

/**
 * Connexion refusée parce que l'adresse n'a pas encore été confirmée (code
 * reçu à l'inscription) : l'écran de connexion propose de la confirmer.
 */
export class AdresseNonConfirmee extends Error {
  constructor(readonly email: string) {
    super('Cette adresse n’a pas encore été confirmée.');
    this.name = 'AdresseNonConfirmee';
  }
}

/**
 * Inscription arrêtée par la vérification anti-robot de la fonction
 * `inscription` : jeton refusé (`refusee`), absent (`absente`, envoi sans
 * jeton) ou vérification injoignable (`indisponible`). L'écran garde le
 * message jusqu'au geste suivant et propose « Réessayer ».
 */
export class VerificationHumaineRefusee extends Error {
  readonly raison: 'refusee' | 'absente' | 'indisponible';
  constructor(message: string, raison: 'refusee' | 'absente' | 'indisponible' = 'refusee') {
    super(message);
    this.name = 'VerificationHumaineRefusee';
    this.raison = raison;
  }
}

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
  /** true = arrive directement en « planifié » (comptoir), sinon « à valider » */
  confirmee: boolean;
  /** Retour prévu saisi au dépôt */
  restitutionPrevue?: string;
  /** Kilométrage relevé au dépôt */
  kmDepot?: number;
  /** La voiture est déjà là : création puis réception (deux écritures) */
  dejaAuGarage?: boolean;
};

export type PatchIntervention = Partial<
  Pick<Intervention, 'prestation' | 'demande' | 'debut' | 'dureeMin' | 'memo' | 'prioritaire' | 'montantEstime'>
> & {
  /** null retire la valeur */
  restitutionPrevue?: string | null;
  detailBlocage?: DetailBlocage | null;
  kmDepot?: number | null;
};

export type ResultatAnnulation = { statut: Statut; blocage: Blocage | null; smsParti: boolean };

export type NouveauMembre = {
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  poste: Poste;
  permissions: Permissions;
};

/**
 * Accès coupé par le gérant : même phrase à la connexion et à la reprise
 * d’une session gardée (démo et Supabase). L’écran de connexion l’affiche
 * telle quelle.
 */
export const MESSAGE_ACCES_SUSPENDU = 'Votre accès a été suspendu. Contactez votre gérant.';

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
  /** Messages des clients écrits sur leur page de suivi (0020), en lecture seule */
  messagesClients: MessageClient[];
};

/**
 * Numéro Rencar du garage, vers lequel il renvoie sa ligne pour que l’agent
 * décroche (écran « Réceptionniste » du profil, 0017).
 */
export type RenvoiReceptionniste = {
  /** Numéro E.164 attribué par Rencar (« +33465710001 ») */
  numero: string;
  /** Début du dernier appel arrivé par le réseau sur ce numéro, ISO ; null s’il n’y en a pas */
  dernierAppelLe: string | null;
};

/**
 * Qui consulte quelle fiche en ce moment : « client:<id> » ou
 * « intervention:<id> » → identifiants des membres. Présence en direct,
 * jamais stockée.
 */
export type Consultations = Record<string, string[]>;

export interface Repo {
  // ── Session
  // Une connexion ouvre le garage (« session ») ou, pour un compte créé par
  // « Créer un compte » et pas encore validé par Rencar, l'écran d'attente
  // (« demande »).
  sessionCourante(): Promise<Acces | null>;
  /** Rejette avec AdresseNonConfirmee si le code d'inscription n'a pas été saisi. */
  connecter(id: Identifiants): Promise<Acces>;
  /**
   * Connexion au garage de démonstration. Toujours locale : un build supabase
   * bascule d'abord vers DemoRepo (data/index.ts) et SupabaseRepo la refuse.
   */
  connecterDemo(): Promise<Session>;
  deconnecter(): Promise<void>;
  /** Envoie par e-mail un code à 6 chiffres pour choisir un nouveau mot de passe. */
  demanderReinitialisation(email: string): Promise<void>;
  /** Code reçu (mot de passe oublié), puis nouveau mot de passe : ouvre la session. */
  reinitialiserMotDePasse(email: string, code: string, motDePasse: string): Promise<Acces>;
  /** Code de l'e-mail d'invitation, puis choix du mot de passe : ouvre la session. */
  activerCompte(email: string, code: string, motDePasse: string): Promise<Acces>;
  /**
   * « Créer un compte » : crée le compte et fait envoyer un code à 6 chiffres
   * par e-mail. `codeEnvoye` faux : le compte existe, le code est à redemander.
   */
  inscrire(n: NouvelleInscription): Promise<{ codeEnvoye: boolean }>;
  /**
   * Code reçu après l'inscription : confirme l'adresse, pose le mot de passe
   * choisi (le compte naît avec un mot de passe aléatoire) et ouvre l'écran
   * d'attente. Accepte aussi le code de réinitialisation envoyé à la place
   * quand l'adresse était déjà inscrite.
   */
  confirmerInscription(email: string, code: string, motDePasse: string): Promise<Acces>;
  /** Nouveau code de confirmation d'inscription. */
  renvoyerCodeInscription(email: string): Promise<void>;
  changerMotDePasse(actuel: string, nouveau: string): Promise<void>;
  /**
   * Supprime le compte connecté ; pour un compte en attente, supprime aussi
   * la demande. Le dernier gérant du garage (aucun autre gérant actif ayant
   * rejoint l'équipe) doit passer `avecGarage` : le garage, toutes ses
   * données et les comptes de l'équipe sont supprimés avec lui (App Store
   * 5.1.1(v)). Sans cela, le serveur refuse.
   */
  supprimerMonCompte(o?: { avecGarage?: boolean }): Promise<void>;

  // ── Présence sur les fiches (« Simon consulte cette fiche »)
  /** Fiche affichée par ce membre ; null quand il la quitte. */
  signalerConsultation(fiche: string | null): void;
  /** Collègues présents, fiche par fiche, en direct. Retourne la fonction de désabonnement. */
  abonnerConsultations(cb: (c: Consultations) => void): () => void;

  // ── Lecture globale (le garage entier tient en mémoire : quelques Mo au plus)
  charger(): Promise<Snapshot>;
  /** Appelé à chaque changement, local ou distant. Retourne la fonction de désabonnement. */
  abonner(cb: (s: Snapshot) => void): () => void;

  // ── Interventions
  // Note : `auteurId` est informatif ; en mode supabase l'auteur est toujours
  // l'utilisateur connecté (RLS et triggers signent avec auth.uid()).
  creerIntervention(n: NouvelleIntervention, auteurId: string): Promise<Intervention>;
  /**
   * Avec `motif` : annulation (P3). Avec `debut` (et `dureeMin`) : reprogrammation
   * d’une fiche annulée en une seule écriture (J1 puis J9 : « Rendez-vous confirmé. »
   * puis « Rendez-vous déplacé au … »).
   */
  changerStatut(
    id: string, vers: Statut, auteurId: string,
    o?: { motif?: MotifAnnulation; debut?: string; dureeMin?: number },
  ): Promise<void>;
  /** Pose, précision (même blocage, `detail` changé) ou levée (`vers` nul). */
  changerBlocage(id: string, vers: Blocage | null, auteurId: string, detail?: DetailBlocage): Promise<void>;
  affecter(id: string, membreId: string | null, auteurId: string): Promise<void>;
  modifierIntervention(id: string, patch: PatchIntervention): Promise<void>;
  commenter(c: {
    interventionId: string;
    auteurId: string;
    texte: string;
    visibleClient: boolean;
    photos?: { uri: string; video?: boolean }[];
  }): Promise<Commentaire>;
  /** Enregistre l'envoi (réel ou simulé) du SMS « véhicule prêt » */
  envoyerSmsPret(interventionId: string, auteurId: string, texte: string): Promise<void>;
  /**
   * Rédaction du texte d’un SMS au client par l’IA (option `redactionIa`,
   * fonction Edge `redaction`, Mistral AI) : rien n’est envoyé, le texte
   * revient dans le champ pour être relu et modifié. `ia: false` : repli
   * sur le texte habituel (plafond du jour, service indisponible). Lève si
   * l’option n’est pas active ou si l’intervention n’est pas visible.
   * Démonstration : rédaction simulée sur le téléphone, sans réseau.
   */
  redigerSms(interventionId: string, intention: IntentionSms, note?: string): Promise<RedactionSms>;

  // ── v2c
  /** « Accord reçu » (J6) : seule façon de lever une attente d’accord. Montant ignoré sans voirPrix. */
  noterAccord(id: string, a: { de: string; canal: CanalAccord; montant?: number }, auteurId: string): Promise<void>;
  /** Client prévenu d’une voiture prête (J11), hors SMS. */
  marquerPrevenu(id: string, canal: CanalPrevenu, auteurId: string): Promise<void>;
  /** Devis transmis pendant une attente d’accord (J5) ; l’heure est celle du serveur. */
  marquerDevisEnvoye(id: string, auteurId: string): Promise<void>;
  /** « Annuler » de l’avis (J14) : défait le dernier changement de statut ou de blocage. */
  // `evenementId` : l’événement que nomme l’avis ; si un autre changement l’a
  // suivi sur la fiche, rien n’est défait (refus « pas ici » du serveur).
  annulerDernierChangement(id: string, auteurId: string, evenementId?: string): Promise<ResultatAnnulation>;
  /** Retire une note de la page du client (P1), dans les 10 minutes. */
  retirerNote(commentaireId: string, auteurId: string): Promise<void>;

  // ── Clients et véhicules
  creerClient(c: Omit<Client, 'id' | 'garageId' | 'creeLe'>): Promise<Client>;
  modifierClient(id: string, patch: Partial<Omit<Client, 'id' | 'garageId'>>): Promise<void>;
  creerVehicule(v: Omit<Vehicule, 'id' | 'garageId' | 'origineDonnees'>): Promise<Vehicule>;
  modifierVehicule(id: string, patch: Partial<Omit<Vehicule, 'id' | 'garageId' | 'clientId'>>): Promise<void>;

  // ── Appels (option réceptionniste)
  validerAppel(appelId: string, auteurId: string): Promise<Intervention | null>;
  ignorerAppel(appelId: string): Promise<void>;
  /** Relie un appel « rappel demandé » à l'intervention créée depuis sa fiche */
  lierAppel(appelId: string, interventionId: string): Promise<void>;
  /**
   * Numéro Rencar du garage et dernier appel reçu, pour le renvoi d’appel.
   * Gérant ou permission `appels` ; null si aucun numéro n’est attribué ou
   * si le membre n’a pas le droit de le lire.
   */
  renvoiReceptionniste(): Promise<RenvoiReceptionniste | null>;

  /**
   * Conversation de l'appel à réécouter (fil des répliques, enregistrement),
   * lue à l'ouverture de la fiche, hors de l'instantané. null : rien à
   * réécouter (appel antérieur à la fonction, conversation échue ou effacée).
   */
  ecouteAppel(appelId: string): Promise<EcouteAppel | null>;

  // ── Notifications
  marquerLue(id: string): Promise<void>;
  toutMarquerLu(membreId: string): Promise<void>;
  enregistrerJetonPush(membreId: string, jeton: string): Promise<void>;

  // ── Sonnerie dans l'app (option réceptionniste, 0016)
  // `appareil` : identifiant d'installation tiré par l'app (lib/sonnerie/appareil.ts).
  /** Cet appareil sonne-t-il pour le membre connecté ? */
  sonnerieInscrite(appareil: string): Promise<boolean>;
  /** Inscrit (ou réinscrit) cet appareil : il sonnera quand le réceptionniste passe un appel à l'équipe. */
  inscrireSonnerie(appareil: string): Promise<void>;
  /** Retire cet appareil (réglage désactivé, déconnexion). */
  retirerSonnerie(appareil: string): Promise<void>;
  /** Jeton d'accès Twilio Voice du membre connecté ; null sans serveur (démonstration). */
  jetonVoix(): Promise<JetonVoix | null>;
  /** « Tester la sonnerie » : le serveur fait sonner les appareils du membre connecté. */
  testerSonnerie(): Promise<void>;

  // ── Transfert vers les portables (option réceptionniste, 0019)
  /** Portable de transfert et accord du membre connecté (accord désactivé par défaut). */
  transfertPortable(): Promise<TransfertPortable>;
  /**
   * Règle le portable et l’accord du membre connecté. `numero` vide : le
   * numéro est retiré (toujours permis). Sinon : gérant ou permission
   * `appels`, portable français (06, 07) ; accepter exige la prestation
   * réceptionniste. Rejette avec un message lisible ; renvoie le réglage
   * enregistré (numéro normalisé en E.164).
   */
  reglerTransfertPortable(r: { numero: string | null; accepte: boolean }): Promise<TransfertPortable>;
  /** Gérant : membres qui reçoivent les appels transférés sur leur portable (identifiants, jamais le numéro). */
  transfertsEquipe(): Promise<string[]>;

  // ── Équipe et réglages (gérant)
  // Un membre renvoyé avec `invitationEnAttente` peut porter l'id de l'invitation
  // (pas encore d'utilisateur) ; `modifierMembre(id, { actif: false })` la révoque.
  inviterMembre(n: NouveauMembre): Promise<Membre>;
  modifierMembre(id: string, patch: Partial<Pick<Membre, 'prenom' | 'nom' | 'role' | 'poste' | 'permissions' | 'actif'>>): Promise<void>;
  modifierGarage(patch: Partial<Omit<Garage, 'id'>>): Promise<void>;
  /**
   * Accord (`actif`, après l’écran d’accord, version `VERSION_ACCORD_IA`) ou
   * retrait de la rédaction des SMS par l’IA, par un gérant ; tracé (qui,
   * quand) par `regler_redaction_ia` (0021).
   */
  reglerRedactionIa(actif: boolean): Promise<void>;
  /** Dernier accord ou retrait de la rédaction par l’IA (gérant) ; null s’il n’y en a jamais eu. */
  accordRedactionIa(): Promise<AccordRedactionIa | null>;
}

/** Texte rédigé pour un SMS : par l’IA (`ia`), ou le texte habituel en repli. */
export type RedactionSms = { texte: string; ia: boolean; raison?: 'plafond' | 'indisponible' };

/** Trace de l’accord de la rédaction par l’IA (`redaction_ia_accords`, 0021). */
export type AccordRedactionIa = { actif: boolean; membreId: string | null; le: string; version: string | null };

export type Backend = 'demo' | 'supabase';

/** Jeton d'accès Twilio Voice (fonction Edge `voix`, route jeton), une heure. */
export type JetonVoix = { jeton: string; identite: string; expireLe: string };
