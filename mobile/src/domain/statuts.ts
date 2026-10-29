/**
 * Cycle de vie d'une intervention : libellés, couleurs, transitions, phrases
 * lues par le client et textes du fil de l’équipe.
 * Les écrans n'inventent jamais un bouton : ils demandent `actionsPossibles`
 * (ou `gesteCarte` pour la carte du planning), avec `contexteActions`.
 */

import {
  dePrenom,
  euros,
  heure,
  heureClient,
  jourCourt,
  jourHeure,
  jourLongClient,
  memeJour,
  sansHeure,
} from '@/lib/format';

import type {
  Blocage,
  CanalAccord,
  DetailBlocage,
  Evenement,
  Intervention,
  Membre,
  MotifAnnulation,
  Origine,
  Permissions,
  Statut,
  TypeEvenement,
} from './types';

export type StatutInfo = {
  label: string;
  /** Libellé court pour les pastilles */
  court: string;
  /** Clés de couleur du thème (voir tokens.ts) */
  couleur: 'accent' | 'ok' | 'warn' | 'muted' | 'danger';
  /** Phrase affichée au client sur sa page de suivi */
  client: string;
};

export const STATUTS: Record<Statut, StatutInfo> = {
  a_valider: {
    label: 'À valider',
    court: 'À valider',
    couleur: 'warn',
    client: 'Demande reçue, le garage vous confirme le créneau.',
  },
  planifie: {
    label: 'Rendez-vous confirmé',
    court: 'Planifié',
    couleur: 'accent',
    client: 'Rendez-vous confirmé.',
  },
  recu: {
    label: 'Véhicule reçu',
    court: 'Reçu',
    couleur: 'accent',
    client: 'Votre véhicule est au garage.',
  },
  en_cours: {
    label: 'En cours',
    court: 'En cours',
    couleur: 'accent',
    client: 'Intervention en cours.',
  },
  termine: {
    label: 'Véhicule prêt',
    court: 'Prêt',
    couleur: 'ok',
    client: 'Votre véhicule est prêt, vous pouvez venir le récupérer.',
  },
  livre: {
    label: 'Livré',
    court: 'Livré',
    couleur: 'muted',
    client: 'Véhicule restitué. Merci de votre confiance.',
  },
  annule: {
    label: 'Annulé',
    court: 'Annulé',
    couleur: 'muted',
    client: 'Rendez-vous annulé.',
  },
};

/** Ordre d'affichage dans les listes et le kanban. */
export const ORDRE_STATUTS: Statut[] = [
  'a_valider',
  'planifie',
  'recu',
  'en_cours',
  'termine',
  'livre',
  'annule',
];

/** Statuts « vivants » : ce qui occupe l'atelier aujourd'hui. */
export const STATUTS_ACTIFS: Statut[] = ['a_valider', 'planifie', 'recu', 'en_cours', 'termine'];

/**
 * Rang dans le cycle : a_valider 0, planifie 1, recu 2, en_cours 3,
 * termine 4, livre 5 ; `annule` n’a pas de rang (`null`).
 */
export function rangStatut(s: Statut): number | null {
  const rangs: Record<Statut, number | null> = {
    a_valider: 0,
    planifie: 1,
    recu: 2,
    en_cours: 3,
    termine: 4,
    livre: 5,
    annule: null,
  };
  return rangs[s] ?? null;
}

/**
 * Retour arrière dans le cycle (« Revenir à En cours », « Pas encore
 * arrivé », annulation d’une livraison) : les deux statuts ont un rang et
 * celui d’arrivée est plus petit. Une annulation et la reprogrammation d’une
 * fiche annulée n’en sont pas.
 */
export function estRetourArriere(de: Statut, vers: Statut): boolean {
  const a = rangStatut(de);
  const b = rangStatut(vers);
  return a !== null && b !== null && b < a;
}

// ───────────────────────────────────────────────────────────── Constantes

/** « Quelle pièce ? », « Sur quoi ? », « Pourquoi ? » : longueur maximale du « quoi » d’un blocage. */
export const QUOI_MAX = 60;
/** « De qui ? » d’un accord. */
export const DE_MAX = 80;
/** Kilométrage au dépôt, borne haute (comprise). */
export const KM_MAX = 1_999_999;

