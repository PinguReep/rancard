/**
 * État d'ouverture de l'assistant « Nouvelle intervention », selon d'où il
 * est ouvert :
 *   · planning : rien de présélectionné ;
 *   · fiche client (`clientId`) : le client, et son véhicule s'il n'en a qu'un ;
 *   · fiche d'un appel (`appelId`) : tout ce que l'appelant a donné au
 *     réceptionniste. Client retrouvé par son numéro, sinon formulaire
 *     « Nouveau client » prérempli ; véhicule du client retrouvé par sa
 *     plaque, sinon formulaire prérempli ; prestation et demande tirées du
 *     motif. Mêmes règles que les fiches créées par le réceptionniste
 *     (fonction Edge agent-webhook, `_partage/dossier.ts`), la personne
 *     au comptoir vérifiant à chaque étape.
 *   · numéro seul (`telephone`) : client retrouvé par son numéro, sinon
 *     formulaire prérempli avec ce numéro.
 * Calculé une fois à l'ouverture : la suite appartient à l'utilisateur.
 */

import { demandeDepuisAppel, kmDicte, numerosAppelant, prestationDepuisMotif } from '@/components/appels/donnees-appelant';
import { CLIENT_VIDE, type ValeursClient } from '@/components/clients/FormulaireClient';
import { VEHICULE_VIDE, type ValeursVehicule } from '@/components/clients/FormulaireVehicule';
import { chiffresTelephone, devinerNom, normaliser } from '@/components/clients/outils';
import type { Appel, Client, Vehicule } from '@/domain/types';
import { formaterPlaque, formaterTelephone } from '@/lib/format';

import type { Etape } from './Etapes';

export type ChoixClient = { mode: 'existant'; client: Client } | { mode: 'nouveau' };
export type ChoixVehicule = { mode: 'existant'; vehicule: Vehicule } | { mode: 'nouveau' };

export type Depart = {
  etape: Etape;
  choixClient: ChoixClient | null;
  choixVehicule: ChoixVehicule | null;
  /** Recherche de l'étape Client */
  requete: string;
  /** Formulaire « Nouveau client » ouvert d'emblée */
  nouveauClient: boolean;
  /** Valeurs du formulaire « Nouveau client » (aussi reprises s'il est rouvert) */
  valeursClient: ValeursClient;
  /** Formulaire « Autre véhicule » ouvert d'emblée à l'étape Véhicule */
  autreVehicule: boolean;
  valeursVehicule: ValeursVehicule;
  prestation: string;
  demande: string;
  /** Plaque donnée à l'appel, déjà enregistrée chez un client (numéro différent) : proposé à côté du formulaire */
  plaqueConnue?: { client: Client; vehicule: Vehicule };
};

type Entrees = {
  clientId?: string;
  telephone?: string;
  appel?: Appel;
  /** Tous les clients du garage chargés */
  clients: Client[];
  /** Clients visibles par le membre (recherche par numéro et par plaque) */
  visibles: Client[];
  vehicules: Vehicule[];
};

const VIDE: Depart = {
  etape: 1,
  choixClient: null,
  choixVehicule: null,
  requete: '',
  nouveauClient: false,
  valeursClient: CLIENT_VIDE,
  autreVehicule: false,
  valeursVehicule: VEHICULE_VIDE,
  prestation: '',
  demande: '',
};

