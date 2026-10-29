/**
 * Confirmation de l'adresse après « Créer un compte » (ou à la connexion
 * d'un compte dont le code n'a pas été saisi) : le code à 6 chiffres reçu
 * par e-mail confirme l'adresse, le mot de passe choisi est alors posé sur
 * le compte (créé avec un mot de passe aléatoire), et l'écran d'attente
 * s'ouvre. Le mot de passe saisi à l'inscription est gardé en mémoire ; si
 * l'app a été relancée entre-temps, l'écran le redemande. Adresse déjà
 * inscrite : c'est un code de réinitialisation qui arrive, accepté ici.
 * « Renvoyer le code » attend une minute entre deux envois, comme le serveur.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { erreurMotDePasse, LONGUEUR_MOT_DE_PASSE } from '@/components/auth/saisie';
import { Bouton, Champ, Ecran, Legende, Secondaire, Titre } from '@/components/ui';
import { BACKEND } from '@/data';
import { motDePasseInscriptionConnu, useSession } from '@/state/session';

/** Délai entre deux envois de code (max_frequency de supabase/config.toml). */
const DELAI_RENVOI_S = 60;

export default function ConfirmerAdresse() {
  const router = useRouter();
  // envoye=non : l'inscription n'a pas pu faire partir le code ; depuis=connexion :
  // aucun code ne vient de partir (compte créé plus tôt, adresse jamais confirmée).
  const params = useLocalSearchParams<{ email?: string; envoye?: string; depuis?: string }>();
  const sansCodeRecent = params.envoye === 'non' || params.depuis === 'connexion';
  const email = (params.email ?? '').trim().toLowerCase();
  const confirmer = useSession((s) => s.confirmerInscription);
  const renvoyerCode = useSession((s) => s.renvoyerCodeInscription);
  const [code, setCode] = useState('');
  // App relancée depuis l'inscription : le mot de passe choisi n'est plus en mémoire, on le redemande.
  const [demanderMdp] = useState(() => !motDePasseInscriptionConnu(email));
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [renvoi, setRenvoi] = useState(false);
  const [codeRenvoye, setCodeRenvoye] = useState(false);
  // Un code vient de partir à l'inscription : le suivant attend une minute.
  const [attente, setAttente] = useState(sansCodeRecent ? 0 : DELAI_RENVOI_S);

  useEffect(() => {
    if (attente <= 0) return;
    const minuteur = setTimeout(() => setAttente((s) => s - 1), 1000);
    return () => {
      clearTimeout(minuteur);
    };
  }, [attente]);

  async function valider() {
    setErreur(null);
    setCodeRenvoye(false);
    if (code.replace(/\D/g, '').length !== 6) {
      setErreur('Le code reçu par e-mail fait 6 chiffres.');
      return;
    }
    const probleme = demanderMdp ? erreurMotDePasse(mdp) : null;
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setChargement(true);
    try {
      await confirmer(email, code, demanderMdp ? mdp : undefined);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  async function renvoyer() {
    if (renvoi || chargement || attente > 0) return;
    setErreur(null);
    setCodeRenvoye(false);
    setRenvoi(true);
    try {
      await renvoyerCode(email);
      setCodeRenvoye(true);
      setAttente(DELAI_RENVOI_S);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setRenvoi(false);
    }
  }

  const explication =
    params.envoye === 'non'
      ? `Votre compte est créé, mais le code n’a pas pu partir à ${email}. Touchez « Renvoyer le code ».`
      : params.depuis === 'connexion'
        ? `L’adresse ${email} n’est pas encore confirmée. Saisissez le code reçu à l’inscription, ou demandez-en un nouveau.`
        : `Saisissez le code à 6 chiffres envoyé à ${email}.`;

  return (
    <Ecran>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6">
        <Titre>Confirmez votre adresse</Titre>
        <Secondaire className="mb-8 mt-2">{explication}</Secondaire>
        <Champ
          libelle="Code"
          type="nombre"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          placeholder="123456"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          returnKeyType={demanderMdp ? 'next' : 'go'}
          onSubmitEditing={demanderMdp ? undefined : valider}
          erreur={demanderMdp ? null : erreur}
        />
        {demanderMdp ? (
          <Champ
            libelle="Mot de passe"
            type="motdepasse"
            value={mdp}
            onChangeText={setMdp}
            placeholder={`${LONGUEUR_MOT_DE_PASSE} caractères au moins`}
            aide="Celui que vous utiliserez pour vous connecter."
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={valider}
            erreur={erreur}
          />
        ) : null}
        <Bouton onPress={valider} chargement={chargement} desactive={renvoi}>
          Confirmer
        </Bouton>
        <Bouton
          variante="discret"
          onPress={renvoyer}
          chargement={renvoi}
          desactive={chargement || attente > 0}
          className="mt-2"
          accessibilityLabel={attente > 0 ? `Renvoyer le code, possible dans ${attente} secondes` : 'Renvoyer le code'}>
          {attente > 0 ? `Renvoyer le code dans ${attente} s` : 'Renvoyer le code'}
        </Bouton>
        {codeRenvoye ? (
          <Legende ton="ok" accessibilityLiveRegion="polite" className="mt-1 text-center">
            Nouveau code envoyé.
          </Legende>
        ) : null}
        {BACKEND === 'demo' ? (
          <Legende className="mt-3 text-center">Démonstration : n’importe quel code à 6 chiffres convient.</Legende>
        ) : (
          <Legende className="mt-3 text-center">
            Rien reçu ? Regardez dans les courriers indésirables. Si un compte existe déjà avec cette adresse, vous recevez à la place un code pour choisir un nouveau mot de passe : saisissez-le ici.
          </Legende>
        )}
        <Bouton variante="discret" onPress={() => router.back()} className="mt-2">
          Retour
        </Bouton>
      </KeyboardAvoidingView>
    </Ecran>
  );
}