/** Canaux d’un accord : libellé de puce et forme dans une phrase (« Accord de Manon par téléphone »). */
export const CANAUX_ACCORD: Record<CanalAccord, { label: string; phrase: string }> = {
  telephone: { label: 'Téléphone', phrase: 'par téléphone' },
  sur_place: { label: 'Sur place', phrase: 'sur place' },
  sms: { label: 'SMS', phrase: 'par SMS' },
  email: { label: 'E-mail', phrase: 'par e-mail' },
};

/** Ordre des puces « Comment ? » de la feuille Accord (aucune présélection). */
export const LISTE_CANAUX_ACCORD: CanalAccord[] = ['telephone', 'sur_place', 'sms', 'email'];

/** Motifs d’annulation (P3) : libellé de puce et précision du fil (« Simon a annulé l’intervention (client non venu) »). */
export const MOTIFS_ANNULATION: Record<MotifAnnulation, { label: string; fil: string }> = {
  client: { label: 'Le client annule', fil: 'demande du client' },
  garage: { label: 'Le garage annule', fil: 'décision du garage' },
  non_venu: { label: 'Client non venu', fil: 'client non venu' },
};

/** Ordre des puces de la feuille d’annulation (« Le client annule » choisi par défaut). */
export const LISTE_MOTIFS_ANNULATION: MotifAnnulation[] = ['client', 'garage', 'non_venu'];

// ───────────────────────────────────────────────────────────── Blocages

export type BlocageInfo = {
  label: string;
  /** Phrase affichée au client pendant le blocage (sans date annoncée, sans devis) */
  client: string;
  /** Geste qui lève le blocage (« Pièce reçue ») */
  levee: string;
  /** Titre de la confirmation quand on passe en « Véhicule prêt » sans lever le blocage */
  nonLeve: string;
};

export const BLOCAGES: Record<Blocage, BlocageInfo> = {
  attente_piece: {
    label: 'Attente pièce',
    client: 'En attente d’une pièce.',
    levee: 'Pièce reçue',
    nonLeve: 'L’attente de pièce n’est pas levée',
  },
  attente_accord: {
    label: 'Attente accord',
    client: 'Le garage va vous contacter au sujet de travaux à prévoir.',
    levee: 'Accord reçu',
    nonLeve: 'L’attente d’accord n’est pas levée',
  },
  rappeler_client: {
    label: 'Rappeler le client',
    client: 'Le garage va vous rappeler.',
    levee: 'Client rappelé',
    nonLeve: 'Le rappel du client n’est pas fait',
  },
  client_sur_place: {
    label: 'Client sur place',
    client: 'Intervention en cours.',
    levee: 'Débloquer',
    nonLeve: 'Le blocage « Client sur place » n’est pas levé',
  },
};

/**
 * Blocages proposés à la pose, dans l’ordre des feuilles (« Qu’est-ce qui
 * bloque ? »). « Client sur place » n’est plus proposé (la valeur reste
 * dans l’enum pour les données existantes).
 */
export const POSES_BLOCAGE: { blocage: Blocage; label: string }[] = [
  { blocage: 'attente_piece', label: 'Attente pièce' },
  { blocage: 'attente_accord', label: 'Demander l’accord' },
  { blocage: 'rappeler_client', label: 'À rappeler' },
];

export const ORIGINES: Record<Origine, { label: string; court: string }> = {
  site: { label: 'Site internet', court: 'Site' },
  telephone: { label: 'Téléphone', court: 'Tél.' },
  ia: { label: 'Réceptionniste', court: 'IA' },
  comptoir: { label: 'Comptoir', court: 'Comptoir' },
};

// ───────────────────────────────────────────────────────────── Actions

/**
 * Transitions autorisées depuis chaque statut. `recu → planifie` corrige un
 * « Véhicule reçu » touché trop tôt (« Pas encore arrivé »). `livre → termine`
 * n’est pas ici : il dépend de qui et de quand (voir `actionsPossibles`).
 * Le premier statut de chaque liste est le geste suivant canonique.
 */
