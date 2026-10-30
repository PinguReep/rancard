/**
 * Correspondance entre les lignes Postgres (snake_case, voir
 * supabase/migrations/0001_schema.sql) et les types métier (camelCase).
 *
 * Les dates arrivent en `timestamptz` (« 2026-09-18T06:30:00+00:00 ») et sont
 * normalisées en ISO UTC (« …Z ») comme en mode démo.
 */

import type { PatchIntervention } from '@/data/repo';
import { ATTENTE_AUDIO_MAX_MIN } from '@/domain/appels';
import type {
  Accord,
  Appel,
  Blocage,
  CanalAccord,
  CanalPrevenu,
  CleContexte,
  Client,
  Commentaire,
  ContexteAppel,
  DemandeInscription,
  DetailBlocage,
  DetailsEvenement,
  EcouteAppel,
  EtapeAppel,
  EtatTransfert,
  Evenement,
  Garage,
  Intervention,
  IssueAppel,
  Membre,
  MessageClient,
  MotifAnnulation,
  Notification,
  Origine,
  Permissions,
  Photo,
  Poste,
  Prevenu,
  Replique,
  Role,
  Statut,
  TransfertAppel,
  TypeEvenement,
  TypeNotification,
  Vehicule,
} from '@/domain/types';

// ─────────────────────────────────────────────────────────── Lignes SQL

export type LigneGarage = {
  id: string;
  nom: string;
  adresse: string;
  telephone: string;
  expediteur_sms: string;
  horaires: Garage['horaires'];
  /** Prestations (site, sms, receptionniste) et préférence smsAutomatique ; une clé absente vaut false */
  options: Partial<Garage['options']> | null;
  texte_sms_pret: string;
  cree_le: string;
  maj_le: string;
};

/** Réponse de la RPC `ma_demande()` (0015) : la demande d’inscription du compte connecté. */
export type LigneDemande = {
  email: string;
  email_confirme: boolean;
  prenom: string;
  nom: string;
  garage: { nom: string; adresse: string; telephone: string } | null;
  cree_le: string;
};

export type LigneMembre = {
  id: string;
  garage_id: string;
  prenom: string;
  nom: string;
  email: string | null;
  role: Role;
  poste: Poste;
  permissions: Permissions;
  couleur: string;
  actif: boolean;
  invitation_en_attente: boolean;
};

export type LigneInvitation = {
  id: string;
  garage_id: string;
  email: string;
  prenom: string;
  nom: string;
  role: Role;
  poste: Poste;
  permissions: Permissions;
  couleur: string;
  acceptee_le: string | null;
  expire_le: string;
  cree_le: string;
};

export type LigneClient = {
  id: string;
  garage_id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email: string | null;
  memo: string | null;
  cree_le: string;
};

export type LigneVehicule = {
  id: string;
  garage_id: string;
  client_id: string;
  plaque: string;
  marque: string;
  modele: string;
  version: string | null;
  annee: number | null;
  km: number | null;
  origine_donnees: Vehicule['origineDonnees'];
};

/** Ligne de la vue `interventions_visibles` (montant masqué sans voirPrix). */
export type LigneIntervention = {
  id: string;
  garage_id: string;
  client_id: string;
  vehicule_id: string;
  prestation: string;
  demande: string | null;
  statut: Statut;
  blocage: Blocage | null;
  origine: Origine;
  membre_id: string | null;
  prioritaire: boolean;
  debut: string;
  duree_min: number;
  restitution_prevue: string | null;
  memo: string | null;
  /** numeric : PostgREST le renvoie en nombre (ou chaîne selon la configuration) */
  montant_estime: number | string | null;
  suivi_token: string;
  cree_le: string;
  maj_le: string;
  // ── v2c (0014_atelier.sql) : facultatives pour lire une base encore à 0013
  blocage_quoi?: string | null;
  blocage_pour?: string | null;
  blocage_annonce?: boolean | null;
  devis_envoye_le?: string | null;
  prevenu_canal?: CanalPrevenu | null;
  prevenu_le?: string | null;
  prevenu_par?: string | null;
  accord_de?: string | null;
  accord_canal?: CanalAccord | null;
  accord_le?: string | null;
  accord_par?: string | null;
  /** Nuls sans voirPrix (`accord_montant_visible` dans la vue) */
  accord_montant_avant?: number | string | null;
  accord_montant_apres?: number | string | null;
  km_depot?: number | null;
  annulation_motif?: MotifAnnulation | null;
};

