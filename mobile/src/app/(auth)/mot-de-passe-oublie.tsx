/**
 * Mot de passe oublié, en deux temps : l'adresse, puis le code à 6 chiffres
 * reçu par e-mail et le nouveau mot de passe. La session s'ouvre ensuite.
 */

import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';

import { LONGUEUR_MOT_DE_PASSE, erreurSaisieCode } from '@/components/auth/saisie';
import { Bouton, Champ, Ecran, Legende, Secondaire, Titre } from '@/components/ui';
import { repo } from '@/data';
import { useSession } from '@/state/session';

export default function MotDePasseOublie() {
  const router = useRouter();
  const reinitialiser = useSession((s) => s.reinitialiser);
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [renvoi, setRenvoi] = useState(false);
  const [codeRenvoye, setCodeRenvoye] = useState(false);
  const champMdp = useRef<TextInput>(null);

  /** Le pavé numérique n'a pas de touche Entrée : le 6e chiffre passe au mot de passe. */
  function saisirCode(v: string) {
    setCode(v);
    if (v.replace(/\D/g, '').length === 6) champMdp.current?.focus();
  }

  async function envoyer() {
    setErreur(null);
    if (!email.trim()) {
      setErreur('Renseignez votre adresse e-mail.');
      return;
    }
    setChargement(true);
    try {
      await repo().demanderReinitialisation(email.trim());
      setEnvoye(true);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  /** Nouveau code pour la même adresse, avec son propre chargement et une confirmation. */
  async function renvoyer() {
    if (renvoi || chargement) return;
    setErreur(null);
    setCodeRenvoye(false);
    setRenvoi(true);
    try {
      await repo().demanderReinitialisation(email.trim());
      setCodeRenvoye(true);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setRenvoi(false);
    }
  }

  async function changer() {
    setErreur(null);
    setCodeRenvoye(false);
    const probleme = erreurSaisieCode(email, code, mdp);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setChargement(true);
    try {
      await reinitialiser(email, code, mdp);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6">
        <Titre>Mot de passe oublié</Titre>
        <Secondaire className="mt-2 mb-8">
          {envoye ? 'Si un compte existe avec cette adresse, un code à 6 chiffres vient de partir.' : 'Vous recevrez un code à 6 chiffres par e-mail.'}
        </Secondaire>
        {!envoye ? (
          <>
            <Champ
              libelle="E-mail"
              type="email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@garage.example"
              returnKeyType="go"
              onSubmitEditing={envoyer}
              erreur={erreur}
            />
            <Bouton onPress={envoyer} chargement={chargement}>
              Recevoir un code
            </Bouton>
          </>
        ) : (
          <>
            <Champ
              libelle="Code"
              type="nombre"
              value={code}
              onChangeText={saisirCode}
              placeholder="123456"
              maxLength={6}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => champMdp.current?.focus()}
            />
            <Champ
              ref={champMdp}
              libelle="Nouveau mot de passe"
              type="motdepasse"
              value={mdp}
              onChangeText={setMdp}
              placeholder={`${LONGUEUR_MOT_DE_PASSE} caractères au moins`}
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={changer}
              erreur={erreur}
            />
            <Bouton onPress={changer} chargement={chargement} desactive={renvoi}>
              Changer le mot de passe
            </Bouton>
            <Bouton variante="discret" onPress={renvoyer} chargement={renvoi} desactive={chargement} className="mt-2">
              Renvoyer un code
            </Bouton>
            {codeRenvoye ? (
              <Legende ton="ok" accessibilityLiveRegion="polite" className="mt-1 text-center">
                Nouveau code envoyé.
              </Legende>
            ) : null}
          </>
        )}
        <Bouton variante="discret" onPress={() => router.back()} className="mt-2">
          Retour
        </Bouton>
      </KeyboardAvoidingView>
    </Ecran>
  );
}
