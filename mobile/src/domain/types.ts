/**
 * Modèle métier de l'application Rencar.
 *
 * Un garage = un « tenant ». Tout objet porte `garageId`. Les identifiants
 * sont des chaînes (UUID côté Supabase, préfixes lisibles en mode démo).
 * Les dates sont des chaînes ISO 8601 (UTC) ; les créneaux affichés sont
 * convertis en heure locale à l'affichage.
 */

// ───────────────────────────────────────────────────────── Garage et équipe

export type Garage = {
  id: string;
  nom: string;
  /** Adresse d'affichage, une ligne */
  adresse: string;
  telephone: string;
  /** Expéditeur SMS : 11 caractères max, lettres et chiffres (« GARAGEFICTI ») */
  expediteurSms: string;
  /** Horaires par jour (0 = dimanche … 6 = samedi), null = fermé */
  horaires: Record<number, { de: string; a: string } | null>;
  /**
   * Prestations souscrites (droits réglés par Rencar, `garages.options` côté
   * serveur : le gérant ne peut pas les changer) et une préférence du gérant.
   * Voir `domain/prestations.ts`.
   */
  options: {
    /** Prestation « Site internet » : rendez-vous pris sur le site du garage */
    site: boolean;
    /** Prestation « Réceptionniste IA » : appels, fiches à valider */
    receptionniste: boolean;
    /** Prestation « Relances SMS » : SMS envoyés par Rencar (véhicule prêt, rappels) */
    sms: boolean;
    /** Préférence du gérant : le SMS « véhicule prêt » part sans confirmation (avec la prestation SMS) */
    smsAutomatique: boolean;
  };
  /** Texte du SMS « véhicule prêt », avec {prenom} et {garage} */
  texteSmsPret: string;
};

/** Rôle principal : le gérant administre, l'employé travaille. */
export type Role = 'gerant' | 'employe';

/** Poste, purement descriptif, sert de préréglage de permissions. */
export type Poste = 'mecanicien' | 'receptionnaire' | 'chef_atelier';

/** Permissions à la carte, toutes vraies pour un gérant. */
export type Permissions = {
  /** Voit toutes les interventions, pas seulement les siennes */
  voirTout: boolean;
  /** Voit les montants (devis, prix) */
  voirPrix: boolean;
  /** Peut créer des interventions et des clients */
  creer: boolean;
  /** Voit et traite les appels du réceptionniste */
  appels: boolean;
  /** Voit l'onglet Activité */
  activite: boolean;
};

export type Membre = {
  id: string;
  garageId: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  poste: Poste;
  permissions: Permissions;
  /** Couleur d'avatar, stable par membre */
  couleur: string;
  actif: boolean;
  /** Invitation envoyée mais pas encore acceptée */
  invitationEnAttente?: boolean;
};

// ────────────────────────────────────────────────────── Clients et véhicules

export type Client = {
  id: string;
  garageId: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  /** Petit rappel humain, visible de l'équipe seulement */
  memo?: string;
  creeLe: string;
};

export type Vehicule = {
  id: string;
  garageId: string;
  clientId: string;
  /** Immatriculation mise en forme (AA-008-AA) */
  plaque: string;
  marque: string;
  modele: string;
  /** Génération ou finition, texte libre (« F30 320d ») */
  version?: string;
  annee?: number;
  /** Dernier kilométrage relevé */
  km?: number;
  /** D'où vient la donnée : saisie (stockable) ou API SIV (ne pas stocker sans licence) */
  origineDonnees: 'saisie' | 'api';
};

// ───────────────────────────────────────────────────────────── Interventions

/**
 * Statut principal, dans l'ordre du cycle de vie.
 * Les blocages (attente pièce, attente accord…) sont une étiquette à part :
 * une intervention reste « en cours » tout en étant bloquée.
 */
export type Statut =
  | 'a_valider' // arrivée du site ou du réceptionniste, à confirmer par l'équipe
  | 'planifie' // rendez-vous confirmé, véhicule pas encore reçu
  | 'recu' // véhicule au garage, pas encore commencé
  | 'en_cours'
  | 'termine' // véhicule prêt, le client peut venir
  | 'livre' // restitué, intervention close
  | 'annule';

