/**
 * Doublons à la création (P4) : un mobile déjà connu, une plaque déjà
 * enregistrée, une voiture qui a déjà une intervention ouverte. Fonctions
 * pures, appelées sur les seules données **visibles** du membre (même règle
 * que la recherche) : l'assistant avertit sans bloquer, l'utilisateur
 * choisit « Utiliser sa fiche », « Utiliser ce véhicule », « Ouvrir » ou
 * « Créer quand même ».
 */

import { differenceInCalendarDays } from 'date-fns';

import { chiffresTelephone, libelleVehicule } from '@/components/clients/outils';
import { STATUTS_ACTIFS } from '@/domain/statuts';
import type { Client, Intervention, Statut, Vehicule } from '@/domain/types';
import { dePrenom, heure, jourHeure, nomClient } from '@/lib/format';

/** Lettres et chiffres, en majuscules : « aa 004-aa » et « AA-004-AA » se valent. */
const plaqueAplatie = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

/**
 * Client dont le numéro est celui saisi (numéro français complet, +33
 * ramené à 0). Rien tant que la saisie n'a pas ses dix chiffres.
 */
export function clientDuMobile(clients: Client[], saisie: string): Client | undefined {
  const chiffres = chiffresTelephone(saisie);
  if (!/^0\d{9}$/.test(chiffres)) return undefined;
  return clients.find((c) => chiffresTelephone(c.telephone) === chiffres);
}

/** Véhicule déjà enregistré sous cette plaque (cinq caractères au moins, tirets et espaces ignorés). */
export function vehiculeDeLaPlaque(vehicules: Vehicule[], plaque: string): Vehicule | undefined {
  const p = plaqueAplatie(plaque);
  if (p.length < 5) return undefined;
  return vehicules.find((v) => plaqueAplatie(v.plaque) === p);
}

const AU_GARAGE: Statut[] = ['recu', 'en_cours', 'termine'];

/**
 * Intervention encore ouverte sur ce véhicule (à valider, confirmée, au
 * garage, prête). Plusieurs : la voiture au garage d'abord, puis le
 * rendez-vous le plus proche de maintenant.
 */
export function interventionOuverte(interventions: Intervention[], vehiculeId: string, maintenant: Date = new Date()): Intervention | undefined {
  const ouvertes = interventions.filter((i) => i.vehiculeId === vehiculeId && STATUTS_ACTIFS.includes(i.statut));
  const ecart = (i: Intervention) => Math.abs(new Date(i.debut).getTime() - maintenant.getTime());
  return ouvertes.sort((a, b) => {
    const ga = AU_GARAGE.includes(a.statut) ? 0 : 1;
    const gb = AU_GARAGE.includes(b.statut) ? 0 : 1;
    return ga - gb || ecart(a) - ecart(b);
  })[0];
}

/** « aujourd’hui 08:30 », « demain 08:30 », « jeu. 29 oct. 08:30 » */
function quandCourt(iso: string, maintenant: Date): string {
  const ecart = differenceInCalendarDays(new Date(iso), maintenant);
  if (ecart === 0) return `aujourd’hui ${heure(iso)}`;
  if (ecart === 1) return `demain ${heure(iso)}`;
  if (ecart === -1) return `hier ${heure(iso)}`;
  return jourHeure(iso);
}

/** « Batterie, à valider demain 08:30 », « Vidange, prévue jeu. 29 oct. 08:30 », « Freinage, au garage » */
export function resumeOuverte(i: Pick<Intervention, 'prestation' | 'statut' | 'debut'>, maintenant: Date = new Date()): string {
  const etat =
    i.statut === 'a_valider'
      ? `à valider ${quandCourt(i.debut, maintenant)}`
      : i.statut === 'planifie'
        ? `prévue ${quandCourt(i.debut, maintenant)}`
        : i.statut === 'termine'
          ? 'prête, pas encore livrée'
          : 'au garage';
  return `${i.prestation}, ${etat}`;
}

// ── Phrases des avertissements (espace insécable avant « : »)

/** « Ce numéro est celui de Farid Haddad. » */
export const phraseMobileConnu = (c: Pick<Client, 'prenom' | 'nom'>) => `Ce numéro est celui ${dePrenom(nomClient(c, 'un autre client'))}.`;

/** « Cette plaque est déjà enregistrée : Peugeot 308 de Élodie Masson. » */
export function phrasePlaqueConnue(v: Pick<Vehicule, 'marque' | 'modele'>, proprietaire?: Pick<Client, 'prenom' | 'nom'>): string {
  const de = proprietaire ? ` ${dePrenom(nomClient(proprietaire, 'un autre client'))}` : '';
  return `Cette plaque est déjà enregistrée : ${libelleVehicule(v) || 'un véhicule'}${de}.`;
}

/** « Cette voiture a déjà une intervention en cours : Batterie, à valider demain 08:30. » */
export const phraseInterventionOuverte = (i: Pick<Intervention, 'prestation' | 'statut' | 'debut'>, maintenant: Date = new Date()) =>
  `Cette voiture a déjà une intervention en cours : ${resumeOuverte(i, maintenant)}.`;
