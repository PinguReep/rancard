/**
 * Outils du chantier Clients : recherche insensible aux accents, visibilité
 * selon les permissions, validation du téléphone, fiches enrichies pour les
 * listes. Aucune dépendance à l'interface.
 */

import { differenceInCalendarDays } from 'date-fns';

import { bloqueeDepuis, pasArrivee, preteDepuis, repereCarte, type Repere } from '@/domain/echeances';
import { BLOCAGES, STATUTS, STATUTS_ACTIFS, estBloquee } from '@/domain/statuts';
import type { Client, Evenement, Intervention, Membre, Permissions, Statut, Vehicule } from '@/domain/types';
import { depuisCourt, depuisLong, formaterPlaque, formaterTelephone, heure, jourProche, jourProcheLong, memeJour } from '@/lib/format';

/** Minuscules, sans accents ni espaces superflus. */
export const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Lettres et chiffres seulement (plaques, jetons). */
const aplatir = (s: string) => normaliser(s).replace(/[^a-z0-9]/g, '');

/** Chiffres seulement, +33 ramené à 0. */
export const chiffresTelephone = (s: string) => s.replace(/\D/g, '').replace(/^0033/, '0').replace(/^33/, '0');

/** Mobile français : 06 ou 07 suivi de 8 chiffres (formats +33 acceptés). */
export function telephoneMobileValide(saisie: string): boolean {
  return /^0[67]\d{8}$/.test(chiffresTelephone(saisie));
}

/** Fixe français : 01 à 05 ou 09, suivi de 8 chiffres (formats +33 acceptés). */
export function telephoneFixeValide(saisie: string): boolean {
  return /^0[1-59]\d{8}$/.test(chiffresTelephone(saisie));
}

const SUITES = ['0123456789', '9876543210'];

/**
 * Numéro qui ressemble à un numéro inventé (D6) : après l’indicatif, huit
 * chiffres identiques (« 06 39 98 00 10 ») ou une suite (« 06 39 98 00 11 »).
 * Seulement pour un numéro français complet (10 chiffres).
 */
export function numeroInvente(saisie: string): boolean {
  const c = chiffresTelephone(saisie);
  if (!/^0\d{9}$/.test(c)) return false;
  const huit = c.slice(2);
  return /^(\d)\1{7}$/.test(huit) || SUITES.some((s) => s.includes(huit));
}

/** Numéro qu’on peut appeler : mobile ou fixe français, pas inventé. */
export function telephoneAppelable(saisie: string): boolean {
  return (telephoneMobileValide(saisie) || telephoneFixeValide(saisie)) && !numeroInvente(saisie);
}

/**
 * Numéro qu’on peut composer (bouton « Appeler ») : au moins 8 chiffres,
 * numéros étrangers compris (+41, +32… : l’appelant d’un réceptionniste,
 * rappelé tel quel), pas inventé. Le SMS garde `mobileJoignable`.
 */
export function telephoneComposable(saisie: string): boolean {
  const c = saisie.replace(/\D/g, '');
  if (c.length < 8 || c.length > 15 || /^(\d)\1+$/.test(c)) return false;
  return !numeroInvente(saisie);
}

/** Mobile auquel on peut écrire (SMS, lien `sms:`) : mobile français, pas inventé. */
export function mobileJoignable(saisie: string): boolean {
  return telephoneMobileValide(saisie) && !numeroInvente(saisie);
}

/** « Peugeot 308 » */
export const libelleVehicule = (v: Pick<Vehicule, 'marque' | 'modele'>) => `${v.marque} ${v.modele}`.trim();

/** Fiche client enrichie pour les listes et la recherche. */
export type FicheClient = {
  client: Client;
  vehicules: Vehicule[];
  /** Interventions visibles, plus récentes en premier */
  interventions: Intervention[];
  /** Début de la dernière intervention, ISO */
  derniere?: string;
};

/**
 * Clients visibles par le membre : tous avec `voirTout`, sinon ceux qui ont
 * une intervention affectée au membre, plus ceux qui n'ont encore aucune
 * intervention (fiche que l'on vient de créer). Même règle que la politique
 * RLS `client_visible()` côté Supabase.
 */
