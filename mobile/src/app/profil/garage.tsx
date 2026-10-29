/**
 * Le garage (gérant) : identité, horaires, site internet, SMS,
 * réceptionniste. Chaque champ s'enregistre au blur, chaque interrupteur
 * tout de suite.
 *
 * Les prestations (site internet, relances SMS, réceptionniste IA) sont
 * réglées par l'équipe Rencar (la base refuse leur modification par le
 * gérant, trigger garages_garde) : elles sont affichées en lecture seule,
 * démonstration comprise, incluses ou grisées avec la phrase neutre de
 * `domain/prestations.ts`. Sur un vrai garage, l'expéditeur des SMS l'est
 * aussi. L'envoi automatique (avec les relances SMS) et le texte du SMS
 * « véhicule prêt » (qui sert aussi à l'app SMS du téléphone) restent au
 * gérant.
 */

import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { LigneHoraire, ORDRE_JOURS, type Plage } from '@/components/profil/LigneHoraire';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { LignePrestation } from '@/components/profil/LignePrestation';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Carte, Champ, Ecran, Etiquette, Groupe, Legende, Section, Texte, Vide, impulsion } from '@/components/ui';
import { BACKEND, repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import { aPrestation, LIBELLES_PRESTATION, NON_INCLUS } from '@/domain/prestations';
import type { Garage } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { formaterTelephone, gabaritSms, lettresRemplacees, mesureSms, normaliserSms } from '@/lib/format';
import { lienSuivi } from '@/lib/suivi';
import { useDonnees } from '@/state/session';

const EXPEDITEUR = /^[A-Z0-9]{3,11}$/;
const PAR_RENCAR = 'Réglé par l’équipe Rencar selon l’offre du garage.';

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

  // Aperçu du texte tel qu’il part. Avec les relances SMS, Rencar l’envoie
  // comme le serveur le prépare (ponctuation ramenée au GSM-7, lettres hors
  // GSM-7 sans accent) et l’aperçu dit ce qu’il coûte : un caractère qui
  // reste hors GSM-7 (émoji…) limite chaque SMS à 70 caractères au lieu de
  // 160 ; les lettres remplacées (ê → e…) sont signalées, pour que le
  // gérant reformule s’il tient à l’orthographe. Sans elles, le texte part
  // tel quel de l’app SMS du téléphone, suivi du lien de suivi
  // (FeuilleSmsPret) : ni décompte, ni accent retiré.
  const sms = aPrestation(garage, 'sms');
  const rempli = gabaritSms(texteSms, { prenom: 'Élodie', garage: garage.nom });
  const apercu = sms ? normaliserSms(rempli) : `${rempli}\n${lienSuivi('exemple')}`;
  const mesure = mesureSms(apercu);
  const remplacees = lettresRemplacees(rempli).map(([de, vers]) => `${de} → ${vers}`).join(', ');
  const speciaux = mesure.horsGsm.map((c) => `« ${c} »`).join(', ');
  // Lu au rendu : ne change qu'entre deux sessions (voir data/index.ts).
  const parRencar = BACKEND === 'supabase';
  // Sans relances SMS, l’expéditeur ne sert à rien : affiché grisé, non modifiable.
  const expediteurModifiable = sms && !parRencar;

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Le garage' }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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

        <Groupe titre="Site internet">
          <LignePrestation titre="Rendez-vous pris sur le site" incluse={aPrestation(garage, 'site')} derniere />
        </Groupe>

        <Groupe titre="SMS" note={sms ? undefined : 'Sans relances SMS, l’équipe prévient le client depuis l’app SMS du téléphone, lien de suivi compris.'}>
          <LignePrestation titre={LIBELLES_PRESTATION.sms} incluse={sms} />
          <LigneInterrupteur
            titre="Envoi automatique"
            aide={sms ? 'Le SMS « véhicule prêt » part dès le changement de statut, sans confirmation.' : NON_INCLUS}
            valeur={sms && garage.options.smsAutomatique}
            onChange={(v) => options({ smsAutomatique: v })}
            desactive={!sms}
            derniere
          />
        </Groupe>

        <View className={sms ? '' : 'opacity-50'}>
          <Champ
            libelle="Expéditeur"
            type="plaque"
            value={expediteur}
            onChangeText={(v) => {
              setExpediteur(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11));
              setErreurExpediteur(null);
            }}
            onBlur={expediteurModifiable ? validerExpediteur : undefined}
            editable={expediteurModifiable}
            erreur={erreurExpediteur}
            aide={
              !sms
                ? NON_INCLUS
                : parRencar
                  ? `Nom affiché sur le téléphone du client. ${PAR_RENCAR}`
                  : 'Nom affiché sur le téléphone du client. 11 caractères maximum, lettres et chiffres, sans espace (ex. GARAGEFICTI).'
            }
            maxLength={11}
            returnKeyType="done"
          />
        </View>

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
          {sms ? (
            <>
              <Legende className="mt-2">
                {apercu.length} caractère{apercu.length > 1 ? 's' : ''}
                {mesure.segments > 1 ? ` · compte pour ${mesure.segments} SMS` : ' · 1 SMS'}
                {mesure.horsGsm.length
                  ? ` · ${speciaux} ${mesure.horsGsm.length > 1 ? 'limitent' : 'limite'} chaque SMS à 70 caractères`
                  : ''}
              </Legende>
              {remplacees ? (
                <Legende className="mt-1">{`Envoyé sans accent : ${remplacees}. Reformulez pour garder l’orthographe.`}</Legende>
              ) : null}
            </>
          ) : (
            <Legende className="mt-2">Message proposé dans l’app SMS du téléphone, avec le lien de suivi du client.</Legende>
          )}
        </Carte>

        <Groupe titre="Réceptionniste téléphonique" note={aPrestation(garage, 'receptionniste') ? 'Les appels traités s’affichent dans l’onglet Appels.' : undefined}>
          <LignePrestation titre={LIBELLES_PRESTATION.receptionniste} incluse={aPrestation(garage, 'receptionniste')} derniere />
        </Groupe>

        <Legende className="ml-1">Les modifications sont enregistrées au fur et à mesure.</Legende>
      </KeyboardAwareScrollView>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