export type Blocage = 'attente_piece' | 'attente_accord' | 'rappeler_client' | 'client_sur_place';

export type Origine = 'site' | 'telephone' | 'ia' | 'comptoir';

// ── Pourquoi et quand (v2c, colonnes de 0014_atelier.sql)

/** Ce qu’on attend et pour quand : saisi dans la feuille Bloquer. */
export type DetailBlocage = {
  /** « Sonde lambda », « Plaquettes avant » : QUOI_MAX caractères au plus, interne à l’équipe */
  quoi?: string;
  /** Échéance ISO : arrivée de la pièce, heure du rappel promis */
  pour?: string;
  /** La date de la pièce est annoncée au client (« Pièce attendue le … ») */
  annonce?: boolean;
};

export type CanalAccord = 'telephone' | 'sur_place' | 'sms' | 'email';

/** Dernier accord du client, noté par « Accord reçu ». Montants lus seulement avec voirPrix. */
export type Accord = {
  de: string;
  canal: CanalAccord;
  le: string;
  /** Membre qui a reçu l’accord */
  par: string | null;
  montantAvant?: number;
  montantApres?: number;
};

/** Trace d’un appel au client pour une voiture prête (le SMS « prêt » se lit dans les événements). */
/** `sms` : message écrit depuis l’app SMS du téléphone, sans la prestation Relances SMS. */
export type CanalPrevenu = 'appel' | 'repondeur' | 'sms';
export type Prevenu = { canal: CanalPrevenu; le: string; par: string | null };

export type MotifAnnulation = 'client' | 'garage' | 'non_venu';

export type Intervention = {
  id: string;
  garageId: string;
  clientId: string;
  vehiculeId: string;
  /** Libellé court de la prestation (« Vidange + filtres ») */
  prestation: string;
  /** Ce que le client a décrit */
  demande?: string;
  statut: Statut;
  blocage: Blocage | null;
  origine: Origine;
  /** Membre affecté, null = pas encore attribué */
  membreId: string | null;
  prioritaire: boolean;
  /** Début du créneau, ISO */
  debut: string;
  /** Durée prévue en minutes */
  dureeMin: number;
  /** Date de restitution prévue, ISO, optionnelle */
  restitutionPrevue?: string;
  /** Mémo interne (« travaille au restaurant en face ») */
  memo?: string;
  /** Montant estimé en euros, visible seulement avec la permission voirPrix */
  montantEstime?: number;
  /** Jeton du lien de suivi client (page web) */
  suiviToken: string;
  creeLe: string;
  majLe: string;
  detailBlocage?: DetailBlocage;
  /** Devis transmis au client pendant l’attente d’accord en cours */
  devisEnvoyeLe?: string;
  prevenu?: Prevenu;
  dernierAccord?: Accord;
  /** Kilométrage relevé au dépôt pour cette intervention */
  kmDepot?: number;
  /**
   * Kilométrage du véhicule au moment du relevé, rendu au véhicule si le
   * relevé est corrigé ou retiré (J12). Tenu par le journal de la démo ; en
   * Supabase, la colonne est écrite et lue par le serveur seul.
   */
  kmVehiculeAvant?: number | null;
  motifAnnulation?: MotifAnnulation;
};

/** Commentaire dans le fil d'une intervention. */
export type Commentaire = {
  id: string;
  interventionId: string;
  /** Auteur : membre, ou système (« Site internet », « Réceptionniste ») */
  auteurId: string | null;
  auteurNom: string;
  texte: string;
  /**
   * Visible du client sur sa page de suivi. Un commentaire visible devient
   * une « étape » du suivi (titre court, pas d'heure affichée au client).
   */
  visibleClient: boolean;
  photos: Photo[];
  creeLe: string;
  /** Note automatique liée à son événement (v2c) */
  evenementId?: string;
  /**
   * Phrase écrite par le serveur, jamais par un membre : liée à un
   * événement, ou publiée par « Annuler » après un SMS « prêt » (sans
   * événement). Elle ne se retire pas.
   */
  automatique?: boolean;
  /** Note retirée de la page du client (P1) */
  retireeLe?: string;
  retireePar?: string | null;
};