export function clientsVisibles(
  clients: Client[],
  interventions: Intervention[],
  membre: Pick<Membre, 'id'>,
  p: Pick<Permissions, 'voirTout'>,
): Client[] {
  if (p.voirTout) return clients;
  const avecIntervention = new Set(interventions.map((i) => i.clientId));
  const miens = new Set(interventions.filter((i) => i.membreId === membre.id).map((i) => i.clientId));
  return clients.filter((c) => miens.has(c.id) || !avecIntervention.has(c.id));
}

/** Interventions visibles par le membre (toutes, ou seulement les siennes). */
export function interventionsVisibles(interventions: Intervention[], membre: Pick<Membre, 'id'>, p: Pick<Permissions, 'voirTout'>) {
  return p.voirTout ? interventions : interventions.filter((i) => i.membreId === membre.id);
}

const comparerNoms = (a: Client, b: Client) =>
  a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' });

/** Construit les fiches triées par nom puis prénom. */
export function fichesClients(clients: Client[], vehicules: Vehicule[], interventions: Intervention[]): FicheClient[] {
  const vehiculesPar = new Map<string, Vehicule[]>();
  for (const v of vehicules) {
    const liste = vehiculesPar.get(v.clientId);
    if (liste) liste.push(v);
    else vehiculesPar.set(v.clientId, [v]);
  }
  const interventionsPar = new Map<string, Intervention[]>();
  for (const i of interventions) {
    const liste = interventionsPar.get(i.clientId);
    if (liste) liste.push(i);
    else interventionsPar.set(i.clientId, [i]);
  }
  return [...clients].sort(comparerNoms).map((client) => {
    const liste = (interventionsPar.get(client.id) ?? []).slice().sort((a, b) => b.debut.localeCompare(a.debut));
    return {
      client,
      vehicules: vehiculesPar.get(client.id) ?? [],
      interventions: liste,
      derniere: liste[0]?.debut,
    };
  });
}

/**
 * Correspondance d'une fiche à une requête : nom, prénom, plaque (avec ou
 * sans tirets), téléphone (chiffres), marque et modèle. Chaque mot de la
 * requête doit correspondre.
 */
export function correspond(f: FicheClient, requete: string): boolean {
  const q = normaliser(requete);
  if (!q) return true;
  const c = f.client;

  const textes = [
    normaliser(`${c.prenom} ${c.nom}`),
    normaliser(`${c.nom} ${c.prenom}`),
    ...f.vehicules.map((v) => normaliser(`${v.marque} ${v.modele} ${v.version ?? ''}`)),
  ];
  const plaques = f.vehicules.map((v) => aplatir(v.plaque));
  const tel = chiffresTelephone(c.telephone);

  // Requête numérique (« 06 24 55 », « 208 ») : téléphone entier, modèle ou plaque.
  if (/^[\d\s.+()-]+$/.test(q)) {
    const chiffres = chiffresTelephone(q);
    if (chiffres.length >= 2) {
      return tel.includes(chiffres) || textes.some((t) => t.includes(q)) || plaques.some((p) => p.includes(chiffres));
    }
  }

  return q.split(/\s+/).every((mot) => {
    if (textes.some((t) => t.includes(mot))) return true;
    const plat = mot.replace(/[^a-z0-9]/g, '');
    if (plat && plaques.some((p) => p.includes(plat))) return true;
    const chiffres = mot.replace(/\D/g, '');
    return chiffres.length >= 2 && chiffres === plat && tel.includes(chiffres);
  });
}

export function filtrerFiches(fiches: FicheClient[], requete: string): FicheClient[] {
  return requete.trim() ? fiches.filter((f) => correspond(f, requete)) : fiches;
}

/** « 3 clients », « 1 véhicule » */
export const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ── Ligne de recherche (v2c, reprise de la v2b) : la voiture visée et où elle en est

/** Un mot de la requête désigne-t-il ce véhicule (plaque, marque, modèle, version) ? */
function motDuVehicule(v: Vehicule, mot: string): boolean {
  if (normaliser(`${v.marque} ${v.modele} ${v.version ?? ''}`).includes(mot)) return true;
  const plat = mot.replace(/[^a-z0-9]/g, '');
  return plat.length >= 2 && aplatir(v.plaque).includes(plat);
}

/**
 * Véhicules de la fiche que la requête désigne (« FF-284 », « Mégane », « 208 »),
 * ceux qui répondent au plus grand nombre de mots ; vide quand la requête ne
 * vise que le client (nom, téléphone).
 */
