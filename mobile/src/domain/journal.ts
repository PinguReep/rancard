/**
 * Règles du journal (v2c) : ce qu’une écriture sur une intervention produit
 * (événements, notes automatiques lues par le client, étapes masquées,
 * notifications d’équipe, kilométrage du véhicule), ce qu’elle a le droit de
 * faire (refus R1 à R18) et comment « Annuler » la défait (J14).
 *
 * Même spécification que les triggers de supabase/migrations/0014_atelier.sql :
 * le dépôt démo applique ces fonctions, la base applique le SQL, les messages
 * d’erreur sont identiques au caractère près.
 *
 * Fonctions pures : l’heure arrive par `ctx.maintenant`, les identifiants par
 * `ctx.nouvelId` (par défaut : préfixe, horodatage, hasard). Aucun import de
 * data/, state/ ni React.
 *
 * Chemin d’une écriture (dépôt démo) : `ecrire(avant, apres, ctx)`, qui
 * enchaîne `verifier` (sur l’écriture brute, comme le trigger « avant » qui
 * refuse avant de normaliser), `normaliser` puis `consequences`.
 */

import { heure, jourCourt, jourHeure, memeJour, voiture } from '@/lib/format';

import { FENETRE_RETRAIT_NOTE_MIN, estGerant, permissionsDe } from './permissions';
import {
  CANAUX_ACCORD,
  DE_MAX,
  KM_MAX,
  LISTE_CANAUX_ACCORD,
  PHRASE_PLUS_PRET,
  QUOI_MAX,
  STATUTS,
  comparerEvenements,
  estRetourArriere,
  peutPasser,
  phraseAnnulation,
  rangStatut,
} from './statuts';
import type {
  Accord,
  Blocage,
  CanalAccord,
  Commentaire,
  DetailBlocage,
  DetailsEvenement,
  Evenement,
  Intervention,
  Membre,
  Notification,
  Prevenu,
  Statut,
  TypeEvenement,
  TypeNotification,
  Vehicule,
} from './types';

// ───────────────────────────────────────────────────────────── Constantes

/** Marge serveur de « Annuler » : l’avis dure 8 s, la latence réseau est absorbée. */
export const FENETRE_ANNULATION_S = 30;
/** Une précision de blocage par le même auteur complète la notification de la pose pendant ce temps. */
export const FENETRE_PRECISION_S = 120;
/** Une note visible du client se retire pendant ce temps (P1). */
export { FENETRE_RETRAIT_NOTE_MIN };

/** Messages des refus R1 à R14 et R16 à R18 (identiques en SQL). */
export const REFUS = {
  R1: 'Remettre la voiture au client demande la permission « Voir les montants ».',
  R2: 'Annuler une intervention demande la permission « Créer des interventions ».',
  R3: 'Seul un gérant peut annuler une livraison, et seulement le jour même.',
  R4: 'Notez l’accord du client avant de lever l’attente.',
  R5: 'L’accord se note par « Accord reçu ».',
  R6: 'Le client est prévenu une fois la voiture prête.',
  R7: 'Trop tard pour retirer cette note de la page du client.',
  R8: 'Une phrase automatique ne se retire pas : utilisez « Annuler » juste après le geste.',
  R9: 'Une note retirée ne se republie pas : écrivez-en une nouvelle.',
  R10: 'Cette voiture n’attend plus d’accord.',
  R11: 'Indiquez qui a donné son accord.',
  R12: 'Indiquez comment l’accord a été donné.',
  R13: 'Le devis se signale pendant une attente d’accord.',
  R14: 'Kilométrage invalide.',
  /** Transition absente de l’app : un écran resté sur l’état d’avant le geste d’un collègue. */
  R16: 'Déjà modifié par un collègue.',
  /** Motif d’une fiche annulée réécrit après coup (la page du client en dépend). */
  R17: 'Le motif se choisit en annulant l’intervention.',
  /** Reprogrammer une fiche annulée, comme l’annuler, demande « Créer des interventions ». */
  R18: 'Reprogrammer une intervention demande la permission « Créer des interventions ».',
  /** Retrait d’une note par un autre que son auteur ou un gérant (RLS côté serveur : 0 ligne touchée). */
  RETRAIT_AUTEUR: 'Seul l’auteur de la note ou un gérant peut la retirer.',
  /** Montant d’un accord négatif ou illisible. */
  MONTANT: 'Montant invalide.',
} as const;

/** Messages de « Annuler » (J14, identiques en SQL). */
export const ANNULATION = {
  rien: 'Rien à annuler.',
  pasIci: 'Ce changement ne s’annule pas ici.',
  collegue: 'Déjà modifié par un collègue.',
  tard: 'Trop tard pour annuler.',
} as const;

// ───────────────────────────────────────────────────────────── Contrat

export type ContexteJournal = {
  auteur: Membre | null;
  membres: Membre[];
  vehicule?: Vehicule;
  /** Relevés au dépôt des autres interventions du véhicule (J12 : faute de frappe corrigée) */
  kmAutres?: number[];
  /** Événements existants de l’intervention, du plus ancien au plus récent */
  evenements: Evenement[];
  /** Notes existantes de l’intervention */
  commentaires: Commentaire[];
  /** Notifications existantes (complétées par une précision, J4) */
  notifications: Notification[];
  maintenant: Date;
  /** Écriture faite par noterAccord (J6) ou par l’annulation (J14) */
  mode?: 'accord' | 'annulation';
  /**
   * Le garage a la prestation « Relances SMS » : N7 ne parle du SMS « prêt »
   * de Rencar qu’avec elle (sans elle, seulement du message écrit depuis le
   * téléphone, tracé par « prévenu » par SMS).
   */
  relancesSms?: boolean;
  /** Fabrique d’identifiants (« e » événement, « k » note, « n » notification) */
  nouvelId?: (prefixe: string) => string;
};

