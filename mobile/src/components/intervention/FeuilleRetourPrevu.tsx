/**
 * « Retour prévu » (v2c, E4) : l’heure promise au client pour une voiture
 * reçue, en cours ou prête, choisie par puces (jours, heures libres), sans
 * annuler ni déplacer le rendez-vous. Effet :
 * `modifierIntervention(i.id, { restitutionPrevue })` (null pour retirer),
 * puis avis « Retour prévu jeu. 29 17:00 · Volkswagen Polo AA-004-AA »
 * par `onAvis`. La trace d’équipe (événement `retour_prevu`, non visible du
 * client) est écrite par la base ; la page de suivi lit la date seule.
 *
 * Repris de la section « Retour prévu » de la feuille Horaire de la v2b,
 * corrigé : heures libres (12:00, 14:00, 17:00 et la fermeture, pas
 * seulement le soir), « Sans heure », « Autre date… » au-delà des puces,
 * bouton qui dit la cible.
 */

import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import { useMemo, useState, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';

import { plageDuJour } from '@/components/nouvelle-intervention/creneaux';
import { Bouton, Erreur, Feuille, FeuilleDate, Legende, PucesHeures, PucesJours, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { heuresDuJour, heuresProposees, joursOuvres } from '@/domain/echeances';
import type { Client, Garage, Intervention, Vehicule } from '@/domain/types';
import { heure, jourLongClient, jourProche, memeJour, sansHeure, titreVoiture, voitureEtPlaque } from '@/lib/format';

export type PropsFeuilleRetourPrevu = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  horaires: Garage['horaires'];
  onAvis: (texte: string) => void;
};

/** Jours proposés en puces : aujourd’hui (s’il reste une heure), demain et les jours ouvrés suivants. */
const JOURS_PROPOSES = 5;

const aHeure = (jour: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return setMinutes(setHours(startOfDay(jour), Number.isFinite(h) ? h : 0), Number.isFinite(m) ? m : 0);
};

/** L’heure « 18:30 » tombe dans les heures d’ouverture de ce jour, et n’est pas passée. */
function heureTient(horaires: Garage['horaires'], jour: Date, hhmm: string, maintenant: Date): boolean {
  const plage = plageDuJour(horaires, jour);
  if (!plage || hhmm < plage.de || hhmm > plage.a) return false;
  return !memeJour(jour, maintenant) || aHeure(jour, hhmm) > maintenant;
}

/** « aujourd’hui 17:00 », « jeu. 29 17:00 », « 10 nov. » (sans heure, au-delà de six jours). */
function quandCourt(iso: string, maintenant: Date): string {
  const jour = memeJour(new Date(iso), maintenant) ? 'aujourd’hui' : jourProche(iso, maintenant);
  return sansHeure(iso) ? jour : `${jour} ${heure(iso)}`;
}

/** Le jour tel que l’écrit la page de suivi (« Retour prévu demain », « … jeudi 29 octobre »). */
function jourPage(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (memeJour(d, maintenant)) return 'aujourd’hui';
  if (memeJour(d, addDays(maintenant, 1))) return 'demain';
  return jourLongClient(iso, maintenant);
}

export function FeuilleRetourPrevu({ ouverte, onFermer, intervention, client, vehicule, horaires, onAvis }: PropsFeuilleRetourPrevu): ReactElement {
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : '';
  const legende = [titreVoiture(vehicule), nomClient].filter(Boolean).join(' · ');
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Retour prévu" legende={legende}>
      {/* Le contenu naît à l’ouverture : les choix repartent toujours du retour enregistré. */}
      {ouverte ? <Choix intervention={intervention} vehicule={vehicule} horaires={horaires} onFermer={onFermer} onAvis={onAvis} /> : null}
    </Feuille>
  );
}

type PropsChoix = Pick<PropsFeuilleRetourPrevu, 'intervention' | 'vehicule' | 'horaires' | 'onFermer' | 'onAvis'>;

