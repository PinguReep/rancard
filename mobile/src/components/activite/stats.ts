/**
 * Chiffres de l'onglet Activité, calculés à partir de l'instantané.
 * Fonctions pures, sans interface : faciles à vérifier.
 */

import { differenceInMinutes, endOfDay, endOfWeek, format, getISODay, startOfDay, startOfWeek, subDays, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

import { estBloquee, ORIGINES } from '@/domain/statuts';
import type { Appel, Evenement, Intervention, Membre, Origine, Statut } from '@/domain/types';

export type Periode = 'semaine' | 'semaine_derniere' | 'trente_jours';

export const PERIODES: { id: Periode; label: string }[] = [
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'semaine_derniere', label: 'Précédente' },
  { id: 'trente_jours', label: '30 jours' },
];

export type Bornes = { de: Date; a: Date };

export function bornes(periode: Periode, maintenant = new Date()): Bornes {
  switch (periode) {
    case 'semaine':
      return { de: startOfWeek(maintenant, { weekStartsOn: 1 }), a: endOfWeek(maintenant, { weekStartsOn: 1 }) };
    case 'semaine_derniere': {
      const s = subWeeks(maintenant, 1);
      return { de: startOfWeek(s, { weekStartsOn: 1 }), a: endOfWeek(s, { weekStartsOn: 1 }) };
    }
    case 'trente_jours':
      return { de: startOfDay(subDays(maintenant, 29)), a: endOfDay(maintenant) };
  }
}

/** « Semaine du 14 au 20 sept. », « 30 derniers jours · du 20 août au 18 sept. » */
export function libellePeriode(periode: Periode, b: Bornes): string {
  const fin = format(b.a, 'd MMM', { locale: fr });
  const debut = b.de.getMonth() === b.a.getMonth() ? format(b.de, 'd') : format(b.de, 'd MMM', { locale: fr });
  return periode === 'trente_jours' ? `30 derniers jours · du ${debut} au ${fin}` : `Semaine du ${debut} au ${fin}`;
}

export const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;

export type Stats = {
  rendezVous: number;
  livres: number;
  /** Jours entre la prise en charge et la livraison, null sans livraison */
  delaiMoyenJours: number | null;
  bloquees: number;
  montantLivre: number;
  appels: { traites: number; horsHoraires: number; rdvPris: number } | null;
  origines: { origine: Origine; label: string; valeur: number }[];
  mecaniciens: { membre: Membre; valeur: number }[];
  rdvParJour: { jour: string; valeur: number }[];
  appelsParJour: { jour: string; valeur: number; horsHoraires: number }[] | null;
};

type Entree = {
  interventions: Intervention[];
  evenements: Evenement[];
  appels: Appel[];
  membres: Membre[];
  receptionniste: boolean;
  periode: Periode;
  maintenant?: Date;
};

const dans = (iso: string, b: Bornes) => {
  const t = new Date(iso).getTime();
  return t >= b.de.getTime() && t <= b.a.getTime();
};

const indexJour = (iso: string) => getISODay(new Date(iso)) - 1;

export function calculerStats(e: Entree): Stats {
  const b = bornes(e.periode, e.maintenant);

  const parIntervention = new Map<string, Evenement[]>();
  for (const ev of e.evenements) {
    const liste = parIntervention.get(ev.interventionId);
    if (liste) liste.push(ev);
    else parIntervention.set(ev.interventionId, [ev]);
  }

  /** Date de création : événement « creation » s'il existe, sinon creeLe. */
  const dateCreation = (i: Intervention) => parIntervention.get(i.id)?.find((ev) => ev.type === 'creation')?.creeLe ?? i.creeLe;

  /** Première date à laquelle l'intervention a atteint l'un des statuts ; repli sur majLe si le statut courant y est. */
  const dateStatut = (i: Intervention, statuts: Statut[]): string | null => {
    const evs = (parIntervention.get(i.id) ?? [])
      .filter((ev) => ev.type === 'statut' && ev.valeur && statuts.includes(ev.valeur as Statut))
      .sort((x, y) => x.creeLe.localeCompare(y.creeLe));
    if (evs.length) return evs[0].creeLe;
    return statuts.includes(i.statut) ? i.majLe : null;
  };

  const creees = e.interventions.filter((i) => dans(dateCreation(i), b));

  const livrees = e.interventions
    .map((i) => ({ i, le: dateStatut(i, ['livre']) }))
    .filter((x): x is { i: Intervention; le: string } => x.le !== null && dans(x.le, b));

  const delais = livrees.map(({ i, le }) => {
    const depuis = dateStatut(i, ['recu', 'en_cours']) ?? i.debut;
    return Math.max(0, differenceInMinutes(new Date(le), new Date(depuis))) / 1440;
  });
  const delaiMoyenJours = delais.length ? delais.reduce((s, d) => s + d, 0) / delais.length : null;

  const origines = (Object.keys(ORIGINES) as Origine[])
    .map((origine) => ({ origine, label: ORIGINES[origine].label, valeur: creees.filter((i) => i.origine === origine).length }))
    .sort((x, y) => y.valeur - x.valeur);

  const mecaniciens = e.membres
    .map((membre) => ({
      membre,
      valeur: e.interventions.filter((i) => {
        if (i.membreId !== membre.id) return false;
        const le = dateStatut(i, ['termine', 'livre']);
        return le !== null && dans(le, b);
      }).length,
    }))
    .sort((x, y) => y.valeur - x.valeur || x.membre.prenom.localeCompare(y.membre.prenom));

  const rdvParJour = JOURS.map((jour) => ({ jour, valeur: 0 }));
  for (const i of e.interventions) {
    if (i.statut !== 'annule' && dans(i.debut, b)) rdvParJour[indexJour(i.debut)].valeur += 1;
  }

  const appelsPeriode = e.appels.filter((a) => !a.enCours && dans(a.debut, b));
  let appels: Stats['appels'] = null;
  let appelsParJour: Stats['appelsParJour'] = null;
  if (e.receptionniste) {
    appels = {
      traites: appelsPeriode.length,
      horsHoraires: appelsPeriode.filter((a) => a.horsHoraires).length,
      rdvPris: appelsPeriode.filter((a) => a.issue === 'rdv_pris').length,
    };
    appelsParJour = JOURS.map((jour) => ({ jour, valeur: 0, horsHoraires: 0 }));
    for (const a of appelsPeriode) {
      const j = appelsParJour[indexJour(a.debut)];
      j.valeur += 1;
      if (a.horsHoraires) j.horsHoraires += 1;
    }
  }

  return {
    rendezVous: creees.length,
    livres: livrees.length,
    delaiMoyenJours,
    bloquees: e.interventions.filter(estBloquee).length,
    montantLivre: livrees.reduce((s, { i }) => s + (i.montantEstime ?? 0), 0),
    appels,
    origines,
    mecaniciens,
    rdvParJour,
    appelsParJour,
  };
}

/** « 1,4 j » */
export function joursDecimal(j: number): string {
  return `${j.toFixed(1).replace('.', ',')} j`;
}