export function vehiculesDesignes(f: FicheClient, requete: string): Vehicule[] {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const notes = f.vehicules.map((v) => ({ v, n: mots.filter((m) => motDuVehicule(v, m)).length }));
  const meilleure = Math.max(0, ...notes.map((x) => x.n));
  return meilleure ? notes.filter((x) => x.n === meilleure).map((x) => x.v) : [];
}

/** Statuts où la voiture est au garage : c’est elle qu’on demande au téléphone. */
const AU_GARAGE: Statut[] = ['recu', 'en_cours', 'termine'];

const temps = (iso: string) => new Date(iso).getTime();

/**
 * Priorité entre interventions actives : la voiture au garage d’abord (la
 * plus récemment arrivée), puis le rendez-vous le plus proche (le
 * diagnostic du jour avant la révision de jeudi). Négatif : `a` passe devant.
 */
function prioriteActive(a: Intervention, b: Intervention): number {
  const ga = AU_GARAGE.includes(a.statut) ? 0 : 1;
  const gb = AU_GARAGE.includes(b.statut) ? 0 : 1;
  if (ga !== gb) return ga - gb;
  return ga === 0 ? temps(b.debut) - temps(a.debut) : temps(a.debut) - temps(b.debut);
}

/**
 * Intervention active d’un véhicule (de « À valider » à « Véhicule prêt »),
 * selon `prioriteActive`. `interventions` est déjà filtrée par
 * `interventionsVisibles` : un employé sans « voir tout » ne lit que l’état
 * de ses voitures.
 */
export function interventionActive(f: FicheClient, vehiculeId: string): Intervention | undefined {
  let choisie: Intervention | undefined;
  for (const i of f.interventions) {
    if (i.vehiculeId !== vehiculeId || !STATUTS_ACTIFS.includes(i.statut)) continue;
    if (!choisie || prioriteActive(i, choisie) < 0) choisie = i;
  }
  return choisie;
}

/**
 * Véhicule à montrer sur la ligne : parmi ceux que la requête désigne
 * (sinon parmi tous), celui dont l’intervention active passe devant ; à
 * défaut le premier. Une requête qui ne parle que du client (« Bertin »)
 * retombe sur la voiture au garage.
 */
export function vehiculeTrouve(f: FicheClient, requete: string): Vehicule | undefined {
  const designes = vehiculesDesignes(f, requete);
  const candidats = designes.length ? designes : f.vehicules;
  let choisi: Vehicule | undefined;
  let active: Intervention | undefined;
  for (const v of candidats) {
    const a = interventionActive(f, v.id);
    if (a && (!active || prioriteActive(a, active) < 0)) {
      choisi = v;
      active = a;
    }
  }
  return choisi ?? candidats[0];
}

/** Nom v2a de `vehiculeTrouve`, gardé pour les appelants existants. */
export function vehiculeCorrespondant(f: FicheClient, requete: string): Vehicule | undefined {
  return vehiculeTrouve(f, requete);
}

/** Genre de l’état, pour l’icône de la ligne (choisie par l’interface). */
export type GenreEtat = 'bloquee' | 'retard' | 'prete' | 'atelier' | 'rdv' | 'livree';

/** Troisième ligne du résultat : où en est la voiture, en une phrase courte. Jamais de montant. */
export type EtatRecherche = Repere & { genre: GenreEtat };

/** Contexte de la ligne : l’heure, et les événements d’une intervention. */
export type CtxRecherche = { maintenant: Date; evenementsDe: (interventionId: string) => Evenement[] };

const MOTS: Record<Statut, { texte: string; parle: string }> = {
  a_valider: { texte: 'À valider', parle: 'à valider' },
  planifie: { texte: 'À recevoir', parle: 'à recevoir' },
  recu: { texte: STATUTS.recu.court, parle: 'véhicule reçu' },
  en_cours: { texte: STATUTS.en_cours.court, parle: 'en cours' },
  termine: { texte: STATUTS.termine.court, parle: 'prêt' },
  livre: { texte: STATUTS.livre.court, parle: 'livré' },
  annule: { texte: STATUTS.annule.court, parle: 'annulé' },
};

const minuscule = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Rendez-vous : « 11:00 » le jour même, « mer. 28 08:30 » dans la semaine, « 10 nov. 14:00 » au-delà. */
function momentRdv(iso: string, m: Date): { texte: string; parle: string } {
  if (memeJour(new Date(iso), m)) return { texte: heure(iso), parle: heure(iso) };
  return { texte: `${jourProche(iso, m)} ${heure(iso)}`, parle: `${jourProcheLong(iso, m)} ${heure(iso)}` };
}

