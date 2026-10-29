/**
 * « Créer un compte » : le gérant d'un garage qui découvre Rencar s'inscrit
 * seul. Vous (prénom, nom, e-mail, mot de passe), puis le garage (nom,
 * adresse, téléphone). Le compte est créé, un code à 6 chiffres part par
 * e-mail pour confirmer l'adresse ; le garage attend ensuite la validation
 * de l'équipe Rencar (écran d'attente). Aucune prestation ne se choisit ici.
 *
 * Vérification anti-robot (Cloudflare Turnstile, hors démonstration) : le
 * jeton s'obtient pendant la saisie, sans rien montrer tant que Cloudflare
 * ne demande pas d'interaction. L'envoi attend le jeton (« Vérification en
 * cours… »). L'automate (`components/auth/envoi-inscription.ts`) décide du
 * reste : un seul envoi à la fois, refus du serveur gardé à l'écran jusqu'au
 * geste suivant, envoi sans jeton si le widget ne marche pas sur l'appareil
 * (le serveur reste juge). Jamais de blocage définitif : après plusieurs
 * échecs, l'écran invite à écrire à l'assistance.
 */

import { useRouter } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Platform, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { affichage, type EtatEnvoi, type Evenement, etatInitial, transition } from '@/components/auth/envoi-inscription';
import { LONGUEUR_MOT_DE_PASSE, erreurInscription } from '@/components/auth/saisie';
import { type PoigneeVerification, verificationHumaineActive } from '@/components/auth/verification';
import { VerificationHumaine } from '@/components/auth/VerificationHumaine';
import { Bouton, Champ, Ecran, Erreur, Legende, Secondaire, Section, Titre } from '@/components/ui';
import { BACKEND, type NouvelleInscription, VerificationHumaineRefusee } from '@/data';
import { formaterTelephone } from '@/lib/format';
import { EMAIL_ASSISTANCE } from '@/lib/liens';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/tokens';

/** Attente d'un jeton après l'appui, sans interaction demandée, avant de proposer « Réessayer ». */
const ATTENTE_JETON_MAX_MS = 20_000;