export type Consequences = {
  /** À ajouter, dans l’ordre de RANG_EVENEMENT */
  evenements: Evenement[];
  /** Notes automatiques à ajouter (liées par evenementId) */
  commentaires: Commentaire[];
  /** Étapes devenues fausses à retirer de la page du client (visibleClient → false) */
  masquer: { evenements: string[]; commentaires: string[] };
  /** À ajouter (liées par evenementId) */
  notifications: Notification[];
  /** Notifications de la pose dont le détail change (précision, J4) */
  notificationsCompletees: { id: string; detail: string }[];
  /** Nouveau kilométrage du véhicule (J12) ; null : plus aucun relevé */
  vehiculeKm?: number | null;
};

export type Annulation = {
  /** État rétabli, à écrire tel quel (mode « annulation » : rien n’est normalisé) */
  apres: Intervention;
  /** Événement à supprimer, avec sa note automatique et ses notifications (evenementId) */
  supprimer: string;
  /** Étapes masquées par le changement, à rendre de nouveau visibles du client */
  reafficher: { evenements: string[]; commentaires: string[] };
  /** Note visible du client à publier, signée du membre et non liée (Prêt annulé après un SMS « prêt ») */
  noteClient?: string;
  resultat: { statut: Statut; blocage: Blocage | null; smsParti: boolean };
};

// ───────────────────────────────────────────────────────────── Aides

const idParDefaut = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const temps = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** Deux instants égaux (ou tous deux absents) : « 2026-10-27T10:00:00.000Z » et « …+00:00 » se valent. */
function memeInstant(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return !a && !b;
  return temps(a) === temps(b);
}

const egalNombre = (a?: number | null, b?: number | null) => (a ?? null) === (b ?? null);

function memeDetail(a?: DetailBlocage | null, b?: DetailBlocage | null): boolean {
  return (
    (a?.quoi ?? '') === (b?.quoi ?? '') && memeInstant(a?.pour, b?.pour) && Boolean(a?.annonce && a.pour) === Boolean(b?.annonce && b.pour)
  );
}

function memeAccord(a?: Accord | null, b?: Accord | null): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.de === b.de &&
    a.canal === b.canal &&
    memeInstant(a.le, b.le) &&
    (a.par ?? null) === (b.par ?? null) &&
    egalNombre(a.montantAvant, b.montantAvant) &&
    egalNombre(a.montantApres, b.montantApres)
  );
}

/** Le client prévenu a changé : canal nouveau (comme le trigger, qui ne voit que `prevenu_canal`). */
const prevenuChange = (a?: Prevenu | null, b?: Prevenu | null) => Boolean(b) && b!.canal !== a?.canal;

/** Détail propre (trigger « avant ») : quoi coupé à QUOI_MAX après trim, vide absent, annonce seulement avec une date. */
export function nettoyerDetail(d?: DetailBlocage | null): DetailBlocage | undefined {
  if (!d) return undefined;
  const quoi = (d.quoi ?? '').trim().slice(0, QUOI_MAX).trim();
  const pour = d.pour || undefined;
  if (!quoi && !pour) return undefined;
  const r: DetailBlocage = {};
  if (quoi) r.quoi = quoi;
  if (pour) r.pour = pour;
  if (d.annonce && pour) r.annonce = true;
  return r;
}

/** Kilométrage acceptable : entier de 0 à KM_MAX. */
export const kmValide = (km: number) => Number.isInteger(km) && km >= 0 && km <= KM_MAX;

const membresActifs = (ctx: ContexteJournal, sauf: string | null) =>
  ctx.membres.filter((m) => m.actif && !m.invitationEnAttente && m.id !== sauf);

const evenementsDe = (ctx: ContexteJournal, interventionId: string) =>
  ctx.evenements.filter((e) => e.interventionId === interventionId).sort(comparerEvenements);

/** Date du dernier passage dans ce statut. */
function dernierPassage(evs: Evenement[], s: Statut): string | null {
  let d: string | null = null;
  for (const e of evs) if (e.type === 'statut' && e.valeur === s && (!d || temps(e.creeLe) > temps(d))) d = e.creeLe;
  return d;
}

/**
 * Un SMS « prêt » est parti depuis le dernier passage en « Véhicule prêt »
 * (sans passage tracé, données importées : n’importe quel SMS, comme
 * `sms_pret_parti`).
 */
export function smsPretPartiDans(evs: Evenement[], interventionId?: string): boolean {
  const liste = interventionId ? evs.filter((e) => e.interventionId === interventionId) : evs;
  // Une livraison annulée n’est pas un nouveau passage en « Véhicule prêt » : le SMS d’avant compte (comme le SQL).
  const pret = dernierPassage(liste.filter((e) => !e.details?.livraisonAnnulee), 'termine');
  const depuis = pret ? temps(pret) : -Infinity;
  // SMS de Rencar, ou message écrit depuis l’app SMS du téléphone (« prévenu » par SMS).
  return liste.some((e) => (e.type === 'sms' || (e.type === 'prevenu' && e.valeur === 'sms')) && temps(e.creeLe) >= depuis);
}

// ───────────────────────────────────────────────────────────── Refus

/**
 * Refus R1 à R6, R13, R14 et R16 d’une écriture sur une intervention : lève une
 * Error au message exact du tableau. À appeler sur l’écriture brute (avant
 * `normaliser`), comme le trigger « avant ». Sans auteur (import, service)
 * ou en mode « annulation », seul R14 (contrainte du schéma) s’applique.
 */