/**
 * Où en est une intervention active, en une ligne (couleur du ton) :
 * - bloquée : « Attente pièce · Sonde lambda · prévue jeu. 29 » (repère de la
 *   carte), sans détail « Attente pièce · 2 j » ;
 * - prête : « Prêt · 56 min · SMS 10:35 », « Prêt · 3 h · À prévenir » ;
 * - reçue ou en cours : « En cours · Promise 17:00 », « … · en retard » ;
 * - rendez-vous : « À recevoir · mar. 27 11:00 », « À recevoir · 11:00 · pas
 *   arrivée », « À valider · mer. 28 08:30 ».
 */
export function etatRecherche(i: Intervention, ctx: CtxRecherche): EtatRecherche {
  const m = ctx.maintenant;
  const evenements = ctx.evenementsDe(i.id);
  const r = repereCarte(i, { maintenant: m, evenements });
  const mot = MOTS[i.statut];

  if (i.blocage && estBloquee(i) && i.statut !== 'termine') {
    const blocage = BLOCAGES[i.blocage].label;
    // Le libellé parlé du repère nomme déjà le blocage (« attente pièce, sonde lambda, … »).
    if (r) return { texte: `${blocage} · ${r.texte}`, ton: r.ton, label: r.label, genre: r.ton === 'danger' ? 'retard' : 'bloquee' };
    const pose = bloqueeDepuis(i, evenements);
    return pose
      ? { texte: `${blocage} · ${depuisCourt(pose, m)}`, ton: 'warn', label: `${minuscule(blocage)} depuis ${depuisLong(pose, m)}`, genre: 'bloquee' }
      : { texte: blocage, ton: 'warn', label: minuscule(blocage), genre: 'bloquee' };
  }

  if (i.statut === 'termine') {
    const pret = preteDepuis(i, evenements);
    const texte = [mot.texte, pret ? depuisCourt(pret, m) : null, r?.texte].filter(Boolean).join(' · ');
    const label = [pret ? `prêt depuis ${depuisLong(pret, m)}` : mot.parle, r?.label].filter(Boolean).join(', ');
    return { texte, ton: r?.ton ?? 'ok', label, genre: 'prete' };
  }

  if (i.statut === 'recu' || i.statut === 'en_cours') {
    return r
      ? { texte: `${mot.texte} · ${r.texte}`, ton: r.ton, label: `${mot.parle}, ${r.label}`, genre: r.ton === 'danger' ? 'retard' : 'atelier' }
      : { texte: mot.texte, ton: 'muted', label: mot.parle, genre: 'atelier' };
  }

  const q = momentRdv(i.debut, m);
  if (pasArrivee(i, m)) {
    return { texte: `${mot.texte} · ${q.texte} · pas arrivée`, ton: 'warn', label: `${mot.parle}, ${q.parle}, pas arrivée`, genre: 'retard' };
  }
  return { texte: `${mot.texte} · ${q.texte}`, ton: i.statut === 'a_valider' ? 'warn' : 'muted', label: `${mot.parle}, ${q.parle}`, genre: 'rdv' };
}

/** Jours pendant lesquels une livraison récente se lit encore sur la ligne (« la Mégane d’hier »). */
const LIVRAISON_RECENTE_JOURS = 6;

/**
 * Dernière livraison récente du véhicule (passage en « Livré » tracé dans
 * le journal) : « Livré à 16:05 », « Livré hier à 16:05 », « Livré jeu. 22 à
 * 16:05 » ; `null` au-delà de LIVRAISON_RECENTE_JOURS ou sans trace.
 */
function livraisonRecente(f: FicheClient, vehiculeId: string, ctx: CtxRecherche): EtatRecherche | null {
  const m = ctx.maintenant;
  let le: string | null = null;
  for (const i of f.interventions) {
    if (i.vehiculeId !== vehiculeId || i.statut !== 'livre') continue;
    for (const e of ctx.evenementsDe(i.id)) {
      if (e.type === 'statut' && e.valeur === 'livre' && (!le || temps(e.creeLe) > temps(le))) le = e.creeLe;
    }
  }
  if (!le) return null;
  const jours = differenceInCalendarDays(m, new Date(le));
  if (jours < 0 || jours > LIVRAISON_RECENTE_JOURS) return null;
  const h = heure(le);
  const quand =
    jours === 0
      ? { texte: `à ${h}`, parle: `à ${h}` }
      : jours === 1
        ? { texte: `hier à ${h}`, parle: `hier à ${h}` }
        : { texte: `${jourProche(le, m)} à ${h}`, parle: `${jourProcheLong(le, m)} à ${h}` };
  return { texte: `Livré ${quand.texte}`, ton: 'muted', label: `livré ${quand.parle}`, genre: 'livree' };
}