function Choix({ intervention: i, vehicule, horaires, onFermer, onAvis }: PropsChoix) {
  const [maintenant] = useState(() => new Date());
  const actuel = i.restitutionPrevue ?? null;

  // Aujourd’hui seulement s’il reste une heure à proposer (pas de retour promis après la fermeture).
  const jours = useMemo(
    () =>
      joursOuvres(horaires, maintenant, JOURS_PROPOSES + 1)
        .filter((d) => !memeJour(d, maintenant) || heuresProposees(horaires, d, maintenant).length > 0)
        .slice(0, JOURS_PROPOSES),
    [horaires, maintenant],
  );
  // Le retour déjà promis est choisi d’emblée : on voit d’où l’on part.
  const [jour, setJour] = useState<Date | null>(() => (actuel ? startOfDay(new Date(actuel)) : null));
  const [hm, setHm] = useState<string | null>(() => (actuel && !sansHeure(actuel) ? heure(actuel) : null));
  const [dateOuverte, setDateOuverte] = useState(false);
  const [retrait, setRetrait] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const heures = useMemo(() => (jour ? heuresProposees(horaires, jour, maintenant) : []), [horaires, jour, maintenant]);
  const autres = useMemo(() => (jour ? heuresDuJour(horaires, jour, maintenant) : []), [horaires, jour, maintenant]);
  const iso = jour ? (hm ? aHeure(jour, hm) : startOfDay(jour)).toISOString() : null;
  const inchange = iso !== null && actuel !== null && new Date(iso).getTime() === new Date(actuel).getTime();
  const auGarage = i.statut === 'recu' || i.statut === 'en_cours';
  const nom = voitureEtPlaque(vehicule);

  function choisirJour(d: Date) {
    setJour(d);
    // L’heure choisie suit si le garage est ouvert à cette heure-là ce jour-là (et qu’elle n’est pas passée).
    if (hm && !heureTient(horaires, d, hm, maintenant)) setHm(null);
  }

  async function enregistrer(valeur: string | null): Promise<void> {
    setErreur(null);
    try {
      await repo().modifierIntervention(i.id, { restitutionPrevue: valeur });
    } catch (e) {
      impulsion('erreur');
      setErreur((e as Error).message || 'Impossible d’enregistrer le retour prévu.');
      return;
    }
    impulsion('succes');
    onFermer();
    onAvis(valeur ? `Retour prévu ${quandCourt(valeur, maintenant)} · ${nom}` : `Retour prévu retiré · ${nom}`);
  }

  async function retirer() {
    if (retrait) return;
    setRetrait(true);
    try {
      await enregistrer(null);
    } finally {
      setRetrait(false);
    }
  }

  // Ce que lira le client, dit avant le geste.
  const phrase = !auGarage
    ? null
    : iso
      ? `Le client lira « Retour prévu ${jourPage(iso, maintenant)} » sur sa page de suivi, sans l’heure.`
      : 'Choisissez le jour promis au client.';

  return (
    <>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
        <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
          Jour
        </Legende>
        <PucesJours jours={jours} valeur={jour} onChoisir={choisirJour} autreDate={() => setDateOuverte(true)} />

        {jour ? (
          <>
            <Legende accessibilityRole="header" className="mb-1.5 ml-1 mt-5 font-medium">
              Heure
            </Legende>
            <PucesHeures heures={heures} autres={autres} valeur={hm} onChoisir={setHm} sansHeure />
          </>
        ) : null}
        <View className="h-1" />
      </ScrollView>

      {/* Sous le pouce : ce que lira le client, puis le geste. */}
      <View className="mt-4 gap-2">
        {phrase ? (
          <Legende className="ml-1" accessibilityLiveRegion="polite">
            {phrase}
          </Legende>
        ) : null}
        <Bouton
          onPress={() => (iso ? enregistrer(iso) : undefined)}
          desactive={iso === null || inchange}
          accessibilityLabel={iso && !inchange ? `Enregistrer le retour prévu de ${nom} : ${quandCourt(iso, maintenant)}` : undefined}>
          {iso && !inchange ? `Enregistrer · ${quandCourt(iso, maintenant)}` : 'Enregistrer'}
        </Bouton>
        {actuel ? (
          <Bouton variante="discret" onPress={retirer} chargement={retrait} accessibilityLabel={`Retirer le retour prévu de ${nom}`}>
            Retirer le retour prévu
          </Bouton>
        ) : null}
        {erreur ? <Erreur className="ml-1">{erreur}</Erreur> : null}
      </View>

      {/* Au-delà des puces : la grille du mois, rendue dans cette feuille (une fenêtre modale à la fois sur iOS). */}
      <FeuilleDate
        ouverte={dateOuverte}
        onFermer={() => setDateOuverte(false)}
        titre="Retour prévu le…"
        horaires={horaires}
        valeur={jour}
        min={startOfDay(maintenant)}
        onChoisir={(d) => {
          choisirJour(d);
          setDateOuverte(false);
        }}
      />
    </>
  );
}
