/**
 * Fiche intervention : la voiture, le travail, où il en est, le client.
 * En bas, sous le pouce, une seule grande action (le geste suivant), plus
 * Photo et Bloquer. Le reste (priorité, mécanicien, lien de suivi,
 * annulation) est rangé dans le menu « ⋯ ». Un employé sans « Voir tout le
 * planning » n’ouvre que ses propres interventions.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { interventionsVisibles } from '@/components/clients/outils';
import { Avis } from '@/components/intervention/Avis';
import { BarreActions, HAUTEUR_BARRE } from '@/components/intervention/BarreActions';
import { MemoInterne, MontantEstime } from '@/components/intervention/ChampsEditables';
import { Composer, type ComposerRef } from '@/components/intervention/Composer';
import { EnTeteFiche } from '@/components/intervention/EnTeteFiche';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleMenu } from '@/components/intervention/FeuilleMenu';
import { FeuilleSmsPret } from '@/components/intervention/FeuilleSmsPret';
import { FilSuivi } from '@/components/intervention/FilSuivi';
import { HistoriqueVehicule } from '@/components/intervention/HistoriqueVehicule';
import { usePassageStatut } from '@/components/intervention/passage-statut';
import { Bouton, BoutonRond, Ecran, Etiquette, FeuilleConfirmation, Vide, impulsion } from '@/components/ui';
import { repo } from '@/data';
import { estGerant } from '@/domain/permissions';
import { ecrire } from '@/lib/ecrire';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

export default function FicheIntervention() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const membre = useMembre();
  const p = usePermissions();
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
  const [menu, setMenu] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const composer = useRef<ComposerRef>(null);
  const defilement = useRef<KeyboardAwareScrollViewRef>(null);
  const [yNotes, setYNotes] = useState(0);

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
  const nomClient = client ? `${client.prenom} ${client.nom}` : 'ce client';
  const signaler = (e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.');

  return (
    <Ecran sansHaut>
      <Stack.Screen
        options={{
          headerTitle: '',
          headerRight: () => <BoutonRond nom="menu" label="Plus d’actions" onPress={() => setMenu(true)} />,
        }}
      />
      <KeyboardAwareScrollView
        ref={defilement}
        bottomOffset={HAUTEUR_BARRE + 24}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: HAUTEUR_BARRE + insets.bottom + 32 }}>
        <EnTeteFiche
          intervention={i}
          client={client}
          vehicule={vehicule}
          mecanicien={mecanicien}
          sms={garage.options.sms}
          onAttribuer={p.voirTout ? () => setAttribution(true) : undefined}
        />

        <View onLayout={(e) => setYNotes(e.nativeEvent.layout.y)} className="mt-8">
          <Etiquette accessibilityRole="header" className="mb-2 ml-1">
            Notes et photos
          </Etiquette>
          <View className="gap-2">
            <FilSuivi commentaires={fiche.commentaires} evenements={fiche.evenements} membres={fiche.membres} />
            <Composer ref={composer} interventionId={i.id} onErreur={montrerAvis} />
          </View>
        </View>

        <View className="mt-8 gap-4">
          <MemoInterne key={`memo-${i.memo ?? ''}`} intervention={i} onErreur={montrerAvis} />
          {p.voirPrix ? <MontantEstime key={`montant-${i.montantEstime ?? ''}`} intervention={i} editable={estGerant(membre)} onErreur={montrerAvis} /> : null}
          <HistoriqueVehicule interventions={fiche.historique} onOuvrir={(autre) => router.push(`/intervention/${autre}`)} />
        </View>
      </KeyboardAwareScrollView>

      <BarreActions
        intervention={i}
        onAction={(a) => executer(i, a).catch(signaler)}
        onPhoto={() => {
          defilement.current?.scrollTo({ y: Math.max(0, yNotes - 80), animated: true });
          composer.current?.photographier();
        }}
      />

      <FeuilleMenu
        ouverte={menu}
        onFermer={() => setMenu(false)}
        intervention={i}
        client={client}
        garage={garage.nom}
        sms={garage.options.sms}
        peutAttribuer={p.voirTout}
        onPrioritaire={(v) => ecrire(repo().modifierIntervention(i.id, { prioritaire: v }), montrerAvis, 'Impossible de changer la priorité.')}
        onAttribuer={() => setAttribution(true)}
        onAction={(a) => executer(i, a).catch(signaler)}
        onAnnuler={() => setConfirmerAnnulation(true)}
        onAvis={montrerAvis}
      />
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
        titre="Annuler l’intervention ?"
        texte={`Le rendez-vous de ${nomClient} sera annulé. Le client lira « Rendez-vous annulé » sur sa page de suivi.`}
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