export type LignePhoto = {
  id: string;
  garage_id: string;
  commentaire_id: string;
  chemin: string;
  largeur: number | null;
  hauteur: number | null;
  video: boolean;
  cree_le: string;
};

export type LigneCommentaire = {
  id: string;
  garage_id: string;
  intervention_id: string;
  auteur_id: string | null;
  auteur_nom: string;
  texte: string;
  visible_client: boolean;
  cree_le: string;
  /** Jointure PostgREST `photos(*)` */
  photos?: LignePhoto[] | null;
  /** Note automatique liée à son événement (0014) */
  evenement_id?: string | null;
  /** Phrase écrite par le serveur (0014), liée ou non à un événement */
  automatique?: boolean | null;
  retiree_le?: string | null;
  retiree_par?: string | null;
};

export type LigneEvenement = {
  id: string;
  garage_id: string;
  intervention_id: string;
  membre_id: string | null;
  type: TypeEvenement;
  valeur: string | null;
  cree_le: string;
  // ── 0014
  avant?: string | null;
  visible_client?: boolean | null;
  /** jsonb, clés en camelCase (DetailsEvenement) */
  details?: Record<string, unknown> | null;
};

export type LigneAppel = {
  id: string;
  garage_id: string;
  numero: string;
  appelant: string | null;
  debut: string;
  duree_sec: number;
  hors_horaires: boolean;
  en_cours: boolean;
  resume: string;
  issue: IssueAppel;
  enregistrement_url: string | null;
  intervention_id: string | null;
  /** Contexte de l'appel en direct (0012) : forme décrite par versContexte */
  contexte?: unknown;
  contexte_maj_le?: string | null;
  /** Passage à l'équipe (0016), écrit par les fonctions Edge seulement */
  transfert_etat?: string | null;
  transfert_le?: string | null;
  transfert_fin_le?: string | null;
  pris_par?: string | null;
  pris_le?: string | null;
  duree_equipe_sec?: number | null;
};

const ETATS_TRANSFERT: readonly EtatTransfert[] = ['sonne', 'en_ligne', 'termine', 'sans_reponse', 'echec'];

/** Colonnes du transfert (0016) → `Appel.transfert` ; absent sans transfert ou pour un état inconnu. */
export function versTransfert(l: LigneAppel): TransfertAppel | undefined {
  const etat = ETATS_TRANSFERT.find((e) => e === l.transfert_etat);
  if (!etat || !l.transfert_le) return undefined;
  return {
    etat,
    le: iso(l.transfert_le),
    finLe: l.transfert_fin_le ? iso(l.transfert_fin_le) : undefined,
    prisPar: optionnel(l.pris_par),
    prisLe: l.pris_le ? iso(l.pris_le) : undefined,
    dureeSec: typeof l.duree_equipe_sec === 'number' ? l.duree_equipe_sec : undefined,
  };
}

/** Message du client écrit sur sa page de suivi (0020), en lecture seule pour l’app. */
export type LigneMessageClient = {
  id: string;
  garage_id: string;
  intervention_id: string;
  texte: string;
  cree_le: string;
};

/** « Lue » n’est pas sur la ligne : c’est par membre, dans notifications_lues. */
export type LigneNotification = {
  id: string;
  garage_id: string;
  membre_id: string | null;
  type: TypeNotification;
  titre: string;
  detail: string;
  cible: Notification['cible'] | null;
  cree_le: string;
  /** Événement qui l’a produite (0014) : supprimée avec lui */
  evenement_id?: string | null;
};

