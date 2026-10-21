/**
 * Profil (modale avec pile) : identité, accès au garage et à l'équipe pour
 * le gérant, notifications push, compte, déconnexion, à propos.
 */

import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoutonFermer } from '@/components/profil/BoutonFermer';
import { CarteIdentite } from '@/components/profil/CarteIdentite';
import { LigneNavigation } from '@/components/profil/LigneNavigation';
import { LignePush } from '@/components/profil/LignePush';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Ecran, FeuilleConfirmation, Groupe, impulsion } from '@/components/ui';
import { BACKEND, repo, type Repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import { useDonnees, useSession } from '@/state/session';

type Feuille = 'deconnexion' | 'reinitialisation' | null;

export default function Profil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const membre = useMembreCourant();
  // Membres actifs, invitations en attente exclues (pas encore de compte).
  const actifs = useDonnees((s) => s.membres.filter((m) => m.actif && !m.invitationEnAttente).length);
  const deconnecter = useSession((s) => s.deconnecter);
  const [feuille, setFeuille] = useState<Feuille>(null);
  const [chargement, setChargement] = useState(false);

  const gerant = estGerant(membre);
  const r = repo() as Repo & { reinitialiser?: () => Promise<void> };
  const peutReinitialiser = BACKEND === 'demo' && typeof r.reinitialiser === 'function';
  const version = Constants.expoConfig?.version ?? '';

  async function confirmerDeconnexion() {
    setChargement(true);
    try {
      await deconnecter();
    } finally {
      setChargement(false);
      setFeuille(null);
    }
  }

  async function confirmerReinitialisation() {
    if (typeof r.reinitialiser !== 'function') return;
    setChargement(true);
    try {
      await r.reinitialiser();
      impulsion('succes');
      // Un compte invité en démonstration disparaît avec la réinitialisation :
      // le store doit suivre le dépôt, sinon l'app continue avec un membre fantôme.
      if (!(await repo().sessionCourante())) await deconnecter();
    } finally {
      setChargement(false);
      setFeuille(null);
    }
  }

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Profil', headerRight: () => <BoutonFermer /> }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} contentInsetAdjustmentBehavior="automatic">
        <CarteIdentite membre={membre} className="mb-6" />

        <Groupe titre="Garage">
          {gerant ? (
            <LigneNavigation titre="Équipe" valeur={`${actifs} membre${actifs > 1 ? 's' : ''}`} onPress={() => router.push('/profil/equipe')} />
          ) : null}
          {gerant ? <LigneNavigation titre="Le garage" onPress={() => router.push('/profil/garage')} /> : null}
          <LignePush membreId={membre.id} derniere />
        </Groupe>

        <Groupe titre="Compte">
          <LigneNavigation titre="Mon compte" onPress={() => router.push('/profil/compte')} />
          <LigneNavigation titre="Confidentialité" onPress={() => router.push('/profil/confidentialite')} />
          <LigneNavigation titre="Se déconnecter" ton="danger" onPress={() => setFeuille('deconnexion')} derniere />
        </Groupe>

        <Groupe
          titre="À propos"
          note={BACKEND === 'demo' ? 'Mode démonstration : tout reste sur ce téléphone, rien n’est envoyé à un serveur.' : undefined}>
          <LigneNavigation titre="Version" valeur={version ? `Rencar ${version}` : 'Rencar'} />
          <LigneNavigation titre="Mode" valeur={BACKEND === 'demo' ? 'Démonstration' : 'Serveur Rencar'} derniere={!peutReinitialiser} />
          {peutReinitialiser ? <LigneNavigation titre="Réinitialiser la démonstration" onPress={() => setFeuille('reinitialisation')} derniere /> : null}
        </Groupe>
        <View className="h-2" />
      </ScrollView>

      <FeuilleConfirmation
        ouverte={feuille === 'deconnexion'}
        onFermer={() => setFeuille(null)}
        titre="Se déconnecter ?"
        texte="Vous pourrez vous reconnecter avec votre adresse e-mail."
        libelle="Se déconnecter"
        variante="danger"
        chargement={chargement}
        onConfirmer={confirmerDeconnexion}
      />
      <FeuilleConfirmation
        ouverte={feuille === 'reinitialisation'}
        onFermer={() => setFeuille(null)}
        titre="Réinitialiser la démonstration ?"
        texte="Interventions, clients, appels et réglages reviennent à leur état de départ."
        libelle="Réinitialiser"
        variante="danger"
        chargement={chargement}
        onConfirmer={confirmerReinitialisation}
      />
    </Ecran>
  );
}