export type Photo = {
  id: string;
  /** URI locale (démo) ou URL signée (Supabase Storage) */
  uri: string;
  largeur?: number;
  hauteur?: number;
  /** true = vidéo */
  video?: boolean;
};

export type TypeEvenement =
  | 'statut' | 'blocage' | 'affectation' | 'sms' | 'creation'
  | 'accord' | 'montant' | 'prevenu' | 'deplacement' | 'retour_prevu' | 'devis';

/** Détails d’un événement (jsonb `details`, clés en camelCase). */
export type DetailsEvenement = {
  /** statut : blocage levé par ce changement (Prêt, Livré, Annulé), rétabli par « Annuler » */
  blocageAvant?: { blocage: Blocage; detail?: DetailBlocage; devisEnvoyeLe?: string };
  /** statut : client prévenu effacé en quittant « Prêt », rétabli par « Annuler » */
  prevenuAvant?: Prevenu;
  /** statut : retour arrière annoncé au client (SMS « prêt » déjà parti) */
  retour?: boolean;
  /** statut : livraison annulée par un gérant */
  livraisonAnnulee?: boolean;
  /** statut annulé : motif */
  motif?: MotifAnnulation;
  /** statut (retour silencieux) : étapes retirées de la page du client, réaffichées par « Annuler » */
  masques?: { evenements: string[]; commentaires: string[] };
  /** blocage posé ou précisé : détail ; levée : détail d’avant (rétabli par « Annuler ») */
  detail?: DetailBlocage;
  /** blocage posé en remplacement d’un autre : détail du blocage remplacé (rétabli par « Annuler ») */
  detailAvant?: DetailBlocage;
  /** blocage précisé : échéance d’avant (report de pièce) */
  pourAvant?: string;
  /** levée d’une attente d’accord : devis d’avant (rétabli par « Annuler ») */
  devisEnvoyeLe?: string;
  /** accord */
  de?: string;
  canal?: CanalAccord;
  /** montant (lisible avec voirPrix seulement) */
  montantAvant?: number | null;
  montantApres?: number | null;
};

/** Trace d’un changement de statut, de blocage, d’accord, de rendez-vous… */
export type Evenement = {
  id: string;
  interventionId: string;
  membreId: string | null;
  type: TypeEvenement;
  /** Valeur après changement (statut, blocage, membreId, texte du SMS, début, retour prévu, canal) */
  valeur: string | null;
  /** Valeur avant le changement (statut, blocage, début, retour prévu) */
  avant?: string | null;
  /** L’étape compte pour la page du client ; absent = true (lignes anciennes) */
  visibleClient?: boolean;
  details?: DetailsEvenement;
  creeLe: string;
};

// ────────────────────────────────────────────────────────────────── Appels

export type IssueAppel = 'rdv_pris' | 'rappel_demande' | 'renseignement' | 'transfere';

/** Appel traité par le réceptionniste IA (option). */
export type Appel = {
  id: string;
  garageId: string;
  numero: string;
  /** Nom si le numéro est connu */
  appelant?: string;
  debut: string;
  dureeSec: number;
  horsHoraires: boolean;
  enCours: boolean;
  resume: string;
  issue: IssueAppel;
  /** URL d'enregistrement si disponible */
  enregistrementUrl?: string;
  /** Intervention créée automatiquement, à valider */
  interventionId?: string;
  /** Pendant l'appel : ce que le réceptionniste a déjà noté (outil update_call_context) */
  contexte?: ContexteAppel;
  /** Appel passé à l'équipe par le réceptionniste (sonnerie dans l'app, 0016) */
  transfert?: TransfertAppel;
};