/** Une ligne par (notification, membre) qui l’a ouverte ; la RLS ne montre que les siennes. */
export type LigneNotificationLue = {
  id: string;
  garage_id: string;
  notification_id: string;
  membre_id: string;
  cree_le: string;
};

// ───────────────────────────────────────────────────────────── Outils

/** Date Postgres → ISO UTC. Une valeur illisible est renvoyée telle quelle. */
export function iso(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toISOString();
}

const optionnel = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

const nombre = (v: number | string | null | undefined): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Retire les clés `undefined` (PostgREST les enverrait comme null). */
export function compacter<T extends Record<string, unknown>>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] !== undefined) r[k] = o[k];
  }
  return r;
}

/** Date facultative : ISO UTC, ou undefined. */
const dateOuRien = (v: unknown): string | undefined => (typeof v === 'string' && v ? iso(v) : undefined);

/**
 * Détail de blocage (colonnes `blocage_*` ou objet jsonb des événements) :
 * clés absentes plutôt que nulles, « annoncé » seulement avec une date.
 */
function versDetailBlocage(quoi: unknown, pour: unknown, annonce: unknown): DetailBlocage | undefined {
  const d: DetailBlocage = {};
  if (typeof quoi === 'string' && quoi.trim()) d.quoi = quoi;
  const date = dateOuRien(pour);
  if (date) {
    d.pour = date;
    if (annonce === true) d.annonce = true;
  }
  return Object.keys(d).length ? d : undefined;
}

const objet = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

const detailJson = (v: unknown): DetailBlocage | undefined => {
  const o = objet(v);
  return o ? versDetailBlocage(o.quoi, o.pour, o.annonce) : undefined;
};

const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const montantJson = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === 'number' || typeof v === 'string' ? (nombre(v) ?? null) : undefined;

/**
 * Détails jsonb d’un événement → DetailsEvenement. Les dates sont remises en
 * ISO UTC (le serveur les écrit au format timestamptz), les clés nulles sont
 * retirées, les clés inconnues ignorées.
 */
export function versDetailsEvenement(brut: Record<string, unknown> | null | undefined): DetailsEvenement | undefined {
  const o = objet(brut);
  if (!o) return undefined;
  const d: DetailsEvenement = {};
  const ba = objet(o.blocageAvant);
  if (ba && typeof ba.blocage === 'string') {
    d.blocageAvant = { blocage: ba.blocage as Blocage };
    const detail = detailJson(ba.detail);
    if (detail) d.blocageAvant.detail = detail;
    const devis = dateOuRien(ba.devisEnvoyeLe);
    if (devis) d.blocageAvant.devisEnvoyeLe = devis;
  }
  const pa = objet(o.prevenuAvant);
  const paLe = pa ? dateOuRien(pa.le) : undefined;
  if (pa && typeof pa.canal === 'string' && paLe) {
    d.prevenuAvant = { canal: pa.canal as CanalPrevenu, le: paLe, par: typeof pa.par === 'string' ? pa.par : null };
  }
  if (o.retour === true) d.retour = true;
  if (o.livraisonAnnulee === true) d.livraisonAnnulee = true;
  if (typeof o.motif === 'string') d.motif = o.motif as MotifAnnulation;
  const masques = objet(o.masques);
  if (masques) d.masques = { evenements: textes(masques.evenements), commentaires: textes(masques.commentaires) };
  const detail = detailJson(o.detail);
  if (detail) d.detail = detail;
  const detailAvant = detailJson(o.detailAvant);
  if (detailAvant) d.detailAvant = detailAvant;
  const pourAvant = dateOuRien(o.pourAvant);
  if (pourAvant) d.pourAvant = pourAvant;
  const devis = dateOuRien(o.devisEnvoyeLe);
  if (devis) d.devisEnvoyeLe = devis;
  if (typeof o.de === 'string') d.de = o.de;
  if (typeof o.canal === 'string') d.canal = o.canal as CanalAccord;
  const montantAvant = montantJson(o.montantAvant);
  if (montantAvant !== undefined) d.montantAvant = montantAvant;
  const montantApres = montantJson(o.montantApres);
  if (montantApres !== undefined) d.montantApres = montantApres;
  return Object.keys(d).length ? d : undefined;
}

