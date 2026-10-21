/**
 * Modèle métier de l'application Rencar.
 *
 * Un garage = un « tenant ». Tout objet porte `garageId`. Les identifiants
 * sont des chaînes (UUID côté Supabase, préfixes lisibles en mode démo).
 * Les dates sont des chaînes ISO 8601 (UTC) ; les créneaux affichés sont
 * convertis en heure locale à l'affichage.
 */

// ───────────────────────────────────────────────────────── Garage et équipe

export type Garage = {
  id: string;
  nom: string;
  /** Adresse d'affichage, une ligne */
  adresse: string;
  telephone: string;
  /** Expéditeur SMS : 11 caractères max, lettres et chiffres (« GARAGEFICTI ») */
  expediteurSms: string;
  /** Horaires par jour (0 = dimanche … 6 = samedi), null = fermé */
  horaires: Record<number, { de: string; a: string } | null>;
  /** Fonctions optionnelles, activées garage par garage */
  options: {
    /** Réceptionniste IA téléphonique branché (sinon l'onglet Appels explique l'option) */
    receptionniste: boolean;
    /** SMS clients (véhicule prêt, rappel) branchés */
    sms: boolean;
    /** Le SMS « véhicule prêt » part sans confirmation */
    smsAutomatique: boolean;
  };
  /** Texte du SMS « véhicule prêt », avec {prenom} et {garage} */
  texteSmsPret: string;
};

/** Rôle principal : le gérant administre, l'employé travaille. */
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
  /** Génération ou finition, texte libre (« F30 320d ») */
  version?: string;
  annee?: number;
  /** Dernier kilométrage relevé */
  km?: number;
  /** D'où vient la donnée : saisie (stockable) ou API SIV (ne pas stocker sans licence) */
  origineDonnees: 'saisie' | 'api';
};

// ───────────────────────────────────────────────────────────── Interventions

/**
 * Statut principal, dans l'ordre du cycle de vie.
 * Les blocages (attente pièce, attente accord…) sont une étiquette à part :
 * une intervention reste « en cours » tout en étant bloquée.
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

export type Intervention = {
  id: string;
  garageId: string;
  clientId: string;
  vehiculeId: string;
  /** Libellé court de la prestation (« Vidange + filtres ») */
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
  /** Mémo interne (« préfère être appelée après 18h ») */
  memo?: string;
  /** Montant estimé en euros, visible seulement avec la permission voirPrix */
  montantEstime?: number;
  /** Jeton du lien de suivi client (page web) */
  suiviToken: string;
  creeLe: string;
  majLe: string;
};

/** Commentaire dans le fil d'une intervention. */
export type Commentaire = {
  id: string;
  interventionId: string;
  /** Auteur : membre, ou système (« Site internet », « Réceptionniste ») */
  auteurId: string | null;
  auteurNom: string;
  texte: string;
  /**
   * Visible du client sur sa page de suivi. Un commentaire visible devient
   * une « étape » du suivi (titre court, pas d'heure affichée au client).
   */
  visibleClient: boolean;
  photos: Photo[];
  creeLe: string;
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

/** Trace d'un changement de statut ou de blocage. */
export type Evenement = {
  id: string;
  interventionId: string;
  membreId: string | null;
  type: 'statut' | 'blocage' | 'affectation' | 'sms' | 'creation';
  /** Valeur après changement (statut, blocage, membreId, texte du SMS) */
  valeur: string | null;
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
  /** Cible à ouvrir : intervention, appel… */
  cible?: { type: 'intervention' | 'appel'; id: string };
  lue: boolean;
  creeLe: string;
};

// ────────────────────────────────────────────────────────────────── Session

export type Session = {
  membre: Membre;
  garage: Garage;
};
