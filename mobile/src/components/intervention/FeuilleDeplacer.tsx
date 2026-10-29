/**
 * Déplacer un rendez-vous sans l’annuler : même fiche, même lien de suivi,
 * même mécanicien, même appel lié, même montant. On choisit un jour, un
 * créneau et une durée avec les puces de l’assistant de création (aujourd’hui
 * à J+6, puis « Autre date… » au-delà), et le bouton dit la cible
 * (« Déplacer au mar. 3 nov. 08:30 »). Le créneau actuel est marqué
 * « Actuel ».
 *
 * Une écriture (`modifierIntervention`, début et durée) : la trace d’équipe
 * et, pour un rendez-vous confirmé, la phrase « Rendez-vous déplacé au … »
 * de la page de suivi sont écrites par la base (J9). Une demande encore
 * « À valider » se déplace sans rien publier : le client n’a pas encore de
 * rendez-vous. La feuille ne publie plus de note elle-même.
 *
 * Mode `reprogrammer` (fiche annulée) : créneaux à venir seulement, une
 * écriture (`passage.passer(i, 'planifie', { debut, dureeMin })`, reçue par
 * `onReprogrammer`) ; le client lit « Rendez-vous confirmé. » puis
 * « Rendez-vous déplacé au … ». Plus de « Réactiver » à la date passée.
 */

import { addDays, addMilliseconds, format, isAfter, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import {
  DUREES,
  creneauxDuJour,
  horairesRenseignes,
  joursProchains,
  plageDuJour,
  premierCreneauLibre,
  premierJourDisponible,
} from '@/components/nouvelle-intervention/creneaux';
import { Puce, Puces } from '@/components/nouvelle-intervention/Puce';
import { Bouton, Erreur, Feuille, FeuilleDate, Icone, Legende, Secondaire, impulsion } from '@/components/ui';
import { HORIZON_FEUILLE_DATE_JOURS } from '@/components/ui/feuille-date';
import { repo } from '@/data';
import { STATUTS, phraseDeplacementClient } from '@/domain/statuts';
import type { Client, Garage, Intervention, Permissions, Vehicule } from '@/domain/types';
import { duree as libelleDuree, jourHeure, titreVoiture, voitureEtPlaque } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

/**
 * Seuls un rendez-vous confirmé ou une demande à valider se déplacent, et
 * seulement par qui peut créer des interventions : une voiture déjà au
 * garage ne change plus de créneau (elle a un retour prévu).
 */
export function peutDeplacer(i: Intervention, p: Permissions): boolean {
  return p.creer && (i.statut === 'a_valider' || i.statut === 'planifie');
}

/** Jours proposés en puces avant « Autre date… » : aujourd’hui à J+6, comme le planning. */
const JOURS_BANDE = 7;

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  horaires: Garage['horaires'];
  /** Avis de fin, sans bouton (« Déplacé au mar. 3 nov. 08:30 · Volkswagen Polo AA-004-AA ») */
  onAvis: (texte: string) => void;
  /**
   * `reprogrammer` rouvre une fiche annulée sur un créneau futur, en une
   * écriture (`passage.passer(i, 'planifie', { debut, dureeMin })`, reçue
   * par `onReprogrammer`). Défaut : `deplacer`.
   */
  mode?: 'deplacer' | 'reprogrammer';
  /** Mode `reprogrammer` : fait le geste (garde et avis compris, par `FeuillesPassage`) */
  onReprogrammer?: (o: { debut: string; dureeMin: number }) => Promise<void>;
};