// ─────────────────────────────────────────────── SQL → types métier

export function versGarage(l: LigneGarage): Garage {
  return {
    id: l.id,
    nom: l.nom,
    adresse: l.adresse,
    telephone: l.telephone,
    expediteurSms: l.expediteur_sms,
    horaires: l.horaires,
    options: {
      site: l.options?.site === true,
      receptionniste: l.options?.receptionniste === true,
      sms: l.options?.sms === true,
      smsAutomatique: l.options?.smsAutomatique === true,
      redactionIa: l.options?.redactionIa === true,
    },
    texteSmsPret: l.texte_sms_pret,
  };
}

export function versDemande(l: LigneDemande): DemandeInscription {
  return {
    email: l.email,
    emailConfirme: l.email_confirme === true,
    prenom: l.prenom ?? '',
    nom: l.nom ?? '',
    garage: { nom: l.garage?.nom ?? '', adresse: l.garage?.adresse ?? '', telephone: l.garage?.telephone ?? '' },
    creeLe: iso(l.cree_le),
  };
}

export function versMembre(l: LigneMembre): Membre {
  return {
    id: l.id,
    garageId: l.garage_id,
    prenom: l.prenom,
    nom: l.nom,
    email: l.email ?? '',
    role: l.role,
    poste: l.poste,
    permissions: l.permissions,
    couleur: l.couleur,
    actif: l.actif,
    ...(l.invitation_en_attente ? { invitationEnAttente: true } : {}),
  };
}

/** Une invitation pas encore acceptée s’affiche dans l’équipe comme un membre en attente. */
export function versMembreDepuisInvitation(l: LigneInvitation): Membre {
  return {
    id: l.id,
    garageId: l.garage_id,
    prenom: l.prenom,
    nom: l.nom,
    email: l.email,
    role: l.role,
    poste: l.poste,
    permissions: l.permissions,
    couleur: l.couleur,
    actif: true,
    invitationEnAttente: true,
  };
}

export function versClient(l: LigneClient): Client {
  return {
    id: l.id,
    garageId: l.garage_id,
    prenom: l.prenom,
    nom: l.nom,
    telephone: l.telephone,
    email: optionnel(l.email),
    memo: optionnel(l.memo),
    creeLe: iso(l.cree_le),
  };
}

export function versVehicule(l: LigneVehicule): Vehicule {
  return {
    id: l.id,
    garageId: l.garage_id,
    clientId: l.client_id,
    plaque: l.plaque,
    marque: l.marque,
    modele: l.modele,
    version: optionnel(l.version),
    annee: nombre(l.annee),
    km: nombre(l.km),
    origineDonnees: l.origine_donnees,
  };
}

