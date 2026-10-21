/**
 * Fiche intervention : identité, geste suivant, organisation, mémo, montant,
 * fil de suivi avec notes et photos, lien de suivi client, historique du
 * véhicule. Tout est réactif : chaque mutation passe par `repo()` et
 * l’écran se relit depuis le store. Un employé sans « Voir tout le
 * planning » n’ouvre que ses propres interventions.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { interventionsVisibles } from '@/components/clients/outils';
import { Avis } from '@/components/intervention/Avis';
import { BlocOrganisation } from '@/components/intervention/BlocOrganisation';
import { MemoInterne, MontantEstime } from '@/components/intervention/ChampsEditables';
import { Composer } from '@/components/intervention/Composer';
import { EnTeteFiche } from '@/components/intervention/EnTeteFiche';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleSmsPret } from '@/components/intervention/FeuilleSmsPret';
import { FilSuivi } from '@/components/intervention/FilSuivi';
import { HistoriqueVehicule } from '@/components/intervention/HistoriqueVehicule';
import { usePassageStatut } from '@/components/intervention/passage-statut';
import { ProchaineEtape } from '@/components/intervention/ProchaineEtape';
import { SuiviClient } from '@/components/intervention/SuiviClient';
import { Bouton, Ecran, FeuilleConfirmation, Groupe, Section, Texte, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import { actionsPossibles } from '@/domain/statuts';
import { ecrire } from '@/lib/ecrire';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

export default function FicheIntervention() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const membre = useMembre();
  const p = usePermissions();
  const margeBasse = useMargeBasse();
  const garage = useDonnees((s) => s.garage);

  const fiche = useDonnees((s) => {
    const i = s.interventions.find((x) => x.id === id);
    // Règle : un employé sans voirTout ne voit que ses interventions, même
    // par un lien, une notification ou l’historique du véhicule.
    if (!i || !(p.voirTout || i.membreId === membre.id)) return null;
    // Copies superficielles : le dépôt de démonstration modifie les objets en
    // place, une référence neuve garantit le rafraîchissement de l’écran.
    return {
      intervention: { ...i },
      client: s.clients.find((c) => c.id === i.clientId),
      vehicule: s.vehicules.find((v) => v.id === i.vehiculeId),
      mecanicien: i.membreId ? (s.membres.find((m) => m.id === i.membreId) ?? null) : null,
      membres: s.membres,
      equipe: s.membres.filter((m) => m.actif && !m.invitationEnAttente),
      commentaires: s.commentaires.filter((c) => c.interventionId === i.id).map((c) => ({ ...c })),
      evenements: s.evenements.filter((e) => e.interventionId === i.id).map((e) => ({ ...e })),
      historique: interventionsVisibles(s.interventions, membre, p)
        .filter((x) => x.vehiculeId === i.vehiculeId && x.id !== i.id)
        .map((x) => ({ ...x }))
        .sort((a, b) => b.debut.localeCompare(a.debut)),
    };
  });

  const { executer, passer, cibleSms, fermerSms, avis, montrerAvis } = usePassageStatut();
  const [attribution, setAttribution] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);

  const retour = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/planning'));

  if (!fiche) {
    return (
      <Ecran sansHaut>
        <Stack.Screen options={{ headerTitle: 'Intervention' }} />
        <Vide
          icone="alerte"
          titre="Intervention introuvable"
          texte="Elle a peut-être été supprimée, ou n’est pas visible avec vos accès."
          action={
            <Bouton variante="secondaire" onPress={retour}>
              Retour
            </Bouton>
          }
        />
      </Ecran>
    );
  }

  const { intervention: i, client, vehicule, mecanicien } = fiche;
  const nomClient = client ? `${client.prenom} ${client.nom}` : 'Client';
  const annuler = actionsPossibles(i).find((a) => a.type === 'statut' && a.vers === 'annule');

  return (
    <Ecran sansHaut>
      <Stack.Screen options={{ headerTitle: nomClient }} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: margeBasse }}>
        <EnTeteFiche intervention={i} client={client} vehicule={vehicule} sms={garage.options.sms} />

        <ProchaineEtape intervention={i} onAction={(a) => executer(i, a).catch((e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.'))} />

        <BlocOrganisation intervention={i} mecanicien={mecanicien} peutAttribuer={p.voirTout} onAttribuer={() => setAttribution(true)} onErreur={montrerAvis} />

        {i.demande ? (
          <Groupe titre="Demande du client">
            <View className="px-4 py-3">
              <Texte>{i.demande}</Texte>
            </View>
          </Groupe>
        ) : null}

        <MemoInterne key={`memo-${i.memo ?? ''}`} intervention={i} onErreur={montrerAvis} />

        {p.voirPrix ? <MontantEstime key={`montant-${i.montantEstime ?? ''}`} intervention={i} editable={estGerant(membre)} onErreur={montrerAvis} /> : null}

        <Section titre="Suivi">
          <FilSuivi commentaires={fiche.commentaires} evenements={fiche.evenements} membres={fiche.membres} />
          <View className="mt-3">
            <Composer interventionId={i.id} onErreur={montrerAvis} />
          </View>
        </Section>

        <View className="mb-6">
          <SuiviClient
            token={i.suiviToken}
            prenom={client?.prenom ?? ''}
            telephone={client?.telephone ?? ''}
            garage={garage.nom}
            sms={garage.options.sms && client !== undefined}
          />
        </View>

        <HistoriqueVehicule interventions={fiche.historique} onOuvrir={(autre) => router.push(`/intervention/${autre}`)} />

        {annuler ? (
          <Bouton variante="danger" onPress={() => setConfirmerAnnulation(true)} accessibilityLabel="Annuler l’intervention">
            Annuler l’intervention
          </Bouton>
        ) : null}
      </KeyboardAwareScrollView>

      <FeuilleSmsPret
        cible={cibleSms}
        onFermer={fermerSms}
        onFait={(avecSms) => montrerAvis(avecSms ? 'Véhicule prêt · SMS envoyé' : 'Véhicule prêt · sans SMS')}
        onErreur={montrerAvis}
      />
      <FeuilleAttribution
        ouverte={attribution}
        onFermer={() => setAttribution(false)}
        actuel={i.membreId}
        membres={fiche.equipe}
        onChoisir={(membreId) => {
          setAttribution(false);
          if (i.membreId !== membreId) {
            impulsion('succes');
            ecrire(repo().affecter(i.id, membreId, membre.id), montrerAvis, 'Impossible de changer le mécanicien.');
          }
        }}
      />
      <FeuilleConfirmation
        ouverte={confirmerAnnulation}
        titre="Annuler l’intervention ?"
        texte={`Le rendez-vous de ${nomClient} sera annulé. Le client lira « Rendez-vous annulé » sur sa page de suivi.`}
        libelle="Oui, annuler"
        variante="danger"
        onConfirmer={async () => {
          try {
            await passer(i, 'annule');
          } catch (e) {
            montrerAvis((e as Error).message || 'Impossible d’annuler l’intervention.');
          } finally {
            setConfirmerAnnulation(false);
          }
        }}
        onFermer={() => setConfirmerAnnulation(false)}
      />
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