export function verifier(avant: Intervention, apres: Intervention, ctx: ContexteJournal): void {
  if (apres.kmDepot != null && !egalNombre(avant.kmDepot, apres.kmDepot) && !kmValide(apres.kmDepot)) throw new Error(REFUS.R14);
  if (!ctx.auteur || ctx.mode === 'annulation') return;
  const p = permissionsDe(ctx.auteur);
  const statutChange = avant.statut !== apres.statut;

  // R1, R2, R3 : statuts réservés
  if (statutChange && apres.statut === 'livre' && !p.voirPrix) throw new Error(REFUS.R1);
  if (statutChange && apres.statut === 'annule' && !(p.creer || (p.appels && avant.statut === 'a_valider'))) {
    throw new Error(REFUS.R2);
  }
  if (statutChange && avant.statut === 'annule' && !p.creer) throw new Error(REFUS.R18);
  if (statutChange && avant.statut === 'livre') {
    const livreLe = dernierPassage(evenementsDe(ctx, avant.id), 'livre');
    if (!estGerant(ctx.auteur) || !livreLe || !memeJour(new Date(livreLe), ctx.maintenant)) throw new Error(REFUS.R3);
  }
  // R16 : seules les transitions de l’app (plus Livré → Prêt sous R3), comme `transition_permise` en SQL.
  if (statutChange && avant.statut !== 'livre' && !peutPasser(avant.statut, apres.statut)) throw new Error(REFUS.R16);

  // R4, R5 : l’attente d’accord ne se lève que par « Accord reçu » (l’annulation de l’intervention reste permise)
  if (
    avant.blocage === 'attente_accord' &&
    ctx.mode !== 'accord' &&
    apres.statut !== 'annule' &&
    (apres.blocage !== 'attente_accord' || apres.statut === 'termine' || apres.statut === 'livre')
  ) {
    throw new Error(REFUS.R4);
  }
  if (ctx.mode !== 'accord' && !memeAccord(avant.dernierAccord, apres.dernierAccord)) throw new Error(REFUS.R5);

  // R6 : client prévenu (appel, répondeur) seulement une fois la voiture prête
  if (prevenuChange(avant.prevenu, apres.prevenu) && apres.statut !== 'termine') throw new Error(REFUS.R6);

  // R13 : devis seulement pendant une attente d’accord
  if (apres.devisEnvoyeLe && !avant.devisEnvoyeLe && apres.blocage !== 'attente_accord') throw new Error(REFUS.R13);

  // R17 : le motif se choisit avec l’annulation, il ne se réécrit pas ensuite
  if (!statutChange && avant.statut === 'annule' && (apres.motifAnnulation ?? null) !== (avant.motifAnnulation ?? null)) {
    throw new Error(REFUS.R17);
  }
}

/** Refus R10 à R12 (et montant) de « Accord reçu ». */
export function verifierAccord(i: Pick<Intervention, 'blocage'>, a: { de: string; canal: CanalAccord; montant?: number }): void {
  if (i.blocage !== 'attente_accord') throw new Error(REFUS.R10);
  if (!a.de || !a.de.trim()) throw new Error(REFUS.R11);
  if (!LISTE_CANAUX_ACCORD.includes(a.canal)) throw new Error(REFUS.R12);
  if (a.montant != null && !(Number.isFinite(a.montant) && a.montant >= 0)) throw new Error(REFUS.MONTANT);
}

/**
 * Écriture de « Accord reçu » (RPC `noter_accord`) : colonnes d’accord,
 * montant seulement avec `voirPrix` (sinon ignoré), levée. À passer à
 * `ecrire(i, …, { …ctx, mode: 'accord' })`, qui produit accord, montant et
 * levée (J6) puis N6.
 */
export function appliquerAccord(
  i: Intervention,
  a: { de: string; canal: CanalAccord; montant?: number },
  auteur: Membre | null,
  maintenant: Date,
): Intervention {
  verifierAccord(i, a);
  const voirPrix = auteur ? permissionsDe(auteur).voirPrix : false;
  const montant = voirPrix && a.montant != null ? a.montant : i.montantEstime;
  const accord: Accord = { de: a.de.trim().slice(0, DE_MAX).trim(), canal: a.canal, le: maintenant.toISOString(), par: auteur?.id ?? null };
  if (i.montantEstime != null) accord.montantAvant = i.montantEstime;
  if (montant != null) accord.montantApres = montant;
  return { ...i, dernierAccord: accord, montantEstime: montant, blocage: null };
}

/**
 * Refus du retrait d’une note de la page du client (P1), dans l’ordre :
 * auteur ou gérant, R8 (phrase automatique), R7 (plus de 10 minutes).
 * `null` : le retrait est permis. Une note d’équipe ou déjà retirée n’a
 * rien à retirer (`false` de `aRetirer`).
 */
export function refusRetraitNote(c: Commentaire, auteur: Pick<Membre, 'id' | 'role'> | null, maintenant: Date): string | null {
  if (!auteur || (c.auteurId !== auteur.id && !estGerant(auteur))) return REFUS.RETRAIT_AUTEUR;
  if (c.evenementId || c.automatique) return REFUS.R8;
  if (maintenant.getTime() - temps(c.creeLe) >= FENETRE_RETRAIT_NOTE_MIN * 60_000) return REFUS.R7;
  return null;
}

/** La note est encore sur la page du client (visible, jamais retirée). */
export const aRetirer = (c: Pick<Commentaire, 'visibleClient' | 'retireeLe'>) => c.visibleClient && !c.retireeLe;

/** R9 : une note retirée ne redevient pas visible du client. */
export function verifierRepublication(avant: Pick<Commentaire, 'retireeLe'>, apres: Pick<Commentaire, 'visibleClient'>): void {
  if (avant.retireeLe && apres.visibleClient) throw new Error(REFUS.R9);
}

// ───────────────────────────────────────────────────────────── Normalisation

/**
 * Normalise l’écriture comme le trigger « avant » : blocage effacé vers
 * Prêt, Livré, Annulé ; sans blocage, détail et devis effacés ; blocage
 * changé sans détail fourni dans la même écriture, détail effacé ; détail
 * nettoyé (`nettoyerDetail`) ; devis effacé hors attente d’accord et daté
 * de maintenant quand il est posé ; client prévenu daté et signé quand il
 * change, effacé en quittant « Prêt » ; motif effacé hors « Annulé ». En
 * mode « annulation », rien n’est réécrit.
 */
