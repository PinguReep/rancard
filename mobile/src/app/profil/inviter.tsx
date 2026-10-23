/**
 * Inviter un membre (gérant) : identité, rôle, poste, aperçu des
 * permissions, puis l'invitation. La confirmation remplace le formulaire.
 */

import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupePoste, GroupeRole } from '@/components/profil/ChoixRolePoste';
import { ResumePermissions } from '@/components/profil/ResumePermissions';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Champ, Ecran, Erreur, Legende, Section, Vide, impulsion } from '@/components/ui';
import { BACKEND, repo } from '@/data';
import { POSTES, TOUTES_PERMISSIONS, estGerant } from '@/domain/permissions';
import type { Membre, Poste, Role } from '@/domain/types';
import { useDonnees } from '@/state/session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Erreurs = { prenom?: string; nom?: string; email?: string };

export default function Inviter() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const membres = useDonnees((s) => s.membres);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employe');
  const [poste, setPoste] = useState<Poste>('mecanicien');
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoye, setEnvoye] = useState<Membre | null>(null);
  const champNom = useRef<TextInput>(null);
  const champEmail = useRef<TextInput>(null);

  if (!estGerant(moi)) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Inviter' }} />
        <Vide icone="cadenas" titre="Réservé au gérant" texte="Seul un gérant peut inviter un membre." />
      </Ecran>
    );
  }

  if (envoye) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Invitation' }} />
        <Vide
          icone="valider"
          titre="Invitation envoyée"
          texte={
            BACKEND === 'demo'
              ? `${envoye.prenom} apparaît dans l’équipe avec une invitation en attente. En démonstration, aucun e-mail ne part.`
              : `${envoye.prenom} reçoit un e-mail à ${envoye.email} pour choisir son mot de passe.`
          }
          action={<Bouton onPress={() => router.back()}>Retour à l’équipe</Bouton>}
        />
      </Ecran>
    );
  }

  async function envoyer() {
    const e: Erreurs = {};
    const p = prenom.trim();
    const n = nom.trim();
    const mail = email.trim().toLowerCase();
    if (!p) e.prenom = 'Indiquez le prénom.';
    if (!n) e.nom = 'Indiquez le nom.';
    if (!EMAIL.test(mail)) e.email = 'Adresse e-mail incomplète.';
    else if (membres.some((m) => m.email.toLowerCase() === mail)) e.email = 'Cette adresse est déjà dans l’équipe.';
    setErreurs(e);
    setErreur(null);
    if (Object.keys(e).length) {
      impulsion('erreur');
      return;
    }
    setChargement(true);
    try {
      const cree = await repo().inviterMembre({
        prenom: p,
        nom: n,
        email: mail,
        role,
        poste,
        permissions: role === 'gerant' ? TOUTES_PERMISSIONS : POSTES[poste].permissions,
      });
      impulsion('succes');
      setEnvoye(cree);
    } catch (err) {
      setErreur((err as Error).message);
      impulsion('erreur');
    } finally {
      setChargement(false);
    }
  }

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: 'Inviter un membre' }} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic">
        <Section titre="Identité">
          <Champ
            libelle="Prénom"
            value={prenom}
            onChangeText={setPrenom}
            erreur={erreurs.prenom}
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
            erreur={erreurs.nom}
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
            erreur={erreurs.email}
            placeholder="prenom@garage.example"
            returnKeyType="done"
            className="mb-0"
          />
        </Section>

        <GroupeRole valeur={role} onChange={setRole} />
        <GroupePoste valeur={poste} onChange={setPoste} note={role === 'gerant' ? 'Indicatif pour un gérant.' : undefined} />
        <ResumePermissions role={role} permissions={POSTES[poste].permissions} />

        {erreur ? <Erreur className="mb-3 ml-1">{erreur}</Erreur> : null}
        <Bouton onPress={envoyer} chargement={chargement}>
          Envoyer l’invitation
        </Bouton>
        <View className="mt-3 px-2">
          <Legende className="text-center">
            {BACKEND === 'demo'
              ? 'Le membre reçoit un e-mail pour choisir son mot de passe. En démonstration, aucun e-mail ne part.'
              : 'Le membre reçoit un e-mail pour choisir son mot de passe.'}
          </Legende>
        </View>
      </KeyboardAwareScrollView>
    </Ecran>
  );
}