const TRANSITIONS: Record<Statut, Statut[]> = {
  a_valider: ['planifie', 'annule'],
  planifie: ['recu', 'en_cours', 'annule'],
  recu: ['en_cours', 'planifie', 'annule'],
  en_cours: ['termine', 'recu'],
  termine: ['livre', 'en_cours'],
  livre: [],
  annule: ['planifie'],
};

/** Statuts dont on ne repart pas par le grand bouton (reprogrammation ou retour, rangés dans le menu ⋯). */
const SANS_PRINCIPAL: Statut[] = ['annule', 'livre'];

/**
 * Un geste proposé. Un blocage peut être l’action principale : sur une
 * voiture reçue ou en cours et bloquée, le geste suivant est de le lever
 * (`vers: null`). La levée d’une attente d’accord ouvre toujours la feuille
 * Accord (`usePassageStatut().executer`), jamais en un appui.
 */
export type Action =
  | { type: 'statut'; vers: Statut; label: string; principal: boolean }
  | { type: 'blocage'; vers: Blocage | null; label: string; principal: boolean };

/** Qui agit, et quand la voiture est partie. */
export type ContexteActions = {
  /** Permissions effectives du membre (permissionsDe). Absent : comportement v2a. */
  permissions?: Pick<Permissions, 'voirPrix' | 'creer' | 'appels'>;
  gerant?: boolean;
  /** Date (ISO) du dernier passage en « Livré » */
  livreLe?: string;
  maintenant?: Date;
};

/**
 * Contexte d’`actionsPossibles` et de `gesteCarte` pour le membre connecté.
 * `permissions` : les permissions effectives (`permissionsDe(membre)`).
 * `evenements` : ceux de l’intervention (ou de tout le garage avec
 * `o.interventionId`), pour la date de la livraison.
 *
 * Tous les appelants passent ce contexte (BarreActions, FeuilleActions,
 * FeuilleMenu, GesteCarte, passage-statut) : sans lui, le mécanicien
 * verrait « Livré au client » et « Annuler ».
 */
export function contexteActions(
  membre: Pick<Membre, 'role'> | null | undefined,
  permissions: Pick<Permissions, 'voirPrix' | 'creer' | 'appels'>,
  evenements?: Evenement[],
  o?: { interventionId?: string; maintenant?: Date },
): ContexteActions {
  let livreLe: string | undefined;
  for (const e of evenements ?? []) {
    if (o?.interventionId && e.interventionId !== o.interventionId) continue;
    if (e.type === 'statut' && e.valeur === 'livre' && (!livreLe || e.creeLe > livreLe)) livreLe = e.creeLe;
  }
  return {
    permissions: { voirPrix: permissions.voirPrix, creer: permissions.creer, appels: permissions.appels },
    gerant: membre?.role === 'gerant',
    livreLe,
    maintenant: o?.maintenant ?? new Date(),
  };
}

/** Libellé du bouton qui mène à un statut. */
const VERBES: Record<Statut, string> = {
  a_valider: 'Remettre à valider',
  planifie: 'Confirmer le rendez-vous',
  recu: 'Véhicule reçu',
  en_cours: 'Démarrer',
  termine: 'Véhicule prêt',
  livre: 'Livré au client',
  annule: 'Annuler',
};

/** Le statut `vers` est-il permis à ce membre depuis `de` ? (R1, R2 côté écran) */
function permis(de: Statut, vers: Statut, p: ContexteActions['permissions']): boolean {
  if (!p) return true;
  if (vers === 'livre') return p.voirPrix;
  if (vers === 'annule') return p.creer || (p.appels && de === 'a_valider');
  // Reprogrammer une fiche annulée, comme l’annuler, demande « Créer » (R18 du serveur).
  if (de === 'annule') return p.creer;
  return true;
}

/**
 * Boutons à proposer pour une intervention, le premier étant l'action
 * principale (le « geste suivant » évident).
 *
 * Avec `ctx.permissions` : pas de « Livré au client » sans `voirPrix` (D3),
 * pas d’« Annuler » sans `creer` (ou `appels` depuis « À valider ») ; un
 * statut refusé ne laisse pas sa place de principal à un retour arrière
 * (mécanicien sur une voiture prête : aucun grand bouton). Retour depuis
 * « Livré » (annuler la livraison) : gérant seulement, le jour même.
 */
