import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Bouton, Champ, Ecran, Secondaire, Titre } from '@/components/ui';
import { repo } from '@/data';

export default function MotDePasseOublie() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [chargement, setChargement] = useState(false);

  async function envoyer() {
    if (!email.trim()) return;
    setChargement(true);
    try {
      await repo().demanderReinitialisation(email.trim());
      setEnvoye(true);
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran>
      <View className="flex-1 justify-center px-6">
        <Titre>Mot de passe oublié</Titre>
        <Secondaire className="mt-2 mb-8">
          {envoye
            ? 'Si un compte existe avec cette adresse, un e-mail de réinitialisation vient de partir.'
            : 'Indiquez l’e-mail de votre compte, vous recevrez un lien pour choisir un nouveau mot de passe.'}
        </Secondaire>
        {!envoye ? (
          <>
            <Champ libelle="E-mail" type="email" value={email} onChangeText={setEmail} placeholder="vous@garage.example" onSubmitEditing={envoyer} />
            <Bouton onPress={envoyer} chargement={chargement}>
              Envoyer le lien
            </Bouton>
          </>
        ) : null}
        <Bouton variante="discret" onPress={() => router.back()} className="mt-4">
          Retour
        </Bouton>
      </View>
    </Ecran>
  );
}
