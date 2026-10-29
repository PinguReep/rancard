/**
 * Annuler une intervention (P3) : le motif, puis la phrase exacte que lira
 * le client. « Le client annule » est choisi d’office ; « Le garage annule »
 * et « Client non venu » changent la phrase de sa page de suivi. Une
 * demande encore « À valider » s’annule sans rien publier : le client n’a
 * pas de rendez-vous confirmé.
 *
 * Réservée à qui peut créer des interventions (D3 : jamais le mécanicien) ;
 * l’écran ne l’ouvre que si `actionsPossibles` propose l’annulation. Le
 * geste passe par `passage.passer(i, 'annule', { motif })` : garde, avis à
 * bouton « Annuler », note client écrite par le serveur.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Puce, Puces } from '@/components/nouvelle-intervention/Puce';
import { FeuilleConfirmation, Secondaire } from '@/components/ui';
import { LISTE_MOTIFS_ANNULATION, MOTIFS_ANNULATION, phraseAnnulation } from '@/domain/statuts';
import type { Client, Intervention, MotifAnnulation, Vehicule } from '@/domain/types';
import { titreVoiture } from '@/lib/format';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Fait le geste ; une erreur levée laisse la feuille ouverte (l’écran l’affiche en avis). */
  onAnnuler: (motif: MotifAnnulation) => Promise<void>;
};

export function FeuilleAnnulation({ ouverte, onFermer, intervention: i, client, vehicule, onAnnuler }: Props) {
  const [motif, setMotif] = useState<MotifAnnulation>('client');

  // Chaque ouverture repart de « Le client annule ».
  useEffect(() => {
    if (ouverte) setMotif('client');
  }, [ouverte]);

  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : null;
  const legende = [titreVoiture(vehicule), nomClient].filter(Boolean).join(' · ');
  const demande = i.statut === 'a_valider';

  return (
    <FeuilleConfirmation
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Annuler l’intervention ?"
      legende={legende}
      libelle="Annuler l’intervention"
      libelleRetour="Garder"
      variante="danger"
      onConfirmer={() => onAnnuler(motif)}>
      <View className="mb-5">
        <Puces>
          {LISTE_MOTIFS_ANNULATION.map((m) => (
            <Puce
              key={m}
              label={MOTIFS_ANNULATION[m].label}
              active={motif === m}
              onPress={() => setMotif(m)}
              accessibilityLabel={`Motif : ${MOTIFS_ANNULATION[m].label}`}
            />
          ))}
        </Puces>
        <Secondaire className="mt-4" accessibilityLiveRegion="polite">
          {demande
            ? 'La demande n’était pas confirmée : rien n’est publié pour le client.'
            : `Le client lira « ${phraseAnnulation(motif)} » sur sa page de suivi.`}
        </Secondaire>
      </View>
    </FeuilleConfirmation>
  );
}
