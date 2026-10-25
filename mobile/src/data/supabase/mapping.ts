/**
 * Correspondance entre les lignes Postgres (snake_case, voir
 * supabase/migrations/0001_schema.sql) et les types métier (camelCase).
 *
 * Les dates arrivent en `timestamptz` (« 2026-09-18T06:30:00+00:00 ») et sont
 * normalisées en ISO UTC (« …Z ») comme en mode démo.
 */

import type {
  Appel,
  Blocage,
  CleContexte,
  Client,
  Commentaire,
  ContexteAppel,
  EtapeAppel,
  Evenement,
  Garage,
  Intervention,
  IssueAppel,
  Membre,
  Notification,
  Origine,
  Permissions,
  Photo,
  Poste,
  Role,
  Statut,
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
  options: Garage['options'];
  texte_sms_pret: string;
  cree_le: string;
  maj_le: string;
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
};

export type LigneEvenement = {
  id: string;
  garage_id: string;
  intervention_id: string;
  membre_id: string | null;
  type: Evenement['type'];
  valeur: string | null;
  cree_le: string;
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
      receptionniste: Boolean(l.options?.receptionniste),
      sms: Boolean(l.options?.sms),
      smsAutomatique: Boolean(l.options?.smsAutomatique),
    },
    texteSmsPret: l.texte_sms_pret,
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
  };
}

// ─────────────────────────────────────────────── types métier → SQL

export function patchInterventionVersLigne(
  p: Partial<Pick<Intervention, 'prestation' | 'demande' | 'debut' | 'dureeMin' | 'restitutionPrevue' | 'memo' | 'prioritaire' | 'montantEstime'>>,
): Partial<LigneIntervention> {
  return compacter({
    prestation: p.prestation,
    demande: p.demande,
    debut: p.debut,
    duree_min: p.dureeMin,
    restitution_prevue: p.restitutionPrevue,
    memo: p.memo,
    prioritaire: p.prioritaire,
    montant_estime: p.montantEstime,
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