export function actionsPossibles(i: Pick<Intervention, 'statut' | 'blocage'>, ctx?: ContexteActions): Action[] {
  const canon = TRANSITIONS[i.statut];
  const suivants = canon.filter((vers) => permis(i.statut, vers, ctx?.permissions));
  if (i.statut === 'livre' && ctx?.gerant && ctx.livreLe && memeJour(new Date(ctx.livreLe), ctx.maintenant ?? new Date())) {
    suivants.push('termine');
  }
  // Reçue ou en cours et bloquée : lever le blocage passe devant les statuts.
  // Planifiée (pièce commandée avant l’arrivée) : la réception reste le geste suivant.
  const leveePrincipale = Boolean(i.blocage) && (i.statut === 'recu' || i.statut === 'en_cours');
  const actions: Action[] = suivants.map((vers) => ({
    type: 'statut',
    vers,
    label: VERBES[vers],
    principal: vers === canon[0] && vers !== 'annule' && !SANS_PRINCIPAL.includes(i.statut) && !leveePrincipale,
  }));

  if (i.statut === 'recu' || i.statut === 'en_cours' || i.statut === 'planifie') {
    if (i.blocage) {
      const levee: Action = { type: 'blocage', vers: null, label: BLOCAGES[i.blocage].levee, principal: leveePrincipale };
      if (leveePrincipale) actions.unshift(levee);
      else actions.push(levee);
    } else {
      actions.push(...POSES_BLOCAGE.map((p): Action => ({ type: 'blocage', vers: p.blocage, label: p.label, principal: false })));
    }
  }
  return actions;
}

/** Libellés courts du bouton « geste suivant » de la carte du planning. */
export const VERBES_CARTE: Partial<Record<Statut, string>> = {
  recu: 'Reçu',
  en_cours: 'Démarrer',
  termine: 'Prêt',
  livre: 'Livrer',
};

/** Libellés courts des levées sur la carte. */
export const LEVEES_CARTE: Record<Blocage, string> = {
  attente_piece: 'Pièce reçue',
  attente_accord: 'Accord reçu',
  rappeler_client: 'Rappelé',
  client_sur_place: 'Débloquer',
};

/**
 * Geste suivant de la carte du planning (D10), libellé court : « Reçu »,
 * « Démarrer », « Prêt », « Livrer » ; levées « Pièce reçue », « Accord
 * reçu » (ouvre la feuille Accord), « Rappelé ». `null` pour une demande à
 * valider (le pied « Confirmer » existe), une fiche annulée ou livrée, et
 * pour « Livrer » sans `voirPrix` (le mécanicien ne livre pas, D3).
 */
export function gesteCarte(i: Pick<Intervention, 'statut' | 'blocage'>, ctx: ContexteActions): Action | null {
  if (i.statut === 'a_valider' || i.statut === 'annule' || i.statut === 'livre') return null;
  const a = actionsPossibles(i, ctx).find((x) => x.principal);
  if (!a) return null;
  if (a.type === 'blocage') return a.vers === null && i.blocage ? { ...a, label: LEVEES_CARTE[i.blocage] } : null;
  if (a.vers === 'livre' && !ctx.permissions?.voirPrix) return null;
  return { ...a, label: VERBES_CARTE[a.vers] ?? a.label };
}

export function peutPasser(de: Statut, vers: Statut): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** Une intervention bloquée demande une action humaine. */
export function estBloquee(i: Pick<Intervention, 'blocage' | 'statut'>): boolean {
  return i.blocage !== null && i.statut !== 'livre' && i.statut !== 'annule';
}

// ───────────────────────────────────────────── Ce que lit le client (§ 1.4)
//
// Table copiée à l’identique dans supabase/functions/_partage/statuts.ts et
// suivi/rendu.ts (S3), et dans le SQL pour les notes automatiques de statut.
// Aucune phrase ne contient de montant, de nom de mécanicien, de mémo ni le
// « quoi » d’un blocage.

