/**
 * Profil (modale avec pile) : identité, apparence (sombre, clair, auto),
 * activité, accès au garage et à l’équipe pour
 * le gérant, notifications push, compte, déconnexion, à propos.
 */

import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoutonFermer } from '@/components/profil/BoutonFermer';
import { CarteIdentite } from '@/components/profil/CarteIdentite';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { LigneNavigation } from '@/components/profil/LigneNavigation';
import { LignePush } from '@/components/profil/LignePush';
import { LigneSonnerie } from '@/components/profil/LigneSonnerie';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Ecran, FeuilleConfirmation, Groupe, Legende, impulsion } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { BACKEND, repo, type Repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import { NON_INCLUS } from '@/domain/prestations';
import { SONNERIE_INCLUSE } from '@/lib/sonnerie/inclusion';
import { useDonnees, usePermissions, useSession } from '@/state/session';
import { useApparence, type ChoixApparence } from '@/theme/apparence';

type Feuille = 'deconnexion' | 'reinitialisation' | null;

export default function Profil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const membre = useMembreCourant();
  const p = usePermissions();
  const apparence = useApparence((s) => s.choix);
  const choisirApparence = useApparence((s) => s.choisir);
  // Membres actifs, invitations en attente exclues (pas encore de compte).
  const actifs = useDonnees((s) => s.membres.filter((m) => m.actif && !m.invitationEnAttente).length);
  // Sonnerie dans l'app : avec la permission appels ; grisée sans la prestation réceptionniste.
  const receptionniste = useDonnees((s) => s.garage.options.receptionniste === true);
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
      if ((await repo().sessionCourante())?.type !== 'session') await deconnecter();
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

        <Segments<ChoixApparence>
          options={[
            { id: 'sombre', label: 'Sombre' },
            { id: 'clair', label: 'Clair' },
            { id: 'systeme', label: 'Auto' },
          ]}
          valeur={apparence}
          onChange={choisirApparence}
          className="mb-6"
        />

        <Groupe titre="Garage">
          {p.activite ? <LigneNavigation titre="Activité" onPress={() => router.push('/activite')} /> : null}
          {gerant ? (
            <LigneNavigation titre="Équipe" valeur={`${actifs} membre${actifs > 1 ? 's' : ''}`} onPress={() => router.push('/profil/equipe')} />
          ) : null}
          {gerant ? <LigneNavigation titre="Le garage" onPress={() => router.push('/profil/garage')} /> : null}
          {/* Renvoi d’appel vers l’agent : gérant ou permission appels ; sans la prestation, la ligne
              reste visible et ouvre l’état « Non inclus » (docs/09 § 1). */}
          {p.appels ? (
            <LigneNavigation
              titre="Réceptionniste"
              valeur={receptionniste ? 'Renvoi d’appel' : 'Non inclus'}
              onPress={() => router.push('/profil/receptionniste')}
              accessibilityLabel={receptionniste ? 'Réceptionniste, renvoi d’appel' : `Réceptionniste. ${NON_INCLUS}`}
            />
          ) : null}
          <LignePush membreId={membre.id} derniere />
        </Groupe>

        {/* Sonnerie dans l’app : « Rencar Test » seulement ; dans l’app de l’App Store (version 1),
            le groupe disparaît, sans mention d’une fonction à venir (règle 2.1). */}
        {p.appels && SONNERIE_INCLUSE ? (
          <Groupe titre="Appels">
            {receptionniste ? (
              <LigneSonnerie membreId={membre.id} />
            ) : (
              <LigneInterrupteur titre="Recevoir les appels" aide={NON_INCLUS} valeur={false} onChange={() => undefined} desactive derniere />
            )}
          </Groupe>
        ) : null}

        <Groupe titre="Compte">
          <LigneNavigation titre="Mon compte" onPress={() => router.push('/profil/compte')} />
          <LigneNavigation titre="Confidentialité" onPress={() => router.push('/profil/confidentialite')} />
          <LigneNavigation titre="Se déconnecter" ton="danger" onPress={() => setFeuille('deconnexion')} derniere />
        </Groupe>

        {peutReinitialiser ? (
          <Groupe>
            <LigneNavigation titre="Réinitialiser la démonstration" onPress={() => setFeuille('reinitialisation')} derniere />
          </Groupe>
        ) : null}
        <Legende className="mt-1 text-center">
          Rencar {version}
          {BACKEND === 'demo' ? ' · démonstration' : ''}
        </Legende>
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