export function versIntervention(l: LigneIntervention): Intervention {
  return {
    id: l.id,
    garageId: l.garage_id,
    clientId: l.client_id,
    vehiculeId: l.vehicule_id,
    prestation: l.prestation,
    demande: optionnel(l.demande),
    statut: l.statut,
    blocage: l.blocage,
    origine: l.origine,
    membreId: l.membre_id,
    prioritaire: l.prioritaire,
    debut: iso(l.debut),
    dureeMin: l.duree_min,
    restitutionPrevue: l.restitution_prevue ? iso(l.restitution_prevue) : undefined,
    memo: optionnel(l.memo),
    montantEstime: nombre(l.montant_estime),
    suiviToken: l.suivi_token,
    creeLe: iso(l.cree_le),
    majLe: iso(l.maj_le),
    ...compacter({
      detailBlocage: l.blocage ? versDetailBlocage(l.blocage_quoi, l.blocage_pour, l.blocage_annonce) : undefined,
      devisEnvoyeLe: l.blocage === 'attente_accord' ? dateOuRien(l.devis_envoye_le) : undefined,
      prevenu: versPrevenu(l),
      dernierAccord: versAccord(l),
      kmDepot: nombre(l.km_depot),
      motifAnnulation: l.statut === 'annule' ? optionnel(l.annulation_motif) : undefined,
    }),
  };
}

function versPrevenu(l: LigneIntervention): Prevenu | undefined {
  if (!l.prevenu_canal || !l.prevenu_le) return undefined;
  return { canal: l.prevenu_canal, le: iso(l.prevenu_le), par: l.prevenu_par ?? null };
}

/** Dernier accord ; montants présents seulement si la vue les rend (voirPrix). */
function versAccord(l: LigneIntervention): Accord | undefined {
  if (!l.accord_de || !l.accord_canal || !l.accord_le) return undefined;
  return {
    de: l.accord_de,
    canal: l.accord_canal,
    le: iso(l.accord_le),
    par: l.accord_par ?? null,
    ...compacter({ montantAvant: nombre(l.accord_montant_avant), montantApres: nombre(l.accord_montant_apres) }),
  };
}

export function versPhoto(l: LignePhoto, urls: ReadonlyMap<string, string>): Photo {
  return {
    id: l.id,
    uri: urls.get(l.chemin) ?? '',
    largeur: nombre(l.largeur),
    hauteur: nombre(l.hauteur),
    ...(l.video ? { video: true } : {}),
  };
}

export function versCommentaire(l: LigneCommentaire, urls: ReadonlyMap<string, string>): Commentaire {
  const photos = [...(l.photos ?? [])].sort((a, b) => a.cree_le.localeCompare(b.cree_le));
  return {
    id: l.id,
    interventionId: l.intervention_id,
    auteurId: l.auteur_id,
    auteurNom: l.auteur_nom,
    texte: l.texte,
    visibleClient: l.visible_client,
    photos: photos.map((p) => versPhoto(p, urls)),
    creeLe: iso(l.cree_le),
    ...(l.evenement_id ? { evenementId: l.evenement_id } : {}),
    ...(l.automatique ? { automatique: true } : {}),
    ...(l.retiree_le ? { retireeLe: iso(l.retiree_le), retireePar: l.retiree_par ?? null } : {}),
  };
}

export function versMessageClient(l: LigneMessageClient): MessageClient {
  return {
    id: l.id,
    garageId: l.garage_id,
    interventionId: l.intervention_id,
    texte: l.texte,
    creeLe: iso(l.cree_le),
  };
}

export function versEvenement(l: LigneEvenement): Evenement {
  return {
    id: l.id,
    interventionId: l.intervention_id,
    membreId: l.membre_id,
    type: l.type,
    valeur: l.valeur,
    creeLe: iso(l.cree_le),
    ...(l.avant !== undefined ? { avant: l.avant } : {}),
    // Colonne absente (base encore à 0013) : l’étape compte pour la page, comme avant.
    visibleClient: l.visible_client !== false,
    ...compacter({ details: versDetailsEvenement(l.details) }),
  };
}

export function versAppel(l: LigneAppel): Appel {
  return {
    id: l.id,
    garageId: l.garage_id,
    numero: l.numero,
    appelant: optionnel(l.appelant),
    debut: iso(l.debut),
    dureeSec: l.duree_sec,
    horsHoraires: l.hors_horaires,
    enCours: l.en_cours,
    resume: l.resume,
    issue: l.issue,
    enregistrementUrl: optionnel(l.enregistrement_url),
    interventionId: optionnel(l.intervention_id),
    contexte: versContexte(l.contexte, l.contexte_maj_le),
    transfert: versTransfert(l),
  };
}