/** Phrase publiée à la levée d’un blocage (`null` : la levée n’est pas visible du client). */
export const LEVEES_CLIENT: Record<Blocage, string | null> = {
  attente_piece: 'Pièce reçue, nous reprenons l’intervention.',
  attente_accord: 'Accord bien reçu, nous continuons l’intervention.',
  rappeler_client: null,
  client_sur_place: null,
};

/** Devis transmis pendant une attente d’accord (P2). */
export const PHRASE_DEVIS = 'Un devis vous a été transmis : le garage attend votre accord.';

/** Retour arrière depuis « Prêt » alors que le SMS « prêt » est déjà parti (D5). */
export const PHRASE_PLUS_PRET = 'Votre véhicule n’est finalement pas encore prêt. Nous vous prévenons dès qu’il l’est.';

/**
 * Annulation : « Rendez-vous annulé. » (motif client ou sans motif),
 * « Rendez-vous annulé par le garage, qui vous recontacte. », « Rendez-vous
 * manqué. Appelez le garage pour en fixer un autre. »
 */
export function phraseAnnulation(motif?: MotifAnnulation | null): string {
  if (motif === 'garage') return 'Rendez-vous annulé par le garage, qui vous recontacte.';
  if (motif === 'non_venu') return 'Rendez-vous manqué. Appelez le garage pour en fixer un autre.';
  return STATUTS.annule.client;
}

/** « Pièce attendue le jeudi 29 octobre. » (jour long, jamais d’heure) */
export function phrasePieceAttendue(pour: string, maintenant: Date = new Date()): string {
  return `Pièce attendue le ${jourLongClient(pour, maintenant)}.`;
}

/** « Rendez-vous déplacé au mardi 3 novembre à 8h30. » */
export function phraseDeplacementClient(debut: string, maintenant: Date = new Date()): string {
  return `Rendez-vous déplacé au ${jourLongClient(debut, maintenant)} à ${heureClient(debut)}.`;
}

/**
 * Phrase que le client lit pour un événement (« Le client lit » du fil),
 * copie de `phraseEtape` de la page de suivi (suivi/rendu.ts) :
 * - statut : retour annoncé → `PHRASE_PLUS_PRET` ; annulé → `phraseAnnulation(motif)` ;
 *   « À valider » → rien ; sinon `STATUTS[x].client` ;
 * - blocage posé : pièce (« Pièce attendue le … » si la date est annoncée,
 *   sinon « En attente d’une pièce. »), accord (phrase neutre), rappel ;
 *   « Client sur place » → rien ;
 * - levée : `LEVEES_CLIENT[avant]`, rien si `avant` manque (lignes anciennes) ;
 * - déplacement : « Rendez-vous déplacé au … » ; devis : `PHRASE_DEVIS`.
 * `null` pour un événement non visible du client (masqué, retour silencieux…).
 */
export function phraseClientEvenement(e: Evenement, maintenant: Date = new Date()): string | null {
  if (e.visibleClient === false) return null;
  const v = e.valeur;
  switch (e.type) {
    case 'statut': {
      if (e.details?.retour) return PHRASE_PLUS_PRET;
      if (v === 'annule') return phraseAnnulation(e.details?.motif);
      if (!v || v === 'a_valider' || !(v in STATUTS)) return null;
      return STATUTS[v as Statut].client;
    }
    case 'blocage': {
      if (v === null) {
        const avant = e.avant as Blocage | null | undefined;
        return avant && avant in LEVEES_CLIENT ? LEVEES_CLIENT[avant] : null;
      }
      if (v === 'attente_piece') {
        const d = e.details?.detail;
        return d?.annonce && d.pour ? phrasePieceAttendue(d.pour, maintenant) : BLOCAGES.attente_piece.client;
      }
      if (v === 'attente_accord' || v === 'rappeler_client') return BLOCAGES[v].client;
      return null;
    }
    case 'deplacement':
      return v ? phraseDeplacementClient(v, maintenant) : null;
    case 'devis':
      return PHRASE_DEVIS;
    default:
      return null;
  }
}

