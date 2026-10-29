/**
 * « Créer un compte » : le gérant d'un garage qui découvre Rencar s'inscrit
 * seul. Vous (prénom, nom, e-mail, mot de passe), puis le garage (nom,
 * adresse, téléphone). Le compte est créé, un code à 6 chiffres part par
 * e-mail pour confirmer l'adresse ; le garage attend ensuite la validation
 * de l'équipe Rencar (écran d'attente). Aucune prestation ne se choisit ici.
 */

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LONGUEUR_MOT_DE_PASSE, erreurInscription } from '@/components/auth/saisie';
import { Bouton, Champ, Ecran, Erreur, Legende, Secondaire, Section, Titre } from '@/components/ui';
import { BACKEND, type NouvelleInscription } from '@/data';
import { formaterTelephone } from '@/lib/format';
import { useSession } from '@/state/session';

export default function Inscription() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inscrire = useSession((s) => s.inscrire);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [garage, setGarage] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const champNom = useRef<TextInput>(null);
  const champEmail = useRef<TextInput>(null);
  const champMdp = useRef<TextInput>(null);
  const champGarage = useRef<TextInput>(null);
  const champAdresse = useRef<TextInput>(null);
  const champTelephone = useRef<TextInput>(null);

  async function creer() {
    setErreur(null);
    const n: NouvelleInscription = {
      email: email.trim().toLowerCase(),
      motDePasse: mdp,
      prenom,
      nom,
      garage: { nom: garage, adresse, telephone: formaterTelephone(telephone) },
    };
    const probleme = erreurInscription(n);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setChargement(true);
    try {
      const { codeEnvoye } = await inscrire(n);
      router.push({ pathname: '/(auth)/confirmer', params: { email: n.email, ...(codeEnvoye ? {} : { envoye: 'non' }) } });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <Titre>Créer un compte</Titre>
        <Secondaire className="mb-8 mt-2">Rencar vérifie chaque demande avant d’ouvrir l’accès à votre garage.</Secondaire>

        <Section titre="Vous">
          <Champ
            libelle="Prénom"
            value={prenom}
            onChangeText={setPrenom}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champNom.current?.focus()}
          />
          <Champ
            ref={champNom}
            libelle="Nom"
            value={nom}
            onChangeText={setNom}
            autoComplete="family-name"
            textContentType="familyName"
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champEmail.current?.focus()}
          />
          <Champ
            ref={champEmail}
            libelle="E-mail"
            type="email"
            value={email}
            onChangeText={setEmail}
            placeholder="vous@garage.example"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champMdp.current?.focus()}
          />
          <Champ
            ref={champMdp}
            libelle="Mot de passe"
            type="motdepasse"
            value={mdp}
            onChangeText={setMdp}
            placeholder={`${LONGUEUR_MOT_DE_PASSE} caractères au moins`}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champGarage.current?.focus()}
            className="mb-0"
          />
        </Section>

        <Section titre="Votre garage">
          <Champ
            ref={champGarage}
            libelle="Nom du garage"
            value={garage}
            onChangeText={setGarage}
            autoCapitalize="words"
            autoComplete="organization"
            textContentType="organizationName"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champAdresse.current?.focus()}
          />
          <Champ
            ref={champAdresse}
            libelle="Adresse"
            value={adresse}
            onChangeText={setAdresse}
            placeholder="12 rue de la République, 99001 Villefictive"
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => champTelephone.current?.focus()}
          />
          <Champ
            ref={champTelephone}
            libelle="Téléphone du garage"
            type="telephone"
            value={telephone}
            onChangeText={setTelephone}
            onBlur={() => setTelephone((t) => formaterTelephone(t))}
            placeholder="01 99 00 00 11"
            returnKeyType="go"
            onSubmitEditing={creer}
            className="mb-0"
          />
        </Section>

        {erreur ? (
          <Erreur className="mb-3 ml-1" accessibilityLiveRegion="polite">
            {erreur}
          </Erreur>
        ) : null}
        <Bouton onPress={creer} chargement={chargement}>
          Créer mon compte
        </Bouton>
        <Legende className="mt-3 text-center">
          {BACKEND === 'demo'
            ? 'Démonstration : la demande reste sur ce téléphone, aucun e-mail ne part.'
            : 'Un code à 6 chiffres vous sera envoyé par e-mail pour confirmer l’adresse.'}
        </Legende>
        <View className="mt-4">
          <Bouton variante="discret" onPress={() => router.back()} desactive={chargement}>
            Retour
          </Bouton>
        </View>
      </KeyboardAwareScrollView>
    </Ecran>
  );
}