const ETAPES: readonly EtapeAppel[] = ['accueil', 'identification', 'vehicule', 'motif', 'reformulation', 'transfert', 'cloture'];

/** Clés de `appels.contexte.champs` (snake_case, 0012) → clés de l'app. */
const CLES_CONTEXTE: Record<string, CleContexte> = {
  prenom: 'prenom',
  nom: 'nom',
  telephone_rappel: 'telephoneRappel',
  marque: 'marque',
  modele: 'modele',
  immatriculation: 'immatriculation',
  kilometrage: 'kilometrage',
  motif: 'motif',
};

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `appels.contexte` (jsonb écrit par appel_maj_contexte, 0012) → contexte de
 * l'app. Lecture défensive : dicté par l'appelant, le texte reste brut et
 * borné ; une forme inattendue est ignorée. Undefined si rien n'a été noté.
 *   { version: 1, etape: { valeur }, champs: { <clé>: { valeur, niveau } }, maj: { le } }
 */
export function versContexte(brut: unknown, majLe?: string | null): ContexteAppel | undefined {
  if (!estObjet(brut)) return undefined;
  const champs: ContexteAppel['champs'] = {};
  if (estObjet(brut.champs)) {
    for (const [cle, champ] of Object.entries(brut.champs)) {
      const cible = Object.prototype.hasOwnProperty.call(CLES_CONTEXTE, cle) ? CLES_CONTEXTE[cle] : undefined;
      if (!cible || !estObjet(champ)) continue;
      const v = champ.valeur;
      const valeur = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim().slice(0, 500) : '';
      if (valeur) champs[cible] = { valeur, confirme: champ.niveau !== 'declare' };
    }
  }
  const valeurEtape = estObjet(brut.etape) ? brut.etape.valeur : undefined;
  const etape = ETAPES.find((e) => e === valeurEtape);
  if (!etape && !Object.keys(champs).length) return undefined;
  return { etape, champs, majLe: majLe ? iso(majLe) : undefined };
}

/** Ligne de `appels_ecoutes` (0018), colonnes lues par l'app. */
export type LigneEcoute = {
  repliques: unknown;
  audio_etat: 'a_recuperer' | 'pret' | 'absent' | 'echec';
  audio_chemin: string | null;
  expire_le: string;
  cree_le: string;
};

/**
 * Répliques de `appels_ecoutes.repliques` → fil de l'app. Lecture
 * défensive (texte dicté par l'appelant, transcrit par ElevenLabs) : rôle
 * connu, texte non vide et borné, instant positif ; triées par instant.
 */
export function versRepliques(brut: unknown): Replique[] {
  if (!Array.isArray(brut)) return [];
  const repliques: Replique[] = [];
  for (const r of brut) {
    if (!estObjet(r)) continue;
    const role = r.role === 'agent' || r.role === 'appelant' ? r.role : null;
    const texte = typeof r.texte === 'string' ? r.texte.trim().slice(0, 4000) : '';
    const t = typeof r.t === 'number' && Number.isFinite(r.t) && r.t >= 0 ? r.t : null;
    if (role && texte && t !== null) repliques.push({ role, texte, t });
  }
  return repliques.sort((a, b) => a.t - b.t);
}

/**
 * Ligne d'écoute → conversation de l'app. `uri` : URL signée de l'audio
 * (null si l'audio n'est pas prêt ou n'a pas pu être signé). Une
 * récupération qui dure plus de ATTENTE_AUDIO_MAX_MIN n'aboutira plus :
 * l'enregistrement est alors indisponible.
 */