export function FeuilleDeplacer({ ouverte, onFermer, intervention, client, vehicule, horaires, onAvis, mode = 'deplacer', onReprogrammer }: Props) {
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : '';
  const legende = [titreVoiture(vehicule), nomClient].filter(Boolean).join(' · ');
  const reprogrammer = mode === 'reprogrammer';

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={reprogrammer ? 'Reprogrammer' : 'Déplacer le rendez-vous'} legende={legende}>
      {/* Le contenu naît à l’ouverture : les choix repartent toujours du rendez-vous actuel. */}
      {ouverte ? (
        <Choix
          intervention={intervention}
          vehicule={vehicule}
          horaires={horaires}
          onFermer={onFermer}
          onAvis={onAvis}
          reprogrammer={reprogrammer ? onReprogrammer : undefined}
        />
      ) : null}
    </Feuille>
  );
}

type ChoixProps = {
  intervention: Intervention;
  vehicule?: Vehicule;
  horaires: Garage['horaires'];
  onFermer: () => void;
  onAvis: (texte: string) => void;
  /** Mode « Reprogrammer » (fiche annulée) : le geste, à la place du déplacement */
  reprogrammer?: (o: { debut: string; dureeMin: number }) => Promise<void>;
};

/**
 * Jour et créneau de départ : ceux du rendez-vous s’il est à venir (même
 * au-delà de J+6, dans l’horizon de la grille du mois) et tombe un jour
 * ouvert (fiche annulée comprise : son créneau, s’il est encore à venir,
 * se reprend tel quel) ; sinon le premier jour qui a encore un créneau
 * libre, et ce créneau. On repart donc toujours d’un créneau futur.
 */
function depart(i: Intervention, horaires: Garage['horaires'], maintenant: Date): { jour: Date; creneau: string | null } {
  const debut = new Date(i.debut);
  const horizon = addDays(startOfDay(maintenant), HORIZON_FEUILLE_DATE_JOURS);
  if (debut > maintenant && !isAfter(debut, horizon) && plageDuJour(horaires, debut)) {
    const jour = startOfDay(debut);
    // Un horaire hors de la grille de 30 min est gardé tel quel (aucune puce allumée).
    const puce = creneauxDuJour(jour, horaires, maintenant).find((c) => new Date(c.iso).getTime() === debut.getTime());
    return { jour, creneau: puce?.iso ?? i.debut };
  }
  const jours = joursProchains(horaires, JOURS_BANDE, maintenant);
  const j = premierJourDisponible(jours, horaires, maintenant) ?? jours[0];
  return { jour: j.date, creneau: premierCreneauLibre(j.date, horaires, maintenant)?.iso ?? null };
}

/** « mar. 10 nov. » : un jour choisi hors de la bande. */
const jourHorsBande = (d: Date) => format(d, 'EEE d MMM', { locale: fr });