/** Ce que la ligne de recherche montre d’une fiche, et ce que son appui ouvre. */
export type ResultatLigne = {
  /** Véhicule en tête (plaque dessinée) */
  vehicule?: Vehicule;
  /** Intervention active de ce véhicule, celle que l’appui ouvre */
  active?: Intervention;
  /** Troisième ligne : où en est la voiture */
  etat: EtatRecherche | null;
  /** L’appui ouvre l’intervention ; sinon la fiche client */
  versIntervention: boolean;
};

/**
 * Ligne de recherche d’une fiche : le véhicule que la requête vise, où en
 * est son intervention active, et ce que l’appui ouvre. Un client à deux
 * voitures actives dont la requête ne dit pas laquelle ouvre sa fiche
 * client (la ligne montre la prioritaire).
 */
export function resultatLigne(f: FicheClient, requete: string, ctx: CtxRecherche): ResultatLigne {
  const vehicule = vehiculeTrouve(f, requete);
  if (!vehicule) return { etat: null, versIntervention: false };
  const active = interventionActive(f, vehicule.id);
  if (!active) return { vehicule, etat: livraisonRecente(f, vehicule.id, ctx), versIntervention: false };
  const designes = vehiculesDesignes(f, requete);
  const candidats = designes.length ? designes : f.vehicules;
  const avecActive = candidats.filter((v) => interventionActive(f, v.id)).length;
  return { vehicule, active, etat: etatRecherche(active, ctx), versIntervention: avecActive <= 1 };
}

// ── Recherche sans résultat → départ du formulaire

/** « Manon Lefèvre » → prénom « Manon », nom « Lefèvre » pour préremplir. */
export function devinerNom(requete: string): { prenom?: string; nom?: string } {
  const mots = requete.trim().split(/\s+/).filter(Boolean);
  if (!mots.length || /\d/.test(requete)) return {};
  const cap = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
  return mots.length === 1 ? { nom: cap(mots[0]) } : { prenom: cap(mots[0]), nom: mots.slice(1).map(cap).join(' ') };
}

/** Plaque tapée seule, avec ou sans tirets (« AA001AA », « aa-001 aa »). */
const PLAQUE_TAPEE = /^[A-Za-z]{2}[- ]?\d{3}[- ]?[A-Za-z]{2}$/;

/** Ce que la recherche donne au formulaire : client (prénom, nom, mobile) et plaque du véhicule. */
export type DepartRecherche = { prenom?: string; nom?: string; telephone?: string; plaque?: string };

/**
 * Recherche sans résultat → départ du formulaire, partagé par l’onglet
 * Chercher et l’assistant : un numéro (0… ou +…) va au mobile, une plaque
 * au champ Plaque du véhicule, des mots au prénom et au nom. Une requête
 * mixte (« Mégane Bertin », « 208 ») ne devine rien.
 */
export function valeursDepuisRecherche(requete: string): DepartRecherche {
  const q = requete.trim();
  if (!q) return {};
  if (/^(\+|0)[\d\s.()-]*$/.test(q)) return { telephone: formaterTelephone(q) };
  if (PLAQUE_TAPEE.test(q)) return { plaque: formaterPlaque(q) };
  return devinerNom(q);
}

/**
 * Fusion sans perte : une valeur vide n’écrase jamais un champ déjà
 * rempli (numéro venu d’un appel, nom de l’appelant). Seuls les champs de
 * `base` sont repris (la plaque ne va pas dans la fiche client).
 */
export function fusionnerSansVide<T extends Record<string, string>>(base: T, ajout: Partial<Record<string, string | undefined>>): T {
  const n = { ...base };
  for (const k of Object.keys(base) as (keyof T & string)[]) {
    const v = ajout[k]?.trim();
    if (v) n[k] = v as T[keyof T & string];
  }
  return n;
}
