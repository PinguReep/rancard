/**
 * Activation d'un compte invité. L'e-mail d'invitation contient un code à
 * 6 chiffres : adresse, code, puis mot de passe choisi, et la session
 * s'ouvre. Aucun lien à ouvrir depuis la messagerie.
 */

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';

import { LONGUEUR_MOT_DE_PASSE, erreurSaisieCode } from '@/components/auth/saisie';
import { Bouton, Champ, Ecran, Secondaire, Titre } from '@/components/ui';
import { useSession } from '@/state/session';

export default function ActiverCompte() {
  const router = useRouter();
  const activer = useSession((s) => s.activer);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const champCode = useRef<TextInput>(null);
  const champMdp = useRef<TextInput>(null);

  /** Le pavé numérique n'a pas de touche Entrée : le 6e chiffre passe au mot de passe. */
  function saisirCode(v: string) {
    setCode(v);
    if (v.replace(/\D/g, '').length === 6) champMdp.current?.focus();
  }

  async function valider() {
    setErreur(null);
    const probleme = erreurSaisieCode(email, code, mdp);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setChargement(true);
    try {
      await activer(email, code, mdp);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6">
        <Titre>Activer mon compte</Titre>
        <Secondaire className="mt-2 mb-8">Le code à 6 chiffres est dans l’e-mail d’invitation.</Secondaire>
        <Champ
          libelle="E-mail"
          type="email"
          value={email}
          onChangeText={setEmail}
          placeholder="vous@garage.example"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => champCode.current?.focus()}
        />
        <Champ
          ref={champCode}
          libelle="Code"
          type="nombre"
          value={code}
          onChangeText={saisirCode}
          placeholder="123456"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
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
          returnKeyType="go"
          onSubmitEditing={valider}
          erreur={erreur}
        />
        <Bouton onPress={valider} chargement={chargement}>
          Activer mon compte
        </Bouton>
        <Bouton variante="discret" onPress={() => router.back()} className="mt-4">
          Retour
        </Bouton>
      </KeyboardAvoidingView>
    </Ecran>
  );
}