/**
 * Passage de l'appel à l'équipe : les téléphones sonnent (sonne), un membre
 * a décroché (en_ligne), la conversation est finie (termine), personne n'a
 * décroché (sans_reponse), ou l'appel n'a pas pu basculer (echec : le
 * réceptionniste est resté en ligne).
 */
export type EtatTransfert = 'sonne' | 'en_ligne' | 'termine' | 'sans_reponse' | 'echec';

export type TransfertAppel = {
  etat: EtatTransfert;
  /** Début de la sonnerie */
  le: string;
  finLe?: string;
  /** Membre qui a décroché le premier */
  prisPar?: string;
  prisLe?: string;
  /** Durée de la conversation avec l'équipe */
  dureeSec?: number;
};

/** Réplique de la transcription d'un appel (0018) : texte brut, dit par le réceptionniste ou l'appelant. */
export type Replique = {
  role: 'agent' | 'appelant';
  texte: string;
  /** Instant dans l'appel, en secondes depuis le début */
  t: number;
};

/** Enregistrement à lire : fichier de la démonstration (require) ou URL signée de courte durée. */
export type SourceAudio = number | { uri: string };

/**
 * Conversation d'un appel à réécouter (0018) : fil des répliques et
 * enregistrement audio, gardés 30 jours puis effacés.
 */
export type EcouteAppel = {
  repliques: Replique[];
  /**
   * pret : lisible ; attente : récupération en cours juste après l'appel ;
   * indisponible : pas d'enregistrement (coupé, introuvable, non récupéré).
   */
  audio: { etat: 'pret'; source: SourceAudio } | { etat: 'attente' } | { etat: 'indisponible' };
  /** Fin de conservation : la conversation est ensuite effacée */
  conserveJusquAu: string;
};

/** Étape de l'appel en direct, annoncée par le réceptionniste. */
export type EtapeAppel = 'accueil' | 'identification' | 'vehicule' | 'motif' | 'reformulation' | 'transfert' | 'cloture';

export type CleContexte =
  | 'prenom'
  | 'nom'
  | 'telephoneRappel'
  | 'marque'
  | 'modele'
  | 'immatriculation'
  | 'kilometrage'
  | 'motif';

/** Information notée pendant l'appel : confirmée (relue et approuvée par l'appelant) ou seulement déclarée. */
export type ChampContexte = { valeur: string; confirme: boolean };

/** Contexte évolutif d'un appel en direct (0012, `appels.contexte`). Texte brut dicté par l'appelant. */
export type ContexteAppel = {
  etape?: EtapeAppel;
  champs: Partial<Record<CleContexte, ChampContexte>>;
  /** Dernière mise à jour */
  majLe?: string;
};

// ───────────────────────────────────────────────────────────── Notifications

export type TypeNotification = 'rdv_site' | 'ia' | 'accord' | 'piece' | 'equipe';

export type Notification = {
  id: string;
  garageId: string;
  /** null = pour tout le garage */
  membreId: string | null;
  type: TypeNotification;
  titre: string;
  detail: string;
  /** Cible à ouvrir : intervention, appel… */
  cible?: { type: 'intervention' | 'appel'; id: string };
  lue: boolean;
  creeLe: string;
  /** Événement qui l’a produite (v2c) : supprimée avec lui par « Annuler » */
  evenementId?: string;
};

// ────────────────────────────────────────────────────────────────── Session

export type Session = {
  membre: Membre;
  garage: Garage;
};

/**
 * Demande d'inscription libre (« Créer un compte ») : le compte existe, le
 * garage attend la validation de l'équipe Rencar. Aucune donnée du garage
 * n'est accessible d'ici là.
 */
export type DemandeInscription = {
  email: string;
  /** Adresse confirmée par le code reçu par e-mail */
  emailConfirme: boolean;
  prenom: string;
  nom: string;
  garage: { nom: string; adresse: string; telephone: string };
  creeLe: string;
};

/** Ce qu'ouvre une connexion : l'app du garage, ou l'écran d'attente d'une demande. */
export type Acces = { type: 'session'; session: Session } | { type: 'demande'; demande: DemandeInscription };