export default function Inscription() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const inscrire = useSession((s) => s.inscrire);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [garage, setGarage] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const champNom = useRef<TextInput>(null);
  const champEmail = useRef<TextInput>(null);
  const champMdp = useRef<TextInput>(null);
  const champGarage = useRef<TextInput>(null);
  const champAdresse = useRef<TextInput>(null);
  const champTelephone = useRef<TextInput>(null);

  // Vérification anti-robot : lue à l'ouverture de l'écran (une démonstration locale peut s'ouvrir dans un build supabase).
  const verifier = verificationHumaineActive();
  const verification = useRef<PoigneeVerification>(null);
  /** Cloudflare demande une interaction : la case est visible. */
  const [interaction, setInteraction] = useState(false);
  // État de l'envoi dans une ref : le verrou d'un envoi est posé avant le rendu suivant (double appui, envoi automatique).
  const envoi = useRef<EtatEnvoi>(etatInitial(verifier));
  const [, rendre] = useReducer((n: number) => n + 1, 0);
  // Les effets lisent toujours le formulaire du dernier rendu, même déclenchés par un minuteur ou par le widget.
  const envoyerDernier = useRef<(j: string | null) => Promise<void>>(async () => undefined);

  function formulaire(): NouvelleInscription {
    return {
      email: email.trim().toLowerCase(),
      motDePasse: mdp,
      prenom,
      nom,
      garage: { nom: garage, adresse, telephone: formaterTelephone(telephone) },
    };
  }

  function appliquer(ev: Evenement) {
    const avant = envoi.current;
    const { etat, effets } = transition(avant, ev);
    envoi.current = etat;
    rendre();
    // VoiceOver ne lit pas les régions vivantes (Android, par `Erreur`) : l'échec est annoncé.
    if (Platform.OS === 'ios' && etat.echec && etat.echec.message !== avant.echec?.message) {
      AccessibilityInfo.announceForAccessibility(etat.echec.message);
    }
    for (const f of effets) {
      if (f.type === 'relancer') verification.current?.relancer();
      else void envoyerDernier.current(f.jeton);
    }
  }

  async function envoyer(j: string | null) {
    const n = formulaire();
    const probleme = erreurInscription(n);
    if (probleme) {
      setErreur(probleme);
      appliquer({ type: 'invalide', jeton: j });
      return;
    }
    setErreur(null);
    try {
      const { codeEnvoye } = await inscrire(j ? { ...n, verification: j } : n);
      appliquer({ type: 'succes' });
      router.push({ pathname: '/(auth)/confirmer', params: { email: n.email, ...(codeEnvoye ? {} : { envoye: 'non' }) } });
    } catch (e) {
      if (envoi.current.active && e instanceof VerificationHumaineRefusee) {
        appliquer({ type: 'refus', raison: e.raison, message: e.message });
      } else {
        setErreur((e as Error).message);
        appliquer({ type: 'erreur' });
      }
    }
  }
  envoyerDernier.current = envoyer;

  function creer() {
    if (envoi.current.enCours) return;
    setErreur(null);
    const probleme = erreurInscription(formulaire());
    if (probleme) {
      setErreur(probleme);
      return;
    }
    appliquer({ type: 'demande' });
  }

  /** Après un refus du serveur, « Réessayer » renvoie ; après une panne du widget, il le relance. */
  function reessayer() {
    if (envoi.current.echec?.origine === 'serveur') creer();
    else appliquer({ type: 'reessayer' });
  }

  const etat = envoi.current;
  const { attente, assistance } = affichage(etat);

  // Aucun jeton ni case à cocher après l'appui : on propose « Réessayer » plutôt que d'attendre sans fin.
  useEffect(() => {
    if (!attente || interaction) return;
    const minuteur = setTimeout(() => {
      appliquer({ type: 'panne', raison: 'silence' });
    }, ATTENTE_JETON_MAX_MS);
    return () => {
      clearTimeout(minuteur);
    };
    // appliquer ne lit que des refs : seuls l'attente et la case visible relancent le minuteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente, interaction]);

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
            onBlur={() => setTelephone((v) => formaterTelephone(v))}
            placeholder="01 99 00 00 11"
            returnKeyType="go"
            onSubmitEditing={creer}
            className="mb-0"
          />
        </Section>

        {verifier ? (
          <>
            <VerificationHumaine
              ref={verification}
              onJeton={(jeton) => appliquer({ type: 'jeton', jeton })}
              onEchec={(raison) => appliquer({ type: 'panne', raison })}
              onInteraction={setInteraction}
            />
            {interaction && !etat.jeton && !etat.echec ? (
              <Legende className="-mt-1 mb-3 ml-1">Cochez la case pour confirmer que vous n’êtes pas un robot.</Legende>
            ) : null}
            {etat.echec ? <Erreur className="mb-2 ml-1">{etat.echec.message}</Erreur> : null}
            {assistance ? (
              <Legende className="mb-2 ml-1">Si la création du compte bloque encore, écrivez-nous à {EMAIL_ASSISTANCE}.</Legende>
            ) : null}
            {etat.echec || assistance ? (
              <View className="mb-3 flex-row flex-wrap gap-2">
                {etat.echec ? (
                  <Bouton variante="secondaire" compact onPress={reessayer} desactive={etat.enCours}>
                    Réessayer
                  </Bouton>
                ) : null}
                {assistance ? (
                  <Bouton
                    variante="discret"
                    compact
                    onPress={() => void Linking.openURL(`mailto:${EMAIL_ASSISTANCE}?subject=${encodeURIComponent('Création de compte Rencar')}`).catch(() => undefined)}>
                    Écrire à l’assistance
                  </Bouton>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {erreur ? <Erreur className="mb-3 ml-1">{erreur}</Erreur> : null}
        <Bouton
          onPress={creer}
          chargement={etat.enCours}
          desactive={attente}
          icone={attente ? <ActivityIndicator color={t.blanc} /> : undefined}>
          {attente ? 'Vérification en cours…' : 'Créer mon compte'}
        </Bouton>
        <Legende className="mt-3 text-center">
          {BACKEND === 'demo'
            ? 'Démonstration : la demande reste sur ce téléphone, aucun e-mail ne part.'
            : 'Un code à 6 chiffres vous sera envoyé par e-mail pour confirmer l’adresse.'}
        </Legende>
        <View className="mt-4">
          <Bouton variante="discret" onPress={() => router.back()} desactive={etat.enCours}>
            Retour
          </Bouton>
        </View>
      </KeyboardAwareScrollView>
    </Ecran>
  );
}