export function normaliser(avant: Intervention, apres: Intervention, ctx: ContexteJournal): Intervention {
  const n: Intervention = { ...apres };
  if (ctx.mode === 'annulation') return n;
  const t = ctx.maintenant.toISOString();

  if (n.statut === 'termine' || n.statut === 'livre' || n.statut === 'annule') n.blocage = null;
  if (!n.blocage) {
    delete n.detailBlocage;
    delete n.devisEnvoyeLe;
  } else {
    if (n.blocage !== avant.blocage && memeDetail(n.detailBlocage, avant.detailBlocage)) delete n.detailBlocage;
    const d = nettoyerDetail(n.detailBlocage);
    if (d) n.detailBlocage = d;
    else delete n.detailBlocage;
    if (n.blocage !== 'attente_accord') delete n.devisEnvoyeLe;
    else if (n.devisEnvoyeLe && !avant.devisEnvoyeLe) n.devisEnvoyeLe = t;
  }

  if (avant.statut === 'termine' && n.statut !== 'termine') delete n.prevenu;
  else if (n.prevenu && prevenuChange(avant.prevenu, n.prevenu)) n.prevenu = { canal: n.prevenu.canal, le: t, par: ctx.auteur?.id ?? null };
  else if (n.prevenu && avant.prevenu) n.prevenu = avant.prevenu;
  else if (!n.prevenu) delete n.prevenu;

  if (n.statut !== 'annule') delete n.motifAnnulation;
  return avecKmVehiculeAvant(avant, n, ctx);
}

/**
 * J12 : kilométrage du véhicule au moment du relevé, pour le lui rendre si
 * le relevé est corrigé ou retiré (comme `km_vehicule_avant` en SQL). Quand
 * le relevé corrigé était celui du véhicule, la valeur d’avant ce relevé
 * est gardée. `avant` nul : création.
 */
function avecKmVehiculeAvant(avant: Intervention | null, n: Intervention, ctx: ContexteJournal): Intervention {
  if (avant && egalNombre(avant.kmDepot, n.kmDepot)) {
    if (avant.kmVehiculeAvant === undefined) delete n.kmVehiculeAvant;
    else n.kmVehiculeAvant = avant.kmVehiculeAvant;
    return n;
  }
  const kmVehicule = ctx.vehicule?.km ?? null;
  if (avant?.kmDepot != null && kmVehicule === avant.kmDepot) {
    if (avant.kmVehiculeAvant === undefined) delete n.kmVehiculeAvant;
    else n.kmVehiculeAvant = avant.kmVehiculeAvant;
  } else if (n.kmDepot != null) n.kmVehiculeAvant = kmVehicule;
  else if (avant && avant.kmVehiculeAvant !== undefined) n.kmVehiculeAvant = avant.kmVehiculeAvant;
  else delete n.kmVehiculeAvant;
  return n;
}

// ───────────────────────────────────────────────────────────── Notifications (N1 à N7)

const nomDe = (ctx: ContexteJournal, id: string | null) => (id ? ctx.membres.find((m) => m.id === id)?.prenom?.trim() || null : null);

/** « Par téléphone », « Sur place », « Par SMS », « Par e-mail » */
const canalMajuscule = (c: CanalAccord) => {
  const p = CANAUX_ACCORD[c]?.phrase ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1);
};

const joindre = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** « par Elias à 10:40 » (rien sans auteur) */
const parA = (prenom: string | null, le: string) => (prenom ? `par ${prenom} à ${heure(le)}` : '');

/** « Rappel promis à 15:00 » le jour même, « Rappel promis le mer. 28 oct. 15:00 » un autre jour (comme `atelier_detail_pose`). */
function rappelPromis(pour: string, le: string): string {
  if (memeJour(new Date(pour), new Date(le))) return `Rappel promis à ${heure(pour)}`;
  return `Rappel promis le ${jourHeure(pour)}`;
}

/**
 * Détail des notifications de pose (N2 à N4), recalculé quand la précision
 * suit la pose (J4) : « Sonde lambda · prévue mer. 28 oct. · par Elias à
 * 10:40 », « Plaquettes avant · par Elias à 10:50 », « Rappel promis à
 * 15:00 · par Elias ».
 */
export function detailNotificationPose(b: Blocage, d: DetailBlocage | undefined, prenom: string | null, le: string): string {
  const q = d?.quoi?.trim();
  const quoi = q ? q.charAt(0).toUpperCase() + q.slice(1) : '';
  switch (b) {
    case 'attente_piece':
      return joindre(quoi, d?.pour && `prévue ${jourCourt(d.pour)}`, parA(prenom, le));
    case 'attente_accord':
      return joindre(quoi, parA(prenom, le));
    case 'rappeler_client':
      return joindre(d?.pour && rappelPromis(d.pour, le), prenom && `par ${prenom}`);
    default:
      return joindre(quoi, parA(prenom, le));
  }
}

