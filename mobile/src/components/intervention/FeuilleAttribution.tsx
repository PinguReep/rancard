/**
 * Choisir le mécanicien d’une intervention (ou retirer l’attribution). La
 * légende nomme la voiture. Le poste Réceptionnaire n’est pas proposé (il
 * ne prend pas de voiture), sauf s’il est déjà le titulaire. Un titulaire
 * dont l’accès est coupé reste affiché en tête, coché et non touchable,
 * pour qu’on voie à qui la voiture est encore confiée.
 *
 * v2c (E7) : sous chaque nom, sa charge le jour du rendez-vous (« 3
 * voitures · 4 h 30 demain »), calculée par `chargeDuJour` : voitures dont
 * le créneau tombe ce jour-là et voitures immobilisées, jamais les prêtes,
 * livrées ou annulées. Un rendez-vous passé (voiture déjà à l’atelier) se
 * lit sur aujourd’hui : c’est là qu’elle pèse.
 */

import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { ScrollView, View } from 'react-native';

import { Avatar, Feuille, Groupe, Icone, Legende, Ligne, Texte } from '@/components/ui';
import { chargeDuJour } from '@/domain/echeances';
import { POSTES } from '@/domain/permissions';
import type { Membre, Vehicule } from '@/domain/types';
import { jourCourt, titreVoiture } from '@/lib/format';
import { useDonnees } from '@/state/session';
import { useTheme } from '@/theme/tokens';

// ── Charge d’un membre (partagée avec la carte d’appel à valider)

export type Charge = { nb: number; minutes: number };

/** Jour où lire la charge : celui du rendez-vous, ou aujourd’hui s’il est passé ou absent. */
export function jourDeCharge(jour: Date | undefined, maintenant: Date): Date {
  const aujourdhui = startOfDay(maintenant);
  if (!jour || Number.isNaN(jour.getTime())) return aujourdhui;
  const j = startOfDay(jour);
  return j < aujourdhui ? aujourdhui : j;
}

/** « aujourd’hui », « demain », « le jeu. 29 oct. » */
export function quandCharge(jour: Date, maintenant: Date): string {
  const ecart = differenceInCalendarDays(jour, maintenant);
  if (ecart === 0) return 'aujourd’hui';
  if (ecart === 1) return 'demain';
  return `le ${jourCourt(jour.toISOString())}`;
}

/** Durée cumulée : « 45 min », « 4 h 30 », « 9 h » (jamais en jours, contrairement à `duree`). */
function heuresCumulees(minutes: number, parle: boolean): string {
  if (minutes < 60) return parle ? `${minutes} minutes` : `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (parle) return `${h} heure${h > 1 ? 's' : ''}${m ? ` ${m}` : ''}`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** « 3 voitures · 4 h 30 » ; `parle` : « 3 voitures, 4 heures 30 » (lecteur d’écran). */
export function voituresEtHeures(c: Charge, parle = false): string {
  if (c.nb === 0) return 'aucune voiture';
  const voitures = `${c.nb} voiture${c.nb > 1 ? 's' : ''}`;
  if (!c.minutes) return voitures;
  return `${voitures}${parle ? ', ' : ' · '}${heuresCumulees(c.minutes, parle)}`;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  /** Membre actuellement attribué */
  actuel: string | null;
  /** Membres actifs proposés */
  membres: Membre[];
  onChoisir: (membreId: string | null) => void;
  vehicule?: Vehicule;
  prestation?: string;
  /** Titre de la feuille (« Attribuer à » par défaut) */
  titre?: string;
  /** Légende à la place de la voiture (confier plusieurs voitures d’un coup) */
  legende?: string;
  /** Proposer « Non attribué » (oui par défaut) */
  retirable?: boolean;
  /** Jour du rendez-vous, pour la charge lue sous chaque nom (v2c, E7 ; défaut : aujourd’hui) */
  jour?: Date;
};

export function FeuilleAttribution({ ouverte, onFermer, actuel, membres, onChoisir, vehicule, prestation, titre = 'Attribuer à', legende, retirable = true, jour }: Props) {
  const t = useTheme();
  const tous = useDonnees((s) => s.membres);
  const interventions = useDonnees((s) => s.interventions);
  const titulaire = actuel ? tous.find((m) => m.id === actuel) : undefined;
  const titulaireCoupe = titulaire && !titulaire.actif ? titulaire : undefined;
  const proposes = membres.filter((m) => m.poste !== 'receptionnaire' || m.id === actuel);
  // « Renault Mégane III · AA-006-AA · Vidange »
  const sousTitre = legende ?? [vehicule ? titreVoiture(vehicule) : '', prestation ?? ''].filter(Boolean).join(' · ');
  const maintenant = new Date();
  const jourRetenu = jourDeCharge(jour, maintenant);
  const quand = quandCharge(jourRetenu, maintenant);

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre} legende={sousTitre || undefined}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <Groupe>
          {titulaireCoupe ? (
            <Ligne accessibilityLabel={`${titulaireCoupe.prenom} ${titulaireCoupe.nom}, accès coupé, titulaire actuel`}>
              <View className="opacity-50">
                <Avatar membre={titulaireCoupe} taille={32} />
              </View>
              <View className="flex-1">
                <Texte ton="muted">
                  {titulaireCoupe.prenom} {titulaireCoupe.nom} · accès coupé
                </Texte>
              </View>
              <Icone nom="valider" taille={18} couleur={t.muted} />
            </Ligne>
          ) : null}
          {proposes.map((m, k) => {
            const charge = chargeDuJour(interventions, m.id, jourRetenu);
            return (
              <Ligne
                key={m.id}
                derniere={!retirable && k === proposes.length - 1}
                onPress={() => onChoisir(m.id)}
                accessibilityLabel={`Attribuer à ${m.prenom} ${m.nom}, ${POSTES[m.poste].label.toLowerCase()}, ${voituresEtHeures(charge, true)} ${quand}${
                  actuel === m.id ? ', titulaire actuel' : ''
                }`}>
                <Avatar membre={m} taille={32} />
                <View className="flex-1">
                  <Texte>
                    {m.prenom} {m.nom}
                  </Texte>
                  <Legende>{`${majuscule(voituresEtHeures(charge))} ${quand}`}</Legende>
                </View>
                {actuel === m.id ? <Icone nom="valider" taille={18} couleur={t.accent} /> : null}
              </Ligne>
            );
          })}
          {retirable ? (
            <Ligne derniere onPress={() => onChoisir(null)} accessibilityLabel="Retirer l’attribution">
              <View className="h-8 w-8 rounded-full border border-dashed border-faint dark:border-faint-dark" />
              <Texte className="flex-1">Non attribué</Texte>
              {actuel === null ? <Icone nom="valider" taille={18} couleur={t.accent} /> : null}
            </Ligne>
          ) : null}
        </Groupe>
      </ScrollView>
    </Feuille>
  );
}
