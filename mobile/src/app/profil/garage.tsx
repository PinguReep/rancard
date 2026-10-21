/**
 * Le garage (gérant) : identité, horaires, SMS, réceptionniste. Chaque
 * champ s'enregistre au blur, chaque interrupteur tout de suite.
 */

import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { LigneHoraire, ORDRE_JOURS, type Plage } from '@/components/profil/LigneHoraire';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Carte, Champ, Ecran, Etiquette, Groupe, Legende, Section, Texte, Vide, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import type { Garage } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { formaterTelephone, gabaritSms } from '@/lib/format';
import { useDonnees } from '@/state/session';

const EXPEDITEUR = /^[A-Z0-9]{3,11}$/;

export default function ReglagesGarage() {
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const garage = useDonnees((s) => s.garage);

  const [nom, setNom] = useState(garage.nom);
  const [adresse, setAdresse] = useState(garage.adresse);
  const [telephone, setTelephone] = useState(garage.telephone);
  const [expediteur, setExpediteur] = useState(garage.expediteurSms);
  const [erreurExpediteur, setErreurExpediteur] = useState<string | null>(null);
  const [texteSms, setTexteSms] = useState(garage.texteSmsPret);
  const [avis, montrerAvis] = useAvis();

  if (!estGerant(moi)) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Le garage' }} />
        <Vide icone="cadenas" titre="Réservé au gérant" texte="Seul un gérant peut modifier les réglages du garage." />
      </Ecran>
    );
  }

  function enregistrer(patch: Partial<Omit<Garage, 'id'>>) {
    ecrire(repo().modifierGarage(patch), montrerAvis, 'Le réglage n’a pas pu être enregistré.');
  }

  function options(patch: Partial<Garage['options']>) {
    enregistrer({ options: { ...garage.options, ...patch } });
  }

  function horaire(jour: number, plage: Plage | null) {
    enregistrer({ horaires: { ...garage.horaires, [jour]: plage } });
  }

  function validerNom() {
    const v = nom.trim();
    if (!v) {
      setNom(garage.nom);
      return;
    }
    if (v !== garage.nom) {
      impulsion();
      enregistrer({ nom: v });
    }
  }

  function validerAdresse() {
    const v = adresse.trim();
    if (v !== garage.adresse) {
      impulsion();
      enregistrer({ adresse: v });
    }
  }

  function validerTelephone() {
    const v = formaterTelephone(telephone);
    setTelephone(v);
    if (v !== garage.telephone) {
      impulsion();
      enregistrer({ telephone: v });
    }
  }

  function validerExpediteur() {
    if (!EXPEDITEUR.test(expediteur)) {
      setErreurExpediteur('Entre 3 et 11 caractères, lettres et chiffres seulement.');
      impulsion('erreur');
      return;
    }
    setErreurExpediteur(null);
    if (expediteur !== garage.expediteurSms) {
      impulsion();
      enregistrer({ expediteurSms: expediteur });
    }
  }

  function validerTexteSms() {
    const v = texteSms.trim();
    if (!v) {
      setTexteSms(garage.texteSmsPret);
      return;
    }
    if (v !== garage.texteSmsPret) {
      impulsion();
      enregistrer({ texteSmsPret: v });
    }
  }

  const apercu = gabaritSms(texteSms, { prenom: 'Élodie', garage: garage.nom });
  const sms = garage.options.sms;

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Le garage' }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <Section titre="Identité">
          <Champ libelle="Nom du garage" value={nom} onChangeText={setNom} onBlur={validerNom} autoCapitalize="words" returnKeyType="done" />
          <Champ libelle="Adresse" value={adresse} onChangeText={setAdresse} onBlur={validerAdresse} placeholder="12 rue de la République, 99001 Villefictive" returnKeyType="done" />
          <Champ libelle="Téléphone" type="telephone" value={telephone} onChangeText={setTelephone} onBlur={validerTelephone} className="mb-0" />
        </Section>

        <Groupe titre="Horaires">
          {ORDRE_JOURS.map((jour, i) => (
            <LigneHoraire key={jour} jour={jour} plage={garage.horaires[jour] ?? null} onChange={(p) => horaire(jour, p)} derniere={i === ORDRE_JOURS.length - 1} />
          ))}
        </Groupe>

        <Groupe titre="SMS" note={sms ? undefined : 'Sans SMS, l’équipe prévient le client par téléphone depuis la fiche.'}>
          <LigneInterrupteur titre="SMS aux clients" aide="Véhicule prêt, rappels de rendez-vous." valeur={sms} onChange={(v) => options({ sms: v })} derniere={!sms} />
          {sms ? (
            <LigneInterrupteur
              titre="Envoi automatique"
              aide="Le SMS « véhicule prêt » part dès le changement de statut, sans confirmation."
              valeur={garage.options.smsAutomatique}
              onChange={(v) => options({ smsAutomatique: v })}
              derniere
            />
          ) : null}
        </Groupe>

        {sms ? (
          <>
            <Champ
              libelle="Expéditeur"
              type="plaque"
              value={expediteur}
              onChangeText={(v) => {
                setExpediteur(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11));
                setErreurExpediteur(null);
              }}
              onBlur={validerExpediteur}
              erreur={erreurExpediteur}
              aide="Nom affiché sur le téléphone du client. 11 caractères maximum, lettres et chiffres, sans espace (ex. GARAGEFICTI)."
              maxLength={11}
              returnKeyType="done"
            />
            <Champ
              libelle="Texte du SMS « véhicule prêt »"
              type="multiligne"
              value={texteSms}
              onChangeText={setTexteSms}
              onBlur={validerTexteSms}
              aide="{prenom} et {garage} sont remplacés par le prénom du client et le nom du garage."
            />
            <Carte className="mb-6 p-4">
              <Etiquette className="mb-2">Aperçu</Etiquette>
              <View className="self-start rounded-2xl rounded-tl-md bg-surface2 dark:bg-surface2-dark px-3.5 py-2.5">
                <Texte>{apercu}</Texte>
              </View>
              <Legende className="mt-2">
                {apercu.length} caractère{apercu.length > 1 ? 's' : ''}
                {apercu.length > 160 ? ' · au-delà de 160, le message compte pour plusieurs SMS' : ''}
              </Legende>
            </Carte>
          </>
        ) : null}

        <Groupe titre="Réceptionniste téléphonique" note="Active l’onglet Appels. Le service lui-même est branché par Rencar.">
          <LigneInterrupteur
            titre="Réceptionniste"
            aide="Répond aux appels et crée des fiches à valider."
            valeur={garage.options.receptionniste}
            onChange={(v) => options({ receptionniste: v })}
            derniere
          />
        </Groupe>

        <Legende className="ml-1">Les modifications sont enregistrées au fur et à mesure.</Legende>
      </KeyboardAwareScrollView>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