export function versEcoute(l: LigneEcoute, uri: string | null, maintenant = Date.now()): EcouteAppel {
  const recente = maintenant - new Date(l.cree_le).getTime() < ATTENTE_AUDIO_MAX_MIN * 60_000;
  const audio: EcouteAppel['audio'] =
    l.audio_etat === 'pret' && uri
      ? { etat: 'pret', source: { uri } }
      : l.audio_etat === 'a_recuperer' && recente
        ? { etat: 'attente' }
        : { etat: 'indisponible' };
  return { repliques: versRepliques(l.repliques), audio, conserveJusquAu: iso(l.expire_le) };
}

/** `lues` : identifiants des notifications que le membre connecté a ouvertes. */
export function versNotification(l: LigneNotification, lues: ReadonlySet<string>): Notification {
  return {
    id: l.id,
    garageId: l.garage_id,
    membreId: l.membre_id,
    type: l.type,
    titre: l.titre,
    detail: l.detail,
    cible: optionnel(l.cible),
    lue: lues.has(l.id),
    creeLe: iso(l.cree_le),
    ...(l.evenement_id ? { evenementId: l.evenement_id } : {}),
  };
}

// ─────────────────────────────────────────────── types métier → SQL

/**
 * Détail de blocage → colonnes `blocage_*` ; null retire tout. Le trigger
 * « avant » de 0014 normalise de son côté : on envoie déjà des valeurs
 * conformes aux contraintes (annonce seulement avec une date).
 */
export function detailBlocageVersLigne(
  d: DetailBlocage | null,
): Required<Pick<LigneIntervention, 'blocage_quoi' | 'blocage_pour' | 'blocage_annonce'>> {
  const quoi = d?.quoi?.trim();
  const pour = d?.pour || null;
  return { blocage_quoi: quoi || null, blocage_pour: pour, blocage_annonce: Boolean(pour && d?.annonce) };
}

/** `null` retire la valeur (retour prévu, détail du blocage, kilométrage au dépôt) ; `undefined` n’y touche pas. */
export function patchInterventionVersLigne(p: PatchIntervention): Partial<LigneIntervention> {
  return compacter({
    prestation: p.prestation,
    demande: p.demande,
    debut: p.debut,
    duree_min: p.dureeMin,
    restitution_prevue: p.restitutionPrevue,
    memo: p.memo,
    prioritaire: p.prioritaire,
    montant_estime: p.montantEstime,
    km_depot: p.kmDepot,
    ...(p.detailBlocage !== undefined ? detailBlocageVersLigne(p.detailBlocage) : {}),
  });
}

export function patchClientVersLigne(p: Partial<Omit<Client, 'id' | 'garageId'>>): Partial<LigneClient> {
  return compacter({
    prenom: p.prenom,
    nom: p.nom,
    telephone: p.telephone,
    email: p.email,
    memo: p.memo,
    cree_le: p.creeLe,
  });
}

export function patchVehiculeVersLigne(
  p: Partial<Omit<Vehicule, 'id' | 'garageId' | 'clientId'>>,
): Partial<LigneVehicule> {
  return compacter({
    plaque: p.plaque,
    marque: p.marque,
    modele: p.modele,
    version: p.version,
    annee: p.annee,
    km: p.km,
    origine_donnees: p.origineDonnees,
  });
}

export function patchMembreVersLigne(
  p: Partial<Pick<Membre, 'prenom' | 'nom' | 'role' | 'poste' | 'permissions' | 'actif'>>,
): Partial<LigneMembre> {
  return compacter({
    prenom: p.prenom,
    nom: p.nom,
    role: p.role,
    poste: p.poste,
    permissions: p.permissions,
    actif: p.actif,
  });
}

export function patchGarageVersLigne(p: Partial<Omit<Garage, 'id'>>): Partial<LigneGarage> {
  return compacter({
    nom: p.nom,
    adresse: p.adresse,
    telephone: p.telephone,
    expediteur_sms: p.expediteurSms,
    horaires: p.horaires,
    options: p.options,
    texte_sms_pret: p.texteSmsPret,
  });
}