// ───────────────────────────────────────────── Fil de l’équipe

/**
 * Ordre des événements écrits au même instant (une écriture et ses
 * conséquences) : le fil et la page trient par (date, rang) ; les notes
 * viennent après.
 */
export const RANG_EVENEMENT: Record<TypeEvenement, number> = {
  creation: 0,
  statut: 1,
  accord: 2,
  montant: 3,
  blocage: 4,
  devis: 5,
  deplacement: 6,
  retour_prevu: 7,
  prevenu: 8,
  affectation: 9,
  sms: 10,
};

/** Tri (date, rang) des événements, du plus ancien au plus récent. */
export function comparerEvenements(a: Pick<Evenement, 'creeLe' | 'type'>, b: Pick<Evenement, 'creeLe' | 'type'>): number {
  const ta = new Date(a.creeLe).getTime();
  const tb = new Date(b.creeLe).getTime();
  if (ta !== tb) return ta - tb;
  return (RANG_EVENEMENT[a.type] ?? 99) - (RANG_EVENEMENT[b.type] ?? 99);
}

/**
 * « Sonde lambda » devient « sonde lambda » dans une phrase (après « : » ou
 * « · ») ; un sigle (« ABS », « EGR ») est gardé tel quel.
 */
export function quoiLisible(quoi: string): string {
  const q = quoi.trim().replace(/[.\s]+$/, '');
  const majuscule = (c?: string) => Boolean(c) && c !== c!.toLowerCase();
  const minuscule = (c?: string) => Boolean(c) && c !== c!.toUpperCase();
  return majuscule(q[0]) && minuscule(q[1]) ? q.charAt(0).toLowerCase() + q.slice(1) : q;
}

/** « jeu. 29 oct. », plus l’heure si elle est posée (« jeu. 29 oct. 14:00 »). */
const echeance = (iso: string) => (sansHeure(iso) ? jourCourt(iso) : jourHeure(iso));

/** « à 15:00 » le jour de l’écriture, « le jeu. 29 oct. à 15:00 » un autre jour ; vide le jour même sans heure. */
function momentRappel(pour: string, ecritLe: string): string {
  const h = sansHeure(pour) ? '' : `à ${heure(pour)}`;
  if (memeJour(new Date(pour), new Date(ecritLe))) return h;
  return h ? `le ${jourCourt(pour)} ${h}` : `le ${jourCourt(pour)}`;
}

const quoiDe = (d?: DetailBlocage) => (d?.quoi?.trim() ? quoiLisible(d.quoi) : '');

/** Détail d’un blocage dans une ligne du fil : « sonde lambda · prévue jeu. 29 oct. », « plaquettes avant ». */
function detailFil(b: Blocage, d: DetailBlocage | undefined): string {
  const quoi = quoiDe(d);
  if (b === 'attente_piece') return [quoi, d?.pour ? `prévue ${echeance(d.pour)}` : ''].filter(Boolean).join(' · ');
  return quoi;
}