/**
 * Notifications produites par un événement (une ligne par destinataire :
 * membres actifs, sans invitation en attente, jamais l’auteur ; aucune pour
 * une écriture sans auteur) :
 * - N1 attribution (affectation, ou création attribuée) : « Nouvelle voiture
 *   pour vous », « Volkswagen Polo · Diagnostic électronique · mar. 27
 *   oct. 11:00 · par Simon » ;
 * - N2 à N4 pose d’une attente pièce, d’accord, d’un rappel : membres
 *   `voirTout` et mécanicien attribué ; « Attente pièce : Volkswagen Polo
 *   VII », « Accord à demander : Audi A4 », « Client à rappeler : Peugeot 308 » ;
 * - N5 levée d’une attente pièce ou d’un rappel : mécanicien attribué ;
 *   « Pièce reçue : BMW Série 1 », « Client rappelé : Peugeot 308 »,
 *   « Vous pouvez reprendre · par Adrien à 11:05 » ;
 * - N6 accord noté : mécanicien attribué, plus les membres `voirTout` si
 *   l’auteur n’a pas `voirTout` ; « Accord reçu : Audi A4 », « Par
 *   téléphone · reçu par Elias à 11:20 » ;
 * - N7 retour arrière depuis « Prêt » : membres `voirTout` ; « Plus prête :
 *   Toyota Yaris », « Repassée en « En cours » par Elias à 16:30 · SMS
 *   « prêt » déjà parti » (ou « · aucun SMS envoyé ») ; sans la
 *   prestation « Relances SMS », « · client déjà prévenu par SMS » après un
 *   message écrit depuis le téléphone, sinon rien, comme `evenements_notifier` ;
 * - N8 voiture retirée à son titulaire : l’ancien titulaire ; « Voiture
 *   retirée : Volkswagen Polo », « Diagnostic électronique · confiée à
 *   Adrien · par Simon à 10:05 » (ou « sans mécanicien ») ; sans cible
 *   s’il ne voit pas tout le planning.
 */
export function notificationsPour(e: Evenement, i: Intervention, ctx: ContexteJournal): Notification[] {
  // Écriture sans auteur (import, service) : aucune notification, comme `evenements_notifier`.
  if (!e.membreId) return [];
  const nouvelId = ctx.nouvelId ?? idParDefaut;
  const prenom = nomDe(ctx, e.membreId) ?? 'Garage';
  const v = voiture(ctx.vehicule);
  const actifs = membresActifs(ctx, e.membreId);
  const voirTout = actifs.filter((m) => permissionsDe(m).voirTout);
  const attribue = i.membreId ? actifs.filter((m) => m.id === i.membreId) : [];
  const unis = (...listes: Membre[][]) => {
    const vus = new Set<string>();
    return listes.flat().filter((m) => (vus.has(m.id) ? false : (vus.add(m.id), true)));
  };
  const pour = (dest: Membre[], type: TypeNotification, titre: string, detail: string): Notification[] =>
    dest.map((m) => ({
      id: nouvelId('n'),
      garageId: i.garageId,
      membreId: m.id,
      type,
      titre,
      detail,
      cible: { type: 'intervention', id: i.id },
      lue: false,
      creeLe: e.creeLe,
      evenementId: e.id,
    }));
  const n1 = (dest: Membre[]) =>
    pour(dest, 'equipe', 'Nouvelle voiture pour vous', joindre(v, i.prestation, jourHeure(i.debut), prenom && `par ${prenom}`));

  switch (e.type) {
    case 'creation':
      return i.membreId ? n1(attribue) : [];
    case 'affectation': {
      const nouveau = e.valeur ? n1(actifs.filter((m) => m.id === e.valeur)) : [];
      // N8 : l’ancien titulaire sait qu’on lui a retiré la voiture ; sans « voir tout », la fiche ne
      // lui est plus visible : pas de cible (une notification liée n’est listée qu’avec sa fiche).
      const ancien = e.avant && e.avant !== e.valeur ? actifs.find((m) => m.id === e.avant) : undefined;
      if (!ancien) return nouveau;
      const qui = parA(prenom, e.creeLe);
      const suite = !e.valeur
        ? joindre('sans mécanicien', qui)
        : e.valeur === e.membreId
          ? `reprise ${qui}`
          : joindre(`confiée à ${nomDe(ctx, e.valeur) ?? 'un collègue'}`, qui);
      const [retiree] = pour([ancien], 'equipe', `Voiture retirée : ${v}`, joindre(i.prestation, suite));
      if (!permissionsDe(ancien).voirTout) delete retiree.cible;
      return [...nouveau, retiree];
    }
    case 'blocage': {
      const b = e.valeur as Blocage | null;
      const avant = (e.avant ?? null) as Blocage | null;
      if (b && b !== avant) {
        const dest = unis(voirTout, attribue);
        const detail = detailNotificationPose(b, e.details?.detail, prenom, e.creeLe);
        if (b === 'attente_piece') return pour(dest, 'piece', `Attente pièce : ${v}`, detail);
        if (b === 'attente_accord') return pour(dest, 'accord', `Accord à demander : ${v}`, detail);
        if (b === 'rappeler_client') return pour(dest, 'equipe', `Client à rappeler : ${v}`, detail);
        return [];
      }
      if (!b && avant === 'attente_piece') return pour(attribue, 'piece', `Pièce reçue : ${v}`, joindre('Vous pouvez reprendre', parA(prenom, e.creeLe)));
      if (!b && avant === 'rappeler_client') return pour(attribue, 'equipe', `Client rappelé : ${v}`, joindre('Vous pouvez reprendre', parA(prenom, e.creeLe)));
      return [];
    }
    case 'accord': {
      const auteur = e.membreId ? ctx.membres.find((m) => m.id === e.membreId) : undefined;
      const dest = auteur && permissionsDe(auteur).voirTout ? attribue : unis(attribue, voirTout);
      const canal = (e.details?.canal ?? e.valeur) as CanalAccord | null;
      const recu = prenom ? `reçu par ${prenom} à ${heure(e.creeLe)}` : `reçu à ${heure(e.creeLe)}`;
      return pour(dest, 'accord', `Accord reçu : ${v}`, joindre(canal && CANAUX_ACCORD[canal] && canalMajuscule(canal), recu));
    }
    case 'statut': {
      const de = (e.avant ?? null) as Statut | null;
      const vers = e.valeur as Statut | null;
      if (de !== 'termine' || !vers || !estRetourArriere(de, vers)) return [];
      const qui = prenom ? ` par ${prenom}` : '';
      // Sans la prestation, seul le message écrit depuis le téléphone (« prévenu » par SMS) est connu.
      const sms = !ctx.relancesSms
        ? e.details?.retour
          ? ' · client déjà prévenu par SMS'
          : ''
        : e.details?.retour
          ? ' · SMS « prêt » déjà parti'
          : ' · aucun SMS envoyé';
      return pour(voirTout, 'equipe', `Plus prête : ${v}`, `Repassée en « ${STATUTS[vers].label} »${qui} à ${heure(e.creeLe)}${sms}`);
    }
    default:
      return [];
  }
}

