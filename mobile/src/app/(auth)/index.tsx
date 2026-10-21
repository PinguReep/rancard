/**
 * Connexion. E-mail et mot de passe du garage, ou accès direct au garage
 * de démonstration. Le lien « mot de passe oublié » ouvre l'écran dédié.
 * Si la reprise de session a échoué au démarrage, la raison est affichée.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { Bouton, Champ, Ecran, Erreur, Legende, Secondaire, Titre } from '@/components/ui';
import { BACKEND } from '@/data';
import { useSession } from '@/state/session';

export default function Connexion() {
  const router = useRouter();
  const connecter = useSession((s) => s.connecter);
  const connecterDemo = useSession((s) => s.connecterDemo);
  const erreurSession = useSession((s) => s.erreur);
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function valider() {
    setErreur(null);
    if (!email.trim() || !mdp) {
      setErreur('Renseignez votre e-mail et votre mot de passe.');
      return;
    }
    setChargement(true);
    try {
      await connecter(email, mdp);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6">
        <View className="mb-10">
          <View className="mb-6 h-14 w-14 items-center justify-center rounded-2xl bg-accent dark:bg-accent-fond">
            <Text className="text-white text-[26px] font-bold">A</Text>
          </View>
          <Titre>Rencar</Titre>
          <Secondaire className="mt-2">L’atelier dans la poche : planning, clients, appels.</Secondaire>
        </View>

        <Champ libelle="E-mail" type="email" value={email} onChangeText={setEmail} placeholder="vous@garage.example" returnKeyType="next" />
        <Champ
          libelle="Mot de passe"
          type="motdepasse"
          value={mdp}
          onChangeText={setMdp}
          placeholder="••••••••"
          returnKeyType="go"
          onSubmitEditing={valider}
          erreur={erreur}
        />
        <Bouton onPress={valider} chargement={chargement}>
          Se connecter
        </Bouton>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/mot-de-passe-oublie')}
          className="mt-2 min-h-[44px] justify-center self-center px-3 active:opacity-70">
          <Secondaire ton="accent">Mot de passe oublié</Secondaire>
        </Pressable>
        {erreurSession ? <Erreur className="mt-3 text-center">Impossible de reprendre la session : {erreurSession}</Erreur> : null}

        <View className="mt-12 items-center">
          <Legende className="mb-3">Pas encore de compte ?</Legende>
          <Bouton variante="secondaire" onPress={connecterDemo}>
            Essayer avec le garage de démonstration
          </Bouton>
          {BACKEND === 'demo' ? (
            <Legende className="mt-3 text-center">
              Mode démonstration : tout reste sur ce téléphone. E-mails de test : simon@garage.example, elias@garage.example.
            </Legende>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Ecran>
  );
}
