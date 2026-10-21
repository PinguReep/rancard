/**
 * Fiche d'un membre (gérant) : rôle, poste, permissions à la carte, accès.
 * Chaque changement est enregistré immédiatement.
 */

import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { CarteIdentite } from '@/components/profil/CarteIdentite';
import { GroupePoste, GroupeRole } from '@/components/profil/ChoixRolePoste';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Ecran, Groupe, Legende, Vide, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { PERMISSIONS_LABELS, POSTES, TOUTES_PERMISSIONS, estGerant, permissionsDe } from '@/domain/permissions';
import type { Membre, Permissions, Poste, Role } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { useDonnees } from '@/state/session';

const CLES = Object.keys(PERMISSIONS_LABELS) as (keyof Permissions)[];

export default function FicheMembre() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const membres = useDonnees((s) => s.membres);
  const [invitationRenvoyee, setInvitationRenvoyee] = useState(false);
  const [avis, montrerAvis] = useAvis();

  const m = membres.find((x) => x.id === id);

  if (!estGerant(moi)) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Membre' }} />
        <Vide icone="cadenas" titre="Réservé au gérant" texte="Seul un gérant peut modifier une fiche membre." />
      </Ecran>
    );
  }
  if (!m) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ title: 'Membre' }} />
        <Vide icone="clients" titre="Membre introuvable" texte="Cette fiche n’existe plus." />
      </Ecran>
    );
  }

  const gerantsActifs = membres.filter((x) => x.role === 'gerant' && x.actif).length;
  const estMoi = m.id === moi.id;
  const dernierGerant = m.role === 'gerant' && m.actif && gerantsActifs <= 1;
  const gerant = m.role === 'gerant';

  function enregistrer(patch: Partial<Pick<Membre, 'role' | 'poste' | 'permissions' | 'actif'>>) {
    impulsion();
    ecrire(repo().modifierMembre(m!.id, patch), montrerAvis, 'La fiche n’a pas pu être enregistrée.');
  }

  function changerRole(role: Role) {
    if (role === m!.role) return;
    enregistrer(role === 'gerant' ? { role, permissions: TOUTES_PERMISSIONS } : { role, permissions: POSTES[m!.poste].permissions });
  }

  function changerPoste(poste: Poste) {
    if (poste === m!.poste) return;
    enregistrer({ poste, permissions: POSTES[poste].permissions });
  }

  function changerPermission(cle: keyof Permissions, valeur: boolean) {
    enregistrer({ permissions: { ...m!.permissions, [cle]: valeur } });
  }

  function renvoyerInvitation() {
    impulsion('succes');
    setInvitationRenvoyee(true);
  }

  const effectives = permissionsDe(m);

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: `${m.prenom} ${m.nom}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} contentInsetAdjustmentBehavior="automatic">
        <CarteIdentite membre={m} className="mb-6" />

        {m.invitationEnAttente ? (
          <View className="mb-6">
            <Bouton variante="secondaire" onPress={renvoyerInvitation} desactive={invitationRenvoyee}>
              {invitationRenvoyee ? 'Invitation renvoyée' : 'Renvoyer l’invitation'}
            </Bouton>
            <Legende className="mt-2 text-center">
              {invitationRenvoyee ? `Un nouvel e-mail part vers ${m.email}.` : 'Le membre n’a pas encore choisi son mot de passe.'}
            </Legende>
          </View>
        ) : null}

        <GroupeRole
          valeur={m.role}
          onChange={changerRole}
          verrouilles={dernierGerant ? ['employe'] : []}
          note={
            dernierGerant
              ? estMoi
                ? 'Vous êtes le seul gérant actif : nommez un autre gérant avant de changer votre rôle.'
                : 'Seul gérant actif du garage : nommez un autre gérant avant de le rétrograder.'
              : undefined
          }
        />

        <GroupePoste valeur={m.poste} onChange={changerPoste} note={gerant ? 'Indicatif pour un gérant.' : 'Choisir un poste remplit les permissions ci-dessous.'} />

        <Groupe titre="Permissions" note={gerant ? 'Un gérant a tous les droits.' : undefined}>
          {CLES.map((cle, i) => (
            <LigneInterrupteur
              key={cle}
              titre={PERMISSIONS_LABELS[cle].label}
              aide={PERMISSIONS_LABELS[cle].aide}
              valeur={effectives[cle]}
              desactive={gerant}
              onChange={(v) => changerPermission(cle, v)}
              derniere={i === CLES.length - 1}
            />
          ))}
        </Groupe>

        <Groupe
          titre="Accès"
          note={
            estMoi
              ? 'Vous ne pouvez pas désactiver votre propre accès.'
              : dernierGerant
                ? 'Le garage doit garder un gérant actif.'
                : 'Un membre désactivé ne peut plus se connecter. Ses interventions restent visibles.'
          }>
          <LigneInterrupteur titre="Accès actif" valeur={m.actif} desactive={estMoi || dernierGerant} onChange={(v) => enregistrer({ actif: v })} derniere />
        </Groupe>
      </ScrollView>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
