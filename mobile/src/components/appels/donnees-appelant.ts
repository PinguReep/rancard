/**
 * Ce que l'appelant a donné au réceptionniste pendant l'appel
 * (`appels.contexte`, 0012), mis en forme pour la fiche de l'appel, la
 * carte en direct et le préremplissage d'une intervention. Texte dicté par
 * l'appelant : rien n'est déduit au-delà de la mise en forme (numéro,
 * plaque, kilométrage). Sans interface.
 */

import { chiffresTelephone, telephoneMobileValide } from '@/components/clients/outils';
import type { Appel, ChampContexte } from '@/domain/types';
import { formaterPlaque, formaterTelephone, kilometrage } from '@/lib/format';

/** Une information à afficher : texte mis en forme, et si l'appelant l'a confirmée. */
export type InfoAppelant = { texte: string; confirme: boolean };

export type DonneesAppelant = {
  /** Prénom et nom dictés */
  identite?: InfoAppelant;
  /** Numéro de rappel dicté, seulement s'il diffère du numéro qui appelle */
  rappel?: InfoAppelant;
  /** Marque et modèle */
  vehicule?: InfoAppelant;
  /** Plaque mise en forme (AA-008-AA) quand elle s'y prête */
  plaque?: InfoAppelant;
  /** « 87 000 km », ou la valeur dictée telle quelle si ce n'est pas un nombre */
  km?: InfoAppelant;
  motif?: InfoAppelant;
};

/** Plusieurs champs réunis (prénom et nom, marque et modèle) : confirmés si chacun l'est. */
function reunir(...champs: (ChampContexte | undefined)[]): InfoAppelant | undefined {
  const presents = champs.filter((c): c is ChampContexte => Boolean(c?.valeur.trim()));
  if (!presents.length) return undefined;
  return { texte: presents.map((c) => c.valeur.trim()).join(' '), confirme: presents.every((c) => c.confirme) };
}

/**
 * Kilométrage dicté → nombre, seulement si la valeur en est clairement un
 * (« 87000 », « 87 000 km », « 87.000 »). Undefined sinon (« environ 90 000 »,
 * « 120 ou 130 000 ») : la valeur reste lisible sur la fiche, sans être recopiée.
 */
export function kmDicte(valeur: string): number | undefined {
  const brut = valeur
    .toLowerCase()
    .replace(/[\s.]/g, '')
    .replace(/kms?$/, '');
  if (!/^\d{1,7}$/.test(brut)) return undefined;
  const n = Number(brut);
  return n > 0 && n < 2_000_000 ? n : undefined;
}

export function donneesAppelant(appel: Pick<Appel, 'numero' | 'contexte'>): DonneesAppelant {
  const c = appel.contexte?.champs ?? {};
  const d: DonneesAppelant = {};

  d.identite = reunir(c.prenom, c.nom);

  if (c.telephoneRappel) {
    const chiffres = chiffresTelephone(c.telephoneRappel.valeur);
    if (chiffres && chiffres !== chiffresTelephone(appel.numero)) {
      d.rappel = { texte: formaterTelephone(c.telephoneRappel.valeur), confirme: c.telephoneRappel.confirme };
    }
  }

  d.vehicule = reunir(c.marque, c.modele);

  if (c.immatriculation) {
    const plaque = formaterPlaque(c.immatriculation.valeur);
    if (plaque) d.plaque = { texte: plaque, confirme: c.immatriculation.confirme };
  }

  if (c.kilometrage) {
    const n = kmDicte(c.kilometrage.valeur);
    d.km = { texte: n !== undefined ? kilometrage(n) : c.kilometrage.valeur, confirme: c.kilometrage.confirme };
  }

  if (c.motif) d.motif = { texte: c.motif.valeur, confirme: c.motif.confirme };

  for (const cle of Object.keys(d) as (keyof DonneesAppelant)[]) {
    if (!d[cle]) delete d[cle];
  }
  return d;
}

/**
 * Numéros où joindre l'appelant, le plus utile d'abord : un mobile (les SMS
 * « véhicule prêt » en ont besoin), le numéro de rappel dicté avant celui
 * qui appelle. Mis en forme, sans doublon, sans numéro masqué.
 */
export function numerosAppelant(appel: Pick<Appel, 'numero' | 'contexte'>): string[] {
  const dicte = appel.contexte?.champs.telephoneRappel?.valeur ?? '';
  const vus = new Set<string>();
  const numeros: string[] = [];
  for (const n of [dicte, appel.numero]) {
    const chiffres = chiffresTelephone(n);
    if (chiffres.length < 10 || vus.has(chiffres)) continue;
    vus.add(chiffres);
    numeros.push(formaterTelephone(n));
  }
  return numeros.sort((a, b) => Number(telephoneMobileValide(b)) - Number(telephoneMobileValide(a)));
}

const PRESTATION_MAX = 80;

/**
 * Intitulé de prestation tiré du motif : sa première phrase (règle des
 * fiches créées par le réceptionniste, prestationDepuisMotif dans la
 * fonction Edge agent-webhook), ici réduite à sa première proposition
 * (« Pneus avant usés, devis pour… » → « Pneus avant usés ») : c'est le
 * titre de la fiche au planning, le motif entier va dans la demande du
 * client. 80 caractères au plus. Vide sans motif.
 */
export function prestationDepuisMotif(motif: string): string {
  const propre = motif.replace(/\s+/g, ' ').trim();
  if (!propre) return '';
  let phrase = (/^(.+?[.!?;])(?:\s|$)/.exec(propre)?.[1] ?? propre).replace(/[.;]$/, '').trim();
  const proposition = /^(.{8,}?)\s*(?:[,;:(]|\s-\s)/.exec(phrase)?.[1];
  if (proposition) phrase = proposition;
  if (phrase.length > PRESTATION_MAX) {
    const coupe = phrase.slice(0, PRESTATION_MAX - 1);
    const espace = coupe.lastIndexOf(' ');
    phrase = `${(espace > 40 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:]+$/, '')}…`;
  }
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Demande du client : le motif, puis le kilométrage annoncé (celui d'un
 * véhicule déjà connu n'est pas écrasé, l'équipe compare). Même règle que
 * texteDemande (fonction Edge agent-webhook).
 */
export function demandeDepuisAppel(motif: string | undefined, km: number | undefined): string {
  const m = motif?.replace(/\s+/g, ' ').trim() ?? '';
  const phrase = m && !/[.!?…]$/.test(m) ? `${m}.` : m;
  const annonce = km !== undefined ? `Kilométrage annoncé : ${kilometrage(km)}.` : '';
  return [phrase, annonce].filter(Boolean).join(' ');
}