/** Lettres et chiffres en capitales : « aa 008 aa » et « AA-008-AA » sont la même plaque. */
const clePlaque = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Même marque ou même modèle, à l'accent et à la précision près (« Polo » et « Polo »). */
function proche(connu: string, dicte: string): boolean {
  const a = normaliser(connu);
  const b = normaliser(dicte);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function clientParNumero(numeros: string[], visibles: Client[]): Client | undefined {
  for (const n of numeros) {
    const chiffres = chiffresTelephone(n);
    if (chiffres.length < 10) continue;
    const c = visibles.find((x) => chiffresTelephone(x.telephone) === chiffres);
    if (c) return c;
  }
  return undefined;
}

/** Client présélectionné : son véhicule s'il n'en a qu'un (fiche client, numéro reconnu). */
function avecClient(client: Client, vehicules: Vehicule[], base: Depart = VIDE): Depart {
  const siens = vehicules.filter((v) => v.clientId === client.id);
  return {
    ...base,
    choixClient: { mode: 'existant', client },
    choixVehicule: siens.length === 1 ? { mode: 'existant', vehicule: siens[0] } : null,
    etape: siens.length === 1 ? 3 : 2,
  };
}

function depuisAppel(appel: Appel, visibles: Client[], vehicules: Vehicule[]): Depart {
  const c = appel.contexte?.champs ?? {};
  const numeros = numerosAppelant(appel);
  const plaque = c.immatriculation ? formaterPlaque(c.immatriculation.valeur) : '';
  const marque = c.marque?.valeur.trim() ?? '';
  const modele = c.modele?.valeur.trim() ?? '';
  const km = c.kilometrage ? kmDicte(c.kilometrage.valeur) : undefined;
  const motif = c.motif?.valeur ?? '';

  // Nom dicté pendant l'appel, sinon celui retenu en fin d'appel (« Prénom Nom »).
  const noms: Partial<ValeursClient> =
    c.prenom || c.nom ? { prenom: c.prenom?.valeur.trim() ?? '', nom: c.nom?.valeur.trim() ?? '' } : devinerNom(appel.appelant ?? '');
  const valeursClient: ValeursClient = { ...CLIENT_VIDE, ...noms, telephone: numeros[0] ?? '' };
  const valeursVehicule: ValeursVehicule = { ...VEHICULE_VIDE, plaque, marque, modele, km: km !== undefined ? String(km) : '' };
  const vehiculeDonne = Boolean(plaque || marque || modele);
  const base: Depart = {
    ...VIDE,
    valeursClient,
    valeursVehicule,
    prestation: prestationDepuisMotif(motif),
    demande: demandeDepuisAppel(motif, km),
  };

  const client = clientParNumero(numeros, visibles);
  if (client) {
    const siens = vehicules.filter((v) => v.clientId === client.id);
    let vehicule: Vehicule | undefined;
    if (plaque) {
      // Jamais le véhicule d'un autre client : une plaque inconnue chez lui ouvre le formulaire prérempli.
      vehicule = siens.find((v) => clePlaque(v.plaque) === clePlaque(plaque));
    } else if (marque || modele) {
      const memes = siens.filter((v) => (!marque || proche(v.marque, marque)) && (!modele || proche(v.modele, modele)));
      vehicule = memes.length === 1 ? memes[0] : undefined;
    } else if (siens.length === 1) {
      vehicule = siens[0];
    }
    return {
      ...base,
      choixClient: { mode: 'existant', client },
      choixVehicule: vehicule ? { mode: 'existant', vehicule } : null,
      etape: vehicule ? 3 : 2,
      autreVehicule: !vehicule && vehiculeDonne,
    };
  }

  // Numéro inconnu : formulaire « Nouveau client » prérempli, s'il y a de quoi le remplir.
  const nom = `${valeursClient.prenom} ${valeursClient.nom}`.trim();
  const ids = new Set(visibles.map((x) => x.id));
  const parPlaque = plaque ? vehicules.find((v) => ids.has(v.clientId) && clePlaque(v.plaque) === clePlaque(plaque)) : undefined;
  const proprietaire = parPlaque ? visibles.find((x) => x.id === parPlaque.clientId) : undefined;
  return {
    ...base,
    nouveauClient: Boolean(nom || valeursClient.telephone),
    // Revenir à « Client existant » montre la recherche par nom (client qui appelle d'un autre numéro).
    requete: nom || plaque || valeursClient.telephone,
    plaqueConnue: parPlaque && proprietaire ? { client: proprietaire, vehicule: parPlaque } : undefined,
  };
}

export function etatDeDepart({ clientId, telephone, appel, clients, visibles, vehicules }: Entrees): Depart {
  if (clientId) {
    const c = clients.find((x) => x.id === clientId);
    return c ? avecClient(c, vehicules) : VIDE;
  }
  if (appel) return depuisAppel(appel, visibles, vehicules);
  if (telephone) {
    const c = clientParNumero([telephone], visibles);
    if (c) return avecClient(c, vehicules);
    const numero = formaterTelephone(telephone);
    return { ...VIDE, nouveauClient: true, requete: numero, valeursClient: { ...CLIENT_VIDE, telephone: numero } };
  }
  return VIDE;
}