function texteBlocage(e: Evenement, qui: string): string {
  const b = e.valeur as Blocage | null;
  const avant = (e.avant ?? null) as Blocage | null;
  const d = e.details?.detail;
  // Levée
  if (b === null) {
    if (!avant || !(avant in BLOCAGES)) return `${qui} a débloqué l’intervention`;
    const quoi = avant === 'client_sur_place' ? '' : quoiDe(d);
    const mot: Record<Blocage, string> = {
      attente_piece: 'pièce reçue',
      attente_accord: 'accord reçu',
      rappeler_client: 'client rappelé',
      client_sur_place: 'blocage levé',
    };
    return `${qui} : ${mot[avant]}${quoi ? ` (${quoi})` : ''}`;
  }
  // Précision (même blocage, détail changé)
  if (avant === b) {
    const pourAvant = e.details?.pourAvant;
    if (b === 'attente_piece' && pourAvant && d?.pour && !memeJour(new Date(pourAvant), new Date(d.pour))) {
      const sens = new Date(d.pour).getTime() > new Date(pourAvant).getTime() ? 'repoussée' : 'avancée';
      // Le texte de la pièce (référence, fournisseur) suit : sa modification, faite du même geste, reste tracée.
      const quoi = quoiDe(d);
      return `${qui} : pièce ${sens}, ${jourCourt(pourAvant)} → ${jourCourt(d.pour)}${quoi ? ` · ${quoi}` : ''}`;
    }
    const det =
      b === 'rappeler_client'
        ? [d?.pour ? momentRappel(d.pour, e.creeLe) : '', quoiDe(d)].filter(Boolean).join(' · ')
        : detailFil(b, d);
    return det ? `${qui} a précisé l’attente : ${det}` : `${qui} a précisé l’attente`;
  }
  // Pose (ou remplacement d’un autre blocage)
  const det = b === 'rappeler_client' ? '' : detailFil(b, d);
  switch (b) {
    case 'attente_piece':
      return `${qui} a signalé : attente pièce${det ? ` · ${det}` : ''}`;
    case 'attente_accord':
      return det ? `${qui} a demandé l’accord : ${det}` : `${qui} a demandé l’accord`;
    case 'rappeler_client': {
      const moment = d?.pour ? momentRappel(d.pour, e.creeLe) : '';
      const quoi = quoiDe(d);
      return `${qui} : client à rappeler${moment ? ` ${moment}` : ''}${quoi ? ` · ${quoi}` : ''}`;
    }
    case 'client_sur_place':
      return `${qui} a signalé : client sur place`;
    default:
      return `${qui} a signalé : ${BLOCAGES[b as Blocage]?.label ?? b}`;
  }
}

/**
 * Texte d’un événement dans le fil de l’équipe : prénom de l’auteur
 * (« Garage » s’il est absent), dates absolues. Exemples exacts :
 * - statut : « Elias a passé en « Véhicule reçu » » ; retour : « Elias est
 *   revenu à « En cours » » ; « Elias : pas encore arrivé » ; « Simon a
 *   annulé la livraison » ; « Simon a annulé l’intervention (client non venu) » ;
 * - blocage : « Elias a signalé : attente pièce · sonde lambda · prévue jeu.
 *   29 oct. » ; « Elias a demandé l’accord : plaquettes avant » ; « Elias :
 *   client à rappeler à 15:00 · devis » ; « Adrien : pièce repoussée, jeu.
 *   29 oct. → lun. 2 nov. » ; « Adrien a précisé l’attente : sonde lambda » ;
 *   « Adrien : pièce reçue (sonde lambda) » ; « Adrien : client rappelé » ;
 * - devis : « Adrien a envoyé le devis au client » ;
 * - accord : « Accord de Manon Lefèvre par téléphone, reçu par Adrien à 11:05 » ;
 * - montant : « Clara a modifié le montant : 389 € → 520 € », chiffres
 *   seulement avec `o.voirPrix` (sinon « Clara a modifié le montant ») ; le
 *   fil n’affiche cette ligne qu’avec `voirPrix` (le serveur la refuse aux autres) ;
 * - déplacement : « Simon a déplacé le rendez-vous : jeu. 29 oct. 08:30 → mar. 3 nov. 08:30 » ;
 * - retour prévu : « Adrien a fixé le retour prévu : jeu. 29 oct. 17:00 » ;
 *   « Simon : retour prévu repoussé, jeu. 29 oct. 17:00 → ven. 30 oct. 17:00 » ;
 *   « Adrien a retiré le retour prévu » ;
 * - prévenu : « Adrien a prévenu le client par téléphone » ; « Adrien :
 *   répondeur, client à rappeler » ;
 * - affectation, SMS, création : textes v2a.
 */