// ───────────────────────────────────────────────────────────── Conséquences (J1 à J13)

/**
 * Événements, notes automatiques, masquages, notifications et kilométrage
 * produits par une écriture (`apres` déjà normalisée ; `avant` nul pour une
 * création). Règles J1 à J13 de la spécification, dans l’ordre de
 * RANG_EVENEMENT :
 * - J1 statut : événement `statut` (valeur, avant) ; « À valider » → annulé :
 *   non visible, sans note ; annulation : note `phraseAnnulation(motif)` ;
 *   retour depuis « Prêt » après un SMS « prêt » : visible, `retour`, note
 *   `PHRASE_PLUS_PRET` ; autre retour arrière : non visible, sans note, et
 *   les étapes de rang supérieur (et leurs notes) sont masquées ; sinon note
 *   `STATUTS[vers].client`. `blocageAvant`, `prevenuAvant`, `livraisonAnnulee`.
 * - J6 accord (mode « accord ») puis J7 montant, puis la levée J3.
 * - J2 pose, J3 levée (le statut inchangé), J4 précision (complète les
 *   notifications de la pose du même auteur dans les 120 s).
 * - J5 devis, J9 déplacement (« À valider », « Planifié »), J10 retour
 *   prévu, J11 client prévenu, J8 affectation, J12 kilométrage, J13 création.
 */
