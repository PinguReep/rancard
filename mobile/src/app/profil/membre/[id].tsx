/**
 * Fiche d'un membre (gérant) : rôle, poste, permissions à la carte, accès.
 * Chaque changement est enregistré immédiatement, sauf la coupure de
 * l'accès, confirmée dans une feuille (la réactivation reste immédiate).
 * Le renvoi d'invitation n'existe qu'en démonstration : le dépôt n'a pas
 * encore de méthode pour renvoyer l'e-mail.
 *
 * Couper l'accès d'un membre qui a encore des voitures en cours propose de
 * les confier d'abord à un collègue : aucune voiture ne reste orpheline au
 * nom de quelqu'un qui ne peut plus se connecter.
 */

import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avis, useAvis } from '@/components/intervention/Avis';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { pluriel } from '@/components/planning/logique';
import { CarteIdentite } from '@/components/profil/CarteIdentite';
import { GroupePoste, GroupeRole } from '@/components/profil/ChoixRolePoste';
import { LigneInterrupteur } from '@/components/profil/LigneInterrupteur';
import { useMembreCourant } from '@/components/profil/useMembreCourant';
import { Bouton, Ecran, FeuilleConfirmation, Groupe, Legende, Vide, impulsion } from '@/components/ui';
import { BACKEND, repo } from '@/data';
import { PERMISSIONS_LABELS, POSTES, TOUTES_PERMISSIONS, estGerant, permissionsDe } from '@/domain/permissions';
import { STATUTS_ACTIFS } from '@/domain/statuts';
import type { Membre, Permissions, Poste, Role } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { dePrenom, plaquesInsecables } from '@/lib/format';
import { useDonnees } from '@/state/session';

const CLES = Object.keys(PERMISSIONS_LABELS) as (keyof Permissions)[];

export default function FicheMembre() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const moi = useMembreCourant();
  const membres = useDonnees((s) => s.membres);
  // Ses voitures non closes, avec de quoi les nommer dans la feuille de coupure.
  const voitures = useDonnees((s) =>
    s.interventions
      .filter((i) => i.membreId === id && STATUTS_ACTIFS.includes(i.statut))
      .map((i) => ({ id: i.id, vehicule: s.vehicules.find((v) => v.id === i.vehiculeId) })),
  );
  const [invitationRenvoyee, setInvitationRenvoyee] = useState(false);
  const [coupureAConfirmer, setCoupureAConfirmer] = useState(false);
  const [confier, setConfier] = useState(false);
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

  /** Démonstration seulement : aucun e-mail ne part, l'invitation reste en attente. */
  function renvoyerInvitation() {
    impulsion('succes');
    setInvitationRenvoyee(true);
  }

  /** Couper l'accès passe par la feuille ; le rendre est immédiat. */
  function changerAcces(actif: boolean) {
    if (actif) enregistrer({ actif: true });
    else setCoupureAConfirmer(true);
  }

  /**
   * Confie chaque voiture au collègue choisi, puis coupe l'accès. Si une
   * seule écriture échoue, l'accès reste ouvert : rien n'est perdu de vue.
   */
  async function confierPuisCouper(a: Membre) {
    let confiees = 0;
    for (const v of voitures) {
      try {
        await repo().affecter(v.id, a.id, moi.id);
        confiees += 1;
      } catch {
        // compté ci-dessous
      }
    }
    if (confiees < voitures.length) {
      const reste = voitures.length - confiees;
      impulsion('erreur');
      montrerAvis(
        confiees === 0
          ? 'Aucune voiture confiée, réessayez'
          : `${confiees} ${confiees > 1 ? 'voitures' : 'voiture'} sur ${voitures.length} ${confiees > 1 ? 'confiées' : 'confiée'}, réessayez pour ${reste > 1 ? 'les dernières' : 'la dernière'}`,
      );
      return;
    }
    try {
      await repo().modifierMembre(m!.id, { actif: false });
      impulsion('succes');
      montrerAvis(`${pluriel(confiees, 'voiture confiée', 'voitures confiées')} à ${a.prenom} · accès ${dePrenom(m!.prenom)} coupé`);
    } catch (e) {
      montrerAvis((e as Error).message || 'La fiche n’a pas pu être enregistrée.');
    }
  }

  // « Renault Mégane III (AA-006-AA), Peugeot 308 (AA-001-AA) … et 2 autres »
  const nommees = voitures
    .slice(0, 4)
    .map((v) => (v.vehicule ? `${v.vehicule.marque} ${v.vehicule.modele} (${v.vehicule.plaque})` : 'véhicule sans fiche'))
    .join(', ');
  const listeVoitures = voitures.length > 4 ? `${nommees} et ${voitures.length - 4} autres` : nommees;
  // Mêmes personnes que la feuille d’attribution : le réceptionnaire ne prend pas de voiture.
  const collegues = membres.filter((x) => x.actif && !x.invitationEnAttente && x.id !== m.id && x.poste !== 'receptionnaire');

  const effectives = permissionsDe(m);
  const renvoiPossible = BACKEND === 'demo';

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ title: `${m.prenom} ${m.nom}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} contentInsetAdjustmentBehavior="automatic">
        <CarteIdentite membre={m} className="mb-6" />

        {m.invitationEnAttente ? (
          <View className="mb-6">
            {renvoiPossible ? (
              <Bouton variante="secondaire" onPress={renvoyerInvitation} desactive={invitationRenvoyee} className="mb-2">
                {invitationRenvoyee ? 'Invitation renvoyée' : 'Renvoyer l’invitation'}
              </Bouton>
            ) : null}
            <Legende className="text-center">
              {invitationRenvoyee ? 'En démonstration, aucun e-mail ne part.' : 'Le membre n’a pas encore choisi son mot de passe.'}
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
          <LigneInterrupteur titre="Accès actif" valeur={m.actif} desactive={estMoi || dernierGerant} onChange={changerAcces} derniere />
        </Groupe>
      </ScrollView>
      <FeuilleConfirmation
        ouverte={coupureAConfirmer}
        onFermer={() => setCoupureAConfirmer(false)}
        titre={`Couper l’accès ${dePrenom(m.prenom)} ?`}
        texte={
          voitures.length
            ? `${m.prenom} a encore ${pluriel(voitures.length, 'voiture')} : ${plaquesInsecables(listeVoitures)}.`
            : `${m.prenom} ne pourra plus se connecter. Ses interventions restent visibles. Vous pourrez réactiver son accès à tout moment.`
        }
        libelle={voitures.length ? 'Couper sans les confier' : 'Couper l’accès'}
        variante="danger"
        onConfirmer={() => {
          setCoupureAConfirmer(false);
          enregistrer({ actif: false });
        }}>
        {voitures.length && collegues.length ? (
          <Bouton
            onPress={() => {
              setCoupureAConfirmer(false);
              setTimeout(() => setConfier(true), 260);
            }}
            className="mb-2"
            accessibilityLabel={`Confier les voitures ${dePrenom(m.prenom)} à un collègue`}>
            Confier ses voitures à…
          </Bouton>
        ) : null}
      </FeuilleConfirmation>
      <FeuilleAttribution
        ouverte={confier}
        onFermer={() => setConfier(false)}
        actuel={null}
        membres={collegues}
        titre="Confier ses voitures à"
        legende={`${pluriel(voitures.length, 'voiture')} ${dePrenom(m.prenom)}, puis accès coupé`}
        retirable={false}
        onChoisir={(choisi) => {
          setConfier(false);
          const a = collegues.find((x) => x.id === choisi);
          if (a) void confierPuisCouper(a);
        }}
      />
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