function Choix({ intervention: i, vehicule, horaires, onFermer, onAvis, reprogrammer }: ChoixProps) {
  const t = useTheme();
  const [maintenant] = useState(() => new Date());
  const [initial] = useState(() => depart(i, horaires, maintenant));
  const [jour, setJour] = useState<Date>(initial.jour);
  const [creneau, setCreneau] = useState<string | null>(initial.creneau);
  const [dureeMin, setDureeMin] = useState(i.dureeMin);
  const [envoi, setEnvoi] = useState(false);
  const [dateOuverte, setDateOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const bandeJours = useRef<ScrollView>(null);
  const { width: largeur } = useWindowDimensions();

  const jours = useMemo(() => joursProchains(horaires, JOURS_BANDE, maintenant), [horaires, maintenant]);
  const dansBande = jours.some((j) => isSameDay(j.date, jour));
  const ferme = !plageDuJour(horaires, jour);
  const creneaux = useMemo(() => creneauxDuJour(jour, horaires, maintenant), [jour, horaires, maintenant]);
  const creneauxAVenir = creneaux.filter((c) => !c.passe);
  // La durée actuelle reste proposée même si elle n’est pas parmi les puces (1 h 30…).
  const durees = DUREES.some((d) => d.min === i.dureeMin)
    ? DUREES
    : [...DUREES, { min: i.dureeMin, label: libelleDuree(i.dureeMin) }].sort((a, b) => a.min - b.min);

  const debutActuel = new Date(i.debut).getTime();
  const bouge = creneau !== null && new Date(creneau).getTime() !== debutActuel;
  const change = bouge || dureeMin !== i.dureeMin;
  const confirme = i.statut === 'planifie';
  const nom = voitureEtPlaque(vehicule);

  function choisirJour(d: Date) {
    if (isSameDay(d, jour)) return;
    setJour(d);
    setErreur(null);
    // Changer de jour propose son premier créneau libre plutôt qu’un créneau vide ; le jour du rendez-vous repart de son créneau.
    const actuel = !reprogrammer && isSameDay(d, initial.jour) ? initial.creneau : null;
    setCreneau(actuel ?? premierCreneauLibre(d, horaires, maintenant)?.iso ?? null);
  }

  // Ce que lira le client, dit avant le geste (règle des confirmations).
  function phrase(): string {
    if (!creneau) return 'Choisissez un créneau.';
    if (reprogrammer) {
      // Le créneau d’origine, encore à venir, se reprend sans « déplacé » (J9 : début inchangé).
      const lu = `Le client lira « ${STATUTS.planifie.client} »`;
      return bouge ? `${lu} puis « ${phraseDeplacementClient(creneau, maintenant)} »` : lu;
    }
    if (!change) return 'Choisissez le nouveau jour ou le nouveau créneau.';
    if (!bouge) return 'Seule la durée change : rien ne change pour le client.';
    if (!confirme) return 'Le rendez-vous reste à confirmer : rien n’est publié pour le client.';
    return `Le client lira « ${phraseDeplacementClient(creneau, maintenant)} »`;
  }

  /** Libellé du bouton : la cible, dite avant le geste. */
  function libelle(): string {
    if (reprogrammer) return creneau ? `Reprogrammer au ${jourHeure(creneau)}` : 'Reprogrammer';
    if (!creneau || !change) return 'Déplacer';
    if (!bouge) return `Changer la durée · ${libelleDuree(dureeMin)}`;
    return `Déplacer au ${jourHeure(creneau)}`;
  }

  async function valider() {
    if (reprogrammer) {
      // Reprogrammer : un créneau à venir suffit (l’ancien, passé, n’est pas proposé).
      if (!creneau || envoi) return;
      setEnvoi(true);
      try {
        await reprogrammer({ debut: creneau, dureeMin });
      } finally {
        setEnvoi(false);
        onFermer();
      }
      return;
    }
    if (!creneau || !change || envoi) return;
    setEnvoi(true);
    setErreur(null);
    const patch: { debut: string; dureeMin: number; restitutionPrevue?: string } = { debut: creneau, dureeMin };
    // Une restitution déjà prévue suit le rendez-vous du même écart.
    if (i.restitutionPrevue && bouge) {
      const ecart = new Date(creneau).getTime() - debutActuel;
      patch.restitutionPrevue = addMilliseconds(new Date(i.restitutionPrevue), ecart).toISOString();
    }
    try {
      await repo().modifierIntervention(i.id, patch);
    } catch (e) {
      impulsion('erreur');
      setEnvoi(false);
      setErreur((e as Error).message || 'Impossible de déplacer le rendez-vous.');
      return;
    }
    impulsion('succes');
    setEnvoi(false);
    onFermer();
    // Le déplacement ne se défait pas d’un appui : l’avis le nomme, sans bouton.
    onAvis(bouge ? `Déplacé au ${jourHeure(creneau)} · ${nom}` : `Durée ${libelleDuree(dureeMin)} · ${nom}`);
  }

  return (
    <>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
          Jour
        </Legende>
        <ScrollView ref={bandeJours} horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {jours.map((j) => (
            <View
              key={j.cle}
              // Le jour du rendez-vous est montré à l’ouverture, même s’il tombe hors de l’écran (J+5, J+6).
              onLayout={
                isSameDay(j.date, initial.jour)
                  ? (e) => {
                      const { x, width } = e.nativeEvent.layout;
                      if (x + width > largeur - 16) bandeJours.current?.scrollTo({ x: Math.max(0, x - 56), animated: false });
                    }
                  : undefined
              }>
              <Puce
                label={j.label}
                active={isSameDay(j.date, jour)}
                desactivee={j.ferme}
                accessibilityLabel={j.ferme ? `${j.label}, fermé` : j.label}
                onPress={() => choisirJour(j.date)}
              />
            </View>
          ))}
          {!dansBande ? (
            <View
              // Un jour choisi au-delà de J+6 se montre en bout de bande.
              onLayout={() => bandeJours.current?.scrollToEnd({ animated: false })}>
              <Puce
                label={jourHorsBande(jour)}
                active
                accessibilityLabel={`${format(jour, 'EEEE d MMMM', { locale: fr })}, choisi`}
                onPress={() => setDateOuverte(true)}
              />
            </View>
          ) : null}
          <Puce
            label="Autre date…"
            active={false}
            icone={<Icone nom="calendrier" taille={15} couleur={t.accent} />}
            accessibilityLabel="Choisir une autre date"
            onPress={() => setDateOuverte(true)}
          />
        </ScrollView>

        <Legende accessibilityRole="header" className="mb-1.5 ml-1 mt-5 font-medium">
          Créneau
        </Legende>
        {ferme ? (
          <Legende className="ml-1">Le garage est fermé ce jour.</Legende>
        ) : creneauxAVenir.length === 0 ? (
          <Legende className="ml-1">Plus de créneau aujourd’hui, choisissez un autre jour.</Legende>
        ) : (
          <Puces>
            {creneaux.map((c) => {
              const actuel = !reprogrammer && new Date(c.iso).getTime() === debutActuel;
              return (
                <Puce
                  key={c.iso}
                  label={actuel ? `${c.label} · Actuel` : c.label}
                  active={creneau !== null && new Date(creneau).getTime() === new Date(c.iso).getTime()}
                  desactivee={c.passe}
                  accessibilityLabel={c.passe ? `${c.label}, passé` : actuel ? `${c.label}, créneau actuel` : c.label}
                  onPress={() => {
                    setCreneau(c.iso);
                    setErreur(null);
                  }}
                />
              );
            })}
          </Puces>
        )}
        {!horairesRenseignes(horaires) ? (
          <Legende className="ml-1 mt-2">Horaires non renseignés dans « Le garage » : créneaux proposés de 8h à 18h.</Legende>
        ) : null}

        <Legende accessibilityRole="header" className="mb-1.5 ml-1 mt-5 font-medium">
          Durée prévue
        </Legende>
        <Puces>
          {durees.map((d) => (
            <Puce key={d.min} label={d.label} active={dureeMin === d.min} onPress={() => setDureeMin(d.min)} />
          ))}
        </Puces>
        <View className="h-1" />
      </ScrollView>

      {/* Sous le pouce : ce que lira le client, puis le geste. */}
      <View className="mt-4 gap-3">
        <Secondaire className="ml-1" accessibilityLiveRegion="polite">
          {phrase()}
        </Secondaire>
        <Bouton
          onPress={valider}
          desactive={!creneau || (!reprogrammer && !change)}
          chargement={envoi}
          accessibilityLabel={creneau && (reprogrammer || change) ? `${libelle()} : ${nom}` : libelle()}>
          {libelle()}
        </Bouton>
        {erreur ? <Erreur className="ml-1">{erreur}</Erreur> : null}
      </View>

      {/* Au-delà de J+6 (P5) : la grille du mois, rendue dans cette feuille (une fenêtre modale à la fois sur iOS). */}
      <FeuilleDate
        ouverte={dateOuverte}
        onFermer={() => setDateOuverte(false)}
        titre={reprogrammer ? 'Reprogrammer au…' : 'Déplacer au…'}
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