export function consequences(avant: Intervention | null, apres: Intervention, ctx: ContexteJournal): Consequences {
  const r: Consequences = {
    evenements: [],
    commentaires: [],
    masquer: { evenements: [], commentaires: [] },
    notifications: [],
    notificationsCompletees: [],
  };
  const nouvelId = ctx.nouvelId ?? idParDefaut;
  const t = ctx.maintenant.toISOString();
  const auteurId = ctx.auteur?.id ?? null;
  const evs = evenementsDe(ctx, apres.id);

  const ev = (
    type: TypeEvenement,
    valeur: string | null,
    o: { avant?: string | null; visible?: boolean; details?: DetailsEvenement } = {},
  ): Evenement => {
    const e: Evenement = { id: nouvelId('e'), interventionId: apres.id, membreId: auteurId, type, valeur, creeLe: t };
    if ('avant' in o) e.avant = o.avant ?? null;
    if (o.visible !== undefined) e.visibleClient = o.visible;
    if (o.details && Object.keys(o.details).length) e.details = o.details;
    r.evenements.push(e);
    r.notifications.push(...notificationsPour(e, apres, ctx));
    return e;
  };
  const noteAuto = (e: Evenement, texte: string) =>
    r.commentaires.push({
      id: nouvelId('k'),
      interventionId: apres.id,
      auteurId,
      auteurNom: ctx.auteur?.prenom ?? 'Garage',
      texte,
      visibleClient: true,
      photos: [],
      creeLe: t,
      evenementId: e.id,
    });
  // J12 : le plus grand relevé. Quand le relevé corrigé était celui du véhicule (un zéro de trop),
  // le véhicule reprend le plus grand relevé de ses interventions, celui-ci compris (comme le SQL).
  const kmVehicule = () => {
    const km = apres.kmDepot;
    if (avant?.kmDepot != null && ctx.vehicule?.km != null && ctx.vehicule.km === avant.kmDepot) {
      // Sans descendre sous le kilométrage du véhicule d’avant ce relevé (relevé fautif retiré).
      const releves = [...(ctx.kmAutres ?? []), ...(km != null && kmValide(km) ? [km] : []), ...(apres.kmVehiculeAvant != null ? [apres.kmVehiculeAvant] : [])];
      r.vehiculeKm = releves.length ? Math.max(...releves) : null;
      return;
    }
    if (km == null || !kmValide(km)) return;
    if (ctx.vehicule?.km == null || km > ctx.vehicule.km) r.vehiculeKm = km;
  };

  // J13 · création
  if (!avant) {
    ev('creation', apres.origine);
    kmVehicule();
    return r;
  }

  // J1 · statut
  const statutChange = avant.statut !== apres.statut;
  if (statutChange) {
    const de = avant.statut;
    const vers = apres.statut;
    const details: DetailsEvenement = {};
    if (avant.blocage && !apres.blocage) {
      details.blocageAvant = { blocage: avant.blocage };
      if (avant.detailBlocage) details.blocageAvant.detail = avant.detailBlocage;
      if (avant.devisEnvoyeLe) details.blocageAvant.devisEnvoyeLe = avant.devisEnvoyeLe;
    }
    if (de === 'termine' && avant.prevenu) details.prevenuAvant = avant.prevenu;
    if (de === 'livre' && vers === 'termine') details.livraisonAnnulee = true;

    let visible = true;
    let note: string | null = null;
    if (vers === 'annule') {
      if (apres.motifAnnulation) details.motif = apres.motifAnnulation;
      if (de === 'a_valider') visible = false;
      else note = phraseAnnulation(apres.motifAnnulation);
    } else if (estRetourArriere(de, vers)) {
      if (de === 'termine' && smsPretPartiDans(evs)) {
        details.retour = true;
        note = PHRASE_PLUS_PRET;
      } else {
        visible = false;
        const masques = masquesPour(vers, evs, ctx.commentaires.filter((c) => c.interventionId === apres.id));
        if (masques.evenements.length || masques.commentaires.length) {
          details.masques = masques;
          r.masquer = masques;
        }
      }
    } else {
      note = STATUTS[vers].client;
    }
    const e = ev('statut', vers, { avant: de, visible, details });
    if (note) noteAuto(e, note);
  }

  // J6 · accord
  if (!memeAccord(avant.dernierAccord, apres.dernierAccord) && apres.dernierAccord) {
    const a = apres.dernierAccord;
    ev('accord', a.canal, { visible: false, details: { de: a.de, canal: a.canal } });
  }

  // J7 · montant (lisible des seuls voirPrix)
  if (!egalNombre(avant.montantEstime, apres.montantEstime)) {
    ev('montant', null, {
      visible: false,
      details: { montantAvant: avant.montantEstime ?? null, montantApres: apres.montantEstime ?? null },
    });
  }

  // J2, J3, J4 · blocage (pas d’événement de levée quand le statut change dans la même écriture)
  if (!statutChange) {
    const b = apres.blocage;
    const bAvant = avant.blocage;
    if (b && b !== bAvant) {
      const details: DetailsEvenement = {};
      if (apres.detailBlocage) details.detail = apres.detailBlocage;
      if (bAvant && avant.detailBlocage) details.detailAvant = avant.detailBlocage;
      ev('blocage', b, { avant: bAvant, visible: b !== 'client_sur_place', details });
    } else if (!b && bAvant) {
      const details: DetailsEvenement = {};
      if (avant.detailBlocage) details.detail = avant.detailBlocage;
      if (avant.devisEnvoyeLe) details.devisEnvoyeLe = avant.devisEnvoyeLe;
      ev('blocage', null, { avant: bAvant, visible: bAvant === 'attente_piece' || bAvant === 'attente_accord', details });
    } else if (b && b === bAvant && !memeDetail(avant.detailBlocage, apres.detailBlocage)) {
      const dA = avant.detailBlocage;
      const dN = apres.detailBlocage;
      const details: DetailsEvenement = {};
      if (dN) details.detail = dN;
      if (dA?.pour) details.pourAvant = dA.pour;
      const annonceNouvelle = Boolean(dN?.annonce && dN.pour) && !(dA?.annonce && dA.pour);
      const jourChange = Boolean(dN?.pour) && (!dA?.pour || !memeJour(new Date(dA.pour), new Date(dN!.pour!)));
      const visible = b === 'attente_piece' && Boolean(dN?.annonce && dN.pour) && (jourChange || annonceNouvelle);
      ev('blocage', b, { avant: b, visible, details });
      // La précision qui suit la pose (même auteur, moins de 120 s) complète ses notifications.
      const pose = [...evs].reverse().find((x) => x.type === 'blocage' && x.valeur === b && (x.avant ?? null) !== b);
      if (pose && auteurId && pose.membreId === auteurId && ctx.maintenant.getTime() - temps(pose.creeLe) < FENETRE_PRECISION_S * 1000) {
        const detail = detailNotificationPose(b, dN, nomDe(ctx, pose.membreId), pose.creeLe);
        for (const n of ctx.notifications) if (n.evenementId === pose.id) r.notificationsCompletees.push({ id: n.id, detail });
      }
    }
  }

  // J5 · devis envoyé
  if (apres.devisEnvoyeLe && !avant.devisEnvoyeLe) ev('devis', null, { visible: true });

  // J9 · déplacement (durée seule : rien)
  if (!memeInstant(avant.debut, apres.debut) && (apres.statut === 'a_valider' || apres.statut === 'planifie')) {
    ev('deplacement', apres.debut, { avant: avant.debut, visible: apres.statut === 'planifie' });
  }

  // J10 · retour prévu
  if (!memeInstant(avant.restitutionPrevue, apres.restitutionPrevue)) {
    ev('retour_prevu', apres.restitutionPrevue ?? null, { avant: avant.restitutionPrevue ?? null, visible: false });
  }

  // J11 · client prévenu
  if (apres.prevenu && prevenuChange(avant.prevenu, apres.prevenu)) ev('prevenu', apres.prevenu.canal, { visible: false });

  // J8 · affectation (avant : l’ancien titulaire, prévenu par N8)
  if ((avant.membreId ?? null) !== (apres.membreId ?? null)) ev('affectation', apres.membreId ?? null, { avant: avant.membreId ?? null });

  // J12 · kilométrage au dépôt
  if (!egalNombre(avant.kmDepot, apres.kmDepot)) kmVehicule();

  return r;
}

/**
 * Retour arrière silencieux (J1.d) : chaque étape `statut` visible de rang
 * supérieur à celui de `vers` (annulé exclu), et sa note automatique (par
 * `evenementId` ; pour les lignes antérieures à la v2c, note visible de même
 * horodatage dont le texte est la phrase du statut).
 */
function masquesPour(vers: Statut, evs: Evenement[], commentaires: Commentaire[]): { evenements: string[]; commentaires: string[] } {
  const rv = rangStatut(vers);
  const evenements: string[] = [];
  const notes = new Set<string>();
  if (rv === null) return { evenements, commentaires: [] };
  for (const x of evs) {
    if (x.type !== 'statut' || x.visibleClient === false || !x.valeur) continue;
    const rx = rangStatut(x.valeur as Statut);
    if (rx === null || rx <= rv) continue;
    evenements.push(x.id);
    const phrase = STATUTS[x.valeur as Statut]?.client;
    for (const c of commentaires) {
      if (!c.visibleClient) continue;
      const liee = c.evenementId === x.id;
      const ancienne = !c.evenementId && memeInstant(c.creeLe, x.creeLe) && c.texte === phrase;
      if (liee || ancienne) notes.add(c.id);
    }
  }
  return { evenements, commentaires: [...notes] };
}

/**
 * Chemin complet d’une écriture en démo : refus sur l’écriture brute,
 * normalisation, conséquences. `avant` nul : création (seul R14 s’applique).
 */