export function texteEvenement(
  e: Evenement,
  membres: Pick<Membre, 'id' | 'prenom' | 'nom'>[],
  o?: { voirPrix?: boolean },
): string {
  const parId = new Map(membres.map((m) => [m.id, m]));
  const prenom = e.membreId ? parId.get(e.membreId)?.prenom ?? null : null;
  const qui = prenom ?? 'Garage';
  switch (e.type) {
    case 'creation': {
      const origine = e.valeur as Origine | null;
      const via = origine && ORIGINES[origine] ? ORIGINES[origine].label : null;
      if (prenom) return via ? `${prenom} a créé la fiche · ${via}` : `${prenom} a créé la fiche`;
      if (origine === 'ia') return 'Fiche créée par le réceptionniste';
      if (origine === 'site') return 'Demande reçue depuis le site internet';
      return via ? `Fiche créée · ${via}` : 'Fiche créée';
    }
    case 'statut': {
      const vers = e.valeur as Statut | null;
      const de = (e.avant ?? null) as Statut | null;
      const label = vers && STATUTS[vers] ? STATUTS[vers].label : e.valeur ?? '?';
      if (vers === 'annule') {
        if (de === 'a_valider') return `${qui} a ignoré la demande`;
        const motif = e.details?.motif;
        return `${qui} a annulé l’intervention${motif && MOTIFS_ANNULATION[motif] ? ` (${MOTIFS_ANNULATION[motif].fil})` : ''}`;
      }
      if (e.details?.livraisonAnnulee || (de === 'livre' && vers === 'termine')) return `${qui} a annulé la livraison`;
      if (de === 'recu' && vers === 'planifie') return `${qui} : pas encore arrivé`;
      if (de && vers && estRetourArriere(de, vers)) return `${qui} est revenu à « ${label} »`;
      return `${qui} a passé en « ${label} »`;
    }
    case 'blocage':
      return texteBlocage(e, qui);
    case 'devis':
      return `${qui} a envoyé le devis au client`;
    case 'accord': {
      const de = e.details?.de?.trim();
      const canal = e.details?.canal ?? (e.valeur as CanalAccord | null);
      const comment = canal && CANAUX_ACCORD[canal] ? ` ${CANAUX_ACCORD[canal].phrase}` : '';
      const recu = prenom ? `, reçu par ${prenom} à ${heure(e.creeLe)}` : `, reçu à ${heure(e.creeLe)}`;
      return `Accord${de ? ` ${dePrenom(de)}` : ''}${comment}${recu}`;
    }
    case 'montant': {
      if (!o?.voirPrix) return `${qui} a modifié le montant`;
      const av = e.details?.montantAvant;
      const ap = e.details?.montantApres;
      if (av == null && ap != null) return `${qui} a fixé le montant : ${euros(ap)}`;
      if (av != null && ap == null) return `${qui} a retiré le montant (${euros(av)})`;
      return `${qui} a modifié le montant : ${euros(av ?? undefined)} → ${euros(ap ?? undefined)}`;
    }
    case 'deplacement': {
      if (!e.valeur) return `${qui} a déplacé le rendez-vous`;
      return e.avant
        ? `${qui} a déplacé le rendez-vous : ${jourHeure(e.avant)} → ${jourHeure(e.valeur)}`
        : `${qui} a déplacé le rendez-vous : ${jourHeure(e.valeur)}`;
    }
    case 'retour_prevu':
      // Un retour déjà prévu qui change (à la main, ou avec le rendez-vous déplacé) se lit « de → à » : pas de choix prêté à l’auteur.
      if (!e.valeur) return `${qui} a retiré le retour prévu`;
      if (!e.avant) return `${qui} a fixé le retour prévu : ${echeance(e.valeur)}`;
      return `${qui} : retour prévu ${new Date(e.valeur).getTime() > new Date(e.avant).getTime() ? 'repoussé' : 'avancé'}, ${echeance(e.avant)} → ${echeance(e.valeur)}`;
    case 'prevenu':
      if (e.valeur === 'repondeur') return `${qui} : répondeur, client à rappeler`;
      return e.valeur === 'sms' ? `${qui} a prévenu le client par SMS` : `${qui} a prévenu le client par téléphone`;
    case 'affectation': {
      const quiV2a = prenom ?? 'Le garage';
      if (!e.valeur) return `${quiV2a} a retiré l’attribution`;
      const cible = parId.get(e.valeur);
      return `${quiV2a} a attribué à ${cible ? `${cible.prenom} ${cible.nom}` : 'un membre'}`;
    }
    case 'sms':
      return `${prenom ?? 'Le garage'} a envoyé le SMS « Véhicule prêt »`;
    default:
      return qui;
  }
}
