/**
 * Fiche intervention : la voiture, le travail, où il en est, le client.
 * Sous l’en-tête, un bandeau dit le pourquoi et le quand (pièce et date,
 * accord demandé et devis, client prévenu, dernier accord) quand il y a
 * quelque chose à dire. En bas, sous le pouce, une seule grande action (le
 * geste suivant, propre au rôle), plus Photo et Bloquer (ou Préciser). Le
 * reste (priorité, mécanicien, rendez-vous, retour prévu, lien de suivi,
 * retours, annulation) est rangé dans le menu « ⋯ ».
 *
 * Un employé sans « Voir tout le planning » n’ouvre que ses propres
 * interventions. Les notifications qui visent la fiche passent en lues à
 * son ouverture. Tous les gestes de statut et de blocage passent par
 * `usePassageStatut` (garde du double appui, avis à « Annuler », feuilles).
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { interventionsVisibles, mobileJoignable } from '@/components/clients/outils';
import { ConsultationFiche } from '@/components/consultation';
import { Avis } from '@/components/intervention/Avis';
import { BandeauRepere } from '@/components/intervention/BandeauRepere';
import { BarreActions, HAUTEUR_BARRE } from '@/components/intervention/BarreActions';
import { MemoInterne, MontantEstime } from '@/components/intervention/ChampsEditables';
import { Composer, type ComposerRef } from '@/components/intervention/Composer';
import { EnTeteFiche } from '@/components/intervention/EnTeteFiche';
import { FeuilleAnnulation } from '@/components/intervention/FeuilleAnnulation';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleDeplacer, peutDeplacer } from '@/components/intervention/FeuilleDeplacer';
import { FeuilleKilometrage } from '@/components/intervention/FeuilleKilometrage';
import { FeuilleMenu } from '@/components/intervention/FeuilleMenu';
import { FeuilleRetourPrevu } from '@/components/intervention/FeuilleRetourPrevu';
import { FilSuivi } from '@/components/intervention/FilSuivi';
import { HistoriqueVehicule } from '@/components/intervention/HistoriqueVehicule';
import { FeuillesPassage, usePassageStatut } from '@/components/intervention/passage-statut';
import { useLireALOuverture } from '@/components/notifications/lecture';
import { Bouton, BoutonRond, Ecran, Etiquette, Vide, impulsion } from '@/components/ui';
import { BarreClavier, HAUTEUR_BARRE_CLAVIER } from '@/components/ui/barre-clavier';
import { repo } from '@/data';
import { ecrire } from '@/lib/ecrire';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

/** Barre de navigation iOS (en-tête natif transparent de la fiche) : l’avis posé en haut passe dessous. */
const HAUTEUR_EN_TETE_IOS = 44;

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

  // Ouvrir la fiche vaut lecture de ses notifications (attribution, blocage, accord…).
  useLireALOuverture(fiche ? fiche.intervention.id : null);

  const passage = usePassageStatut();
  const { executer, passer, avis, montrerAvis } = passage;
  const [attribution, setAttribution] = useState(false);
  const [deplacement, setDeplacement] = useState(false);
  const [retourPrevu, setRetourPrevu] = useState(false);
  const [kilometrage, setKilometrage] = useState(false);
  const [menu, setMenu] = useState(false);
  const [annulation, setAnnulation] = useState(false);
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

  const { intervention: i, client, vehicule, mecanicien, evenements } = fiche;
  const signaler = (e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.');
  // Liens `sms:` (app Messages, sans frais) dès que le client a un mobile ; la prestation « Relances SMS » régit seulement les envois de Rencar.
  const mobile = Boolean(client?.telephone && mobileJoignable(client.telephone));
  const deplacable = peutDeplacer(i, p);

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
        bottomOffset={Math.max(HAUTEUR_BARRE, HAUTEUR_BARRE_CLAVIER) + 24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: HAUTEUR_BARRE + insets.bottom + 32 }}>
        <ConsultationFiche fiche={`intervention:${i.id}`} className="mt-2" />
        <EnTeteFiche
          intervention={i}
          client={client}
          vehicule={vehicule}
          mecanicien={mecanicien}
          sms={mobile}
          onAttribuer={p.voirTout ? () => setAttribution(true) : undefined}
          onDeplacer={deplacable ? () => setDeplacement(true) : undefined}
          onRetourPrevu={p.creer ? () => setRetourPrevu(true) : undefined}
          onKilometrage={() => setKilometrage(true)}
        />
        <BandeauRepere
          intervention={i}
          evenements={evenements}
          membres={fiche.membres}
          onPreciser={() => passage.ouvrirBlocage(i, { etape: 'modifier' })}
          onPrevenu={(canal) => passage.marquerPrevenu(i, canal)}
          onDevisEnvoye={() => passage.marquerDevisEnvoye(i)}
          onErreur={montrerAvis}
        />

        <View onLayout={(e) => setYNotes(e.nativeEvent.layout.y)} className="mt-8">
          <Etiquette accessibilityRole="header" className="mb-2 ml-1">
            Notes et photos
          </Etiquette>
          <View className="gap-2">
            <FilSuivi commentaires={fiche.commentaires} evenements={evenements} membres={fiche.membres} client={client} onAvis={montrerAvis} />
            <Composer ref={composer} interventionId={i.id} onErreur={montrerAvis} client={client} onAvis={montrerAvis} />
          </View>
        </View>

        <View className="mt-8 gap-4">
          <MemoInterne intervention={i} onErreur={montrerAvis} />
          {p.voirPrix ? <MontantEstime intervention={i} editable onErreur={montrerAvis} /> : null}
          <HistoriqueVehicule interventions={fiche.historique} onOuvrir={(autre) => router.push(`/intervention/${autre}`)} />
        </View>
      </KeyboardAwareScrollView>

      <BarreActions
        intervention={i}
        evenements={evenements}
        onAction={(a) => executer(i, a).catch(signaler)}
        onPhoto={() => {
          defilement.current?.scrollTo({ y: Math.max(0, yNotes - 80), animated: true });
          composer.current?.photographier();
        }}
        onBloquer={() => passage.ouvrirBlocage(i, { etape: 'type' })}
        onPreciser={() => passage.ouvrirBlocage(i, { etape: 'modifier' })}
      />

      <FeuilleMenu
        ouverte={menu}
        onFermer={() => setMenu(false)}
        intervention={i}
        client={client}
        vehicule={vehicule}
        garage={garage.nom}
        evenements={evenements}
        onPrioritaire={(v) => ecrire(repo().modifierIntervention(i.id, { prioritaire: v }), montrerAvis, 'Impossible de changer la priorité.')}
        onAttribuer={p.voirTout ? () => setAttribution(true) : undefined}
        onDeplacer={deplacable ? () => setDeplacement(true) : undefined}
        onRetourPrevu={p.creer ? () => setRetourPrevu(true) : undefined}
        onAction={(a) => executer(i, a).catch(signaler)}
        onAnnuler={() => setAnnulation(true)}
        onAvis={montrerAvis}
      />
      <FeuillesPassage passage={passage} />
      <FeuilleAttribution
        ouverte={attribution}
        onFermer={() => setAttribution(false)}
        actuel={i.membreId}
        membres={fiche.equipe}
        vehicule={vehicule}
        prestation={i.prestation}
        jour={new Date(i.debut)}
        onChoisir={(membreId) => {
          setAttribution(false);
          if (i.membreId !== membreId) {
            impulsion('succes');
            ecrire(repo().affecter(i.id, membreId, membre.id), montrerAvis, 'Impossible de changer le mécanicien.');
          }
        }}
      />
      <FeuilleAnnulation
        ouverte={annulation}
        onFermer={() => setAnnulation(false)}
        intervention={i}
        client={client}
        vehicule={vehicule}
        onAnnuler={async (motif) => {
          try {
            await passer(i, 'annule', { motif });
          } catch (e) {
            montrerAvis((e as Error).message || 'Impossible d’annuler l’intervention.');
          } finally {
            setAnnulation(false);
          }
        }}
      />
      <FeuilleDeplacer
        ouverte={deplacement}
        onFermer={() => setDeplacement(false)}
        intervention={i}
        client={client}
        vehicule={vehicule}
        horaires={garage.horaires}
        onAvis={montrerAvis}
      />
      <FeuilleRetourPrevu
        ouverte={retourPrevu}
        onFermer={() => setRetourPrevu(false)}
        intervention={i}
        client={client}
        vehicule={vehicule}
        horaires={garage.horaires}
        onAvis={montrerAvis}
      />
      <FeuilleKilometrage
        ouverte={kilometrage}
        onFermer={() => setKilometrage(false)}
        intervention={i}
        client={client}
        vehicule={vehicule}
        onAvis={montrerAvis}
      />
      {/* Le montant s’ouvre sur un pavé numérique sans touche de validation : « OK » au-dessus du clavier. */}
      <BarreClavier />
      {/*
        Au-dessus de la barre d’action : l’avis ne recouvre jamais le grand bouton. Un avis à bouton
        (« Annuler ») va en haut, sous l’en-tête : un appui tardif à la place de « Sans SMS » ne défait rien.
      */}
      <Avis
        texte={avis}
        flottant
        loinDuDoigt
        auDessus={HAUTEUR_BARRE + Math.max(insets.bottom, 12) + 8}
        margeHaute={(Platform.OS === 'ios' ? insets.top + HAUTEUR_EN_TETE_IOS : 0) + 8}
      />
    </Ecran>
  );
}
