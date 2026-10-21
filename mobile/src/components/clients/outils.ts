/**
 * Outils du chantier Clients : recherche insensible aux accents, visibilité
 * selon les permissions, validation du téléphone, fiches enrichies pour les
 * listes. Aucune dépendance à l'interface.
 */

import type { Client, Intervention, Membre, Permissions, Vehicule } from '@/domain/types';

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

/** « Peugeot 208 » */
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