export function ecrire(
  avant: Intervention | null,
  apres: Intervention,
  ctx: ContexteJournal,
): { apres: Intervention; consequences: Consequences } {
  if (avant) verifier(avant, apres, ctx);
  else if (apres.kmDepot != null && !kmValide(apres.kmDepot)) throw new Error(REFUS.R14);
  const n = avant ? normaliser(avant, apres, ctx) : avecKmVehiculeAvant(null, { ...apres }, ctx);
  return { apres: n, consequences: consequences(avant, n, ctx) };
}

// ───────────────────────────────────────────────────────────── Annuler (J14)

/**
 * « Annuler » le dernier changement : le dernier événement `statut` ou
 * `blocage` de l’intervention, s’il s’agit d’un changement de statut, d’une
 * levée ou d’une pose (pas d’une précision). Conditions, dans l’ordre
 * (sinon Error, message exact) :
 * 1. il existe (« Rien à annuler. ») et c’est un statut, une levée ou une
 *    pose (« Ce changement ne s’annule pas ici. ») ;
 * 2. son auteur est le membre courant (« Déjà modifié par un collègue. ») ;
 * 3. il date de moins de FENETRE_ANNULATION_S (« Trop tard pour annuler. ») ;
 * 4. l’état courant est celui qu’il a posé (« Déjà modifié par un collègue. ») ;
 * 5. aucun autre événement, hors `sms`, n’a été écrit au même instant ou
 *    après (« Ce changement ne s’annule pas ici. » : accord,
 *    reprogrammation…).
 * Effets, sans nouvel événement ni notification : statut ← avant ;
 * blocage, détail et devis ← `blocageAvant` ; prévenu ← `prevenuAvant` ;
 * motif effacé ; masques réaffichés ; l’événement est supprimé (avec sa
 * note automatique et ses notifications). Levée : blocage, détail et devis
 * d’avant. Pose : blocage d’avant (le plus souvent aucun) et `detailAvant`.
 * Passage en « Prêt » suivi d’un SMS « prêt » : note `PHRASE_PLUS_PRET`,
 * `smsParti` vrai.
 */
export function annulation(i: Intervention, ctx: ContexteJournal, evenementId?: string): Annulation {
  const evs = evenementsDe(ctx, i.id);
  const cibles = evs.filter((x) => x.type === 'statut' || x.type === 'blocage');
  const e = cibles[cibles.length - 1];
  if (!e) throw new Error(ANNULATION.rien);
  // L’avis nomme son événement : si ce n’est plus le dernier changement, rien n’est défait.
  if (evenementId && e.id !== evenementId) throw new Error(ANNULATION.pasIci);

  const avantVal = e.avant ?? null;
  const estStatut = e.type === 'statut' && Boolean(avantVal);
  const estLevee = e.type === 'blocage' && e.valeur === null && Boolean(avantVal);
  const estPose = e.type === 'blocage' && e.valeur !== null && e.valeur !== avantVal;
  if (!estStatut && !estLevee && !estPose) throw new Error(ANNULATION.pasIci);
  // Une reprogrammation ne se défait pas d’un appui (comme le SQL).
  if (estStatut && avantVal === 'annule') throw new Error(ANNULATION.pasIci);
  if (!ctx.auteur || e.membreId !== ctx.auteur.id) throw new Error(ANNULATION.collegue);
  if (ctx.maintenant.getTime() - temps(e.creeLe) >= FENETRE_ANNULATION_S * 1000) throw new Error(ANNULATION.tard);
  const pose = estStatut ? i.statut === e.valeur : (i.blocage ?? null) === (e.valeur ?? null);
  if (!pose) throw new Error(ANNULATION.collegue);
  // Le SMS « prêt » (Rencar, ou écrit depuis le téléphone) suit le geste, il ne l’empêche pas (comme le SQL).
  const smsPret = (x: Evenement) => x.type === 'sms' || (x.type === 'prevenu' && x.valeur === 'sms');
  if (evs.some((x) => x.id !== e.id && !smsPret(x) && temps(x.creeLe) >= temps(e.creeLe))) throw new Error(ANNULATION.pasIci);

  const apres: Intervention = { ...i, majLe: ctx.maintenant.toISOString() };
  let noteClient: string | undefined;
  let smsParti = false;
  if (estStatut) {
    apres.statut = avantVal as Statut;
    const ba = e.details?.blocageAvant;
    if (ba) {
      apres.blocage = ba.blocage;
      if (ba.detail) apres.detailBlocage = ba.detail;
      else delete apres.detailBlocage;
      if (ba.devisEnvoyeLe) apres.devisEnvoyeLe = ba.devisEnvoyeLe;
      else delete apres.devisEnvoyeLe;
    }
    if (e.details?.prevenuAvant) apres.prevenu = e.details.prevenuAvant;
    else if (apres.statut !== 'termine') delete apres.prevenu;
    delete apres.motifAnnulation;
    if (e.valeur === 'termine' && evs.some((x) => smsPret(x) && temps(x.creeLe) >= temps(e.creeLe))) {
      smsParti = true;
      noteClient = PHRASE_PLUS_PRET;
    }
  } else if (estLevee) {
    apres.blocage = avantVal as Blocage;
    if (e.details?.detail) apres.detailBlocage = e.details.detail;
    else delete apres.detailBlocage;
    if (e.details?.devisEnvoyeLe) apres.devisEnvoyeLe = e.details.devisEnvoyeLe;
    else delete apres.devisEnvoyeLe;
  } else {
    apres.blocage = avantVal as Blocage | null;
    if (e.details?.detailAvant) apres.detailBlocage = e.details.detailAvant;
    else delete apres.detailBlocage;
    delete apres.devisEnvoyeLe;
  }

  return {
    apres,
    supprimer: e.id,
    reafficher: e.details?.masques ?? { evenements: [], commentaires: [] },
    noteClient,
    resultat: { statut: apres.statut, blocage: apres.blocage, smsParti },
  };
}
