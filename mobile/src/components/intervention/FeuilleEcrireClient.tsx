/**
 * « Écrire à Hugo » : la bulle « Écrire un SMS » de la fiche, quand le
 * garage a activé la rédaction des SMS par l’IA (option `redactionIa`).
 * Sans l’option, la bulle ouvre directement l’app SMS du téléphone, comme
 * avant.
 *
 * Une action principale : « Écrire depuis mes SMS », qui ouvre l’app SMS du
 * téléphone avec le texte du champ (le membre peut encore le modifier
 * là-bas, rien ne part d’ici). L’objet du message est choisi d’après la
 * fiche (voiture prête, pièce ou accord attendu, rendez-vous à venir) et se
 * change d’un appui ; il donne le texte habituel, que « Rédiger avec l’IA »
 * peut remplacer. La note dit en quelques mots ce que l’équipe veut
 * transmettre ; elle part filtrée vers l’IA (noms, numéros, plaques retirés
 * par le serveur), l’aide demande de n’y mettre que l’essentiel.
 */

import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Puce, Puces } from '@/components/nouvelle-intervention/Puce';
import { Bouton, Champ, Feuille, Legende, impulsion } from '@/components/ui';
import type { Client, Intervention, Vehicule } from '@/domain/types';
import { appelClient, nomClient, titreVoiture } from '@/lib/format';
import { INTENTIONS_SMS, LIBELLES_INTENTION, montantSms, quandSms, texteHabituel, type IntentionSms } from '@/lib/redaction';
import { lienSuivi, smsHref } from '@/lib/suivi';
import { useDonnees, usePermissions } from '@/state/session';

import { AuDessusDuClavier, RedactionSms } from './RedactionSms';

/** Objet proposé à l’ouverture, d’après l’état de la fiche. */
export function intentionDe(i: Pick<Intervention, 'statut' | 'blocage' | 'debut'>, maintenant = new Date()): IntentionSms {
  if (i.statut === 'termine') return 'pret';
  if (i.blocage === 'attente_piece') return 'piece';
  if (i.blocage === 'attente_accord') return 'devis';
  if ((i.statut === 'planifie' || i.statut === 'a_valider') && new Date(i.debut).getTime() > maintenant.getTime()) return 'rappel';
  return 'libre';
}

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  /** Mobile du client (lien `sms:`) */
  telephone: string;
};

export function FeuilleEcrireClient({ ouverte, onFermer, intervention, client, vehicule, telephone }: Props) {
  return (
    <Feuille
      ouverte={ouverte}
      onFermer={onFermer}
      titre={`Écrire à ${nomClient(client, 'le client')}`}
      legende={titreVoiture(vehicule)}>
      {/* Chaque ouverture repart de l’objet de la fiche et du texte habituel. */}
      {ouverte ? (
        <Contenu key={intervention.id} intervention={intervention} client={client} telephone={telephone} onFermer={onFermer} />
      ) : null}
    </Feuille>
  );
}

function Contenu({ intervention: i, client, telephone, onFermer }: Pick<Props, 'intervention' | 'client' | 'telephone' | 'onFermer'>) {
  const garage = useDonnees((s) => s.garage);
  const p = usePermissions();
  const qui = appelClient(client);

  const habituel = (intention: IntentionSms) =>
    texteHabituel(intention, {
      prenom: client?.prenom ?? '',
      garage: garage.nom,
      texteSmsPret: garage.texteSmsPret,
      // Aucun montant sans « Voir les montants ».
      montant: p.voirPrix && i.montantEstime != null ? montantSms(i.montantEstime) : null,
      lien: lienSuivi(i.suiviToken),
      quand: new Date(i.debut).getTime() > Date.now() ? quandSms(i.debut) : undefined,
    });

  const [intention, setIntention] = useState<IntentionSms>(() => intentionDe(i));
  const [texte, setTexte] = useState(() => habituel(intentionDe(i)));
  const [note, setNote] = useState('');

  function choisir(autre: IntentionSms) {
    if (autre === intention) return;
    // Un autre objet dit autre chose : le champ repart de son texte habituel.
    setIntention(autre);
    setTexte(habituel(autre));
  }

  function ecrire() {
    impulsion('moyen');
    void Linking.openURL(smsHref(telephone, texte.trim()));
    onFermer();
  }

  return (
    <AuDessusDuClavier>
      <Legende accessibilityRole="header" className="mb-1.5 ml-1 font-medium">
        Objet
      </Legende>
      <Puces>
        {INTENTIONS_SMS.map((x) => (
          <Puce key={x} label={LIBELLES_INTENTION[x]} active={x === intention} onPress={() => choisir(x)} accessibilityLabel={`Objet : ${LIBELLES_INTENTION[x]}`} />
        ))}
      </Puces>
      <Champ
        className="mb-0 mt-4"
        libelle={intention === 'libre' ? 'Ce que vous voulez dire' : 'Ce que vous voulez ajouter (facultatif)'}
        value={note}
        onChangeText={setNote}
        placeholder={intention === 'libre' ? 'Ex. plaquettes changées, prête ce soir' : 'Ex. lavage offert'}
        aide="L’essentiel seulement, sans nom ni numéro."
        maxLength={300}
        returnKeyType="done"
      />
      <View className="mt-4">
        <RedactionSms key={intention} interventionId={i.id} intention={intention} note={note} texte={texte} onTexte={setTexte} qui={qui} />
      </View>
      <View className="mt-4">
        <Bouton onPress={ecrire} desactive={!texte.trim()} accessibilityLabel={`Ouvrir l’app SMS du téléphone avec ce message pour ${qui}`}>
          Écrire depuis mes SMS
        </Bouton>
      </View>
      <Legende className="ml-1 mt-2">{'Le message s’ouvre dans l’app SMS du téléphone : rien ne part avant votre envoi.'}</Legende>
    </AuDessusDuClavier>
  );
}
