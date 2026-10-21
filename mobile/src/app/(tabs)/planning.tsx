/**
 * Planning : la journée de l’atelier. Sélecteur de jour, filtre par
 * mécanicien, sections dans l’ordre des décisions à prendre (à valider,
 * bloquées, à l’atelier, prêtes, livrées), bascule liste / par statut,
 * actions rapides à l’appui long. Tout vient du store, tout se met à jour
 * après chaque mutation.
 */

import { FlashList } from '@shopify/flash-list';
import { startOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Entete } from '@/components/entete';
import { Avis } from '@/components/intervention/Avis';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleSmsPret } from '@/components/intervention/FeuilleSmsPret';
import { usePassageStatut } from '@/components/intervention/passage-statut';
import { BasculeVue, type Vue } from '@/components/planning/BasculeVue';
import { CarteIntervention } from '@/components/planning/CarteIntervention';
import { FeuilleActions } from '@/components/planning/FeuilleActions';
import { FiltreMembres } from '@/components/planning/FiltreMembres';
import { Kanban } from '@/components/planning/Kanban';
import {
  ORDRE_SECTIONS,
  compteur,
  libelleJour,
  sectionDe,
  sousTitreCompteur,
  titreSection,
  trier,
  visibleCeJour,
  type CleSection,
} from '@/components/planning/logique';
import { SelecteurJour } from '@/components/planning/SelecteurJour';
import { Bouton, BoutonRond, Ecran, Etiquette, Icone, Legende, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import type { Intervention } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { useTheme } from '@/theme/tokens';

type LignePlanning =
  | { type: 'section'; cle: CleSection; titre: string; nb: number; repliable: boolean; ouverte: boolean }
  | { type: 'carte'; cle: CleSection; intervention: Intervention };

export default function Planning() {
  const router = useRouter();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const margeBasse = useMargeBasse();

  const [jour, setJour] = useState(() => startOfDay(new Date()));
  const [filtre, setFiltre] = useState<string | null>(null);
  const [vue, setVue] = useState<Vue>('liste');
  const [livreesOuvertes, setLivreesOuvertes] = useState(false);
  const [actionsPour, setActionsPour] = useState<string | null>(null);
  const [attribuerPour, setAttribuerPour] = useState<string | null>(null);
  const { executer, passer, cibleSms, fermerSms, avis, montrerAvis } = usePassageStatut();

  const d = useDonnees((s) => {
    const visibles = s.interventions.filter((i) => p.voirTout || i.membreId === membre.id);
    const duJour = visibles
      .filter((i) => visibleCeJour(i, jour, s.evenements) && (filtre === null || i.membreId === filtre))
      // Copie superficielle : le dépôt de démonstration modifie les objets en
      // place, une référence neuve garantit le rafraîchissement des cartes.
      .map((i) => ({ ...i }))
      .sort(trier);
    return {
      clients: s.clients,
      vehicules: s.vehicules,
      membres: s.membres,
      equipe: s.membres.filter((m) => m.actif && !m.invitationEnAttente),
      duJour,
      compteur: compteur(visibles),
    };
  });

  const clientDe = (i: Intervention) => d.clients.find((c) => c.id === i.clientId);
  const vehiculeDe = (i: Intervention) => d.vehicules.find((v) => v.id === i.vehiculeId);
  const mecanicienDe = (i: Intervention) => (i.membreId ? (d.membres.find((m) => m.id === i.membreId) ?? null) : null);

  const lignes: LignePlanning[] = [];
  for (const cle of ORDRE_SECTIONS) {
    const items = d.duJour.filter((i) => sectionDe(i) === cle);
    if (items.length === 0) continue;
    const repliable = cle === 'livrees';
    const ouverte = !repliable || livreesOuvertes;
    lignes.push({ type: 'section', cle, titre: titreSection(cle, jour), nb: items.length, repliable, ouverte });
    if (ouverte) for (const intervention of items) lignes.push({ type: 'carte', cle, intervention });
  }

  const cibleActions = d.duJour.find((i) => i.id === actionsPour) ?? null;
  const cibleAttribution = d.duJour.find((i) => i.id === attribuerPour) ?? null;
  const prenomFiltre = filtre ? d.equipe.find((m) => m.id === filtre)?.prenom : undefined;

  const ouvrir = (id: string) => router.push(`/intervention/${id}`);
  // Les boutons qui l'appellent donnent déjà le retour haptique.
  const nouvelle = () => router.push('/nouvelle-intervention');
  const signaler = (e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.');

  const boutonPlus = p.creer ? <BoutonRond nom="plus" label="Nouvelle intervention" onPress={nouvelle} accent /> : undefined;

  const entete = (
    <View className="pb-1">
      <Entete titre="Planning" sousTitre={sousTitreCompteur(d.compteur)} droite={boutonPlus} />
      <View className="mb-2 flex-row items-center justify-between px-4">
        <Etiquette>{libelleJour(jour)}</Etiquette>
        <BasculeVue vue={vue} onChanger={setVue} />
      </View>
      <SelecteurJour jour={jour} onChanger={setJour} />
      {p.voirTout ? (
        <View className="mt-3">
          <FiltreMembres membres={d.equipe} selection={filtre} onChanger={setFiltre} />
        </View>
      ) : null}
    </View>
  );

  const vide = (
    <Vide
      icone="planning"
      titre={prenomFiltre ? `Rien pour ${prenomFiltre} ce jour` : 'Rien de prévu ce jour'}
      texte="Aucun rendez-vous ne tombe ce jour et aucun véhicule n’est immobilisé."
      action={
        p.creer ? (
          <Bouton variante="secondaire" onPress={nouvelle} accessibilityLabel="Créer une nouvelle intervention">
            Nouvelle intervention
          </Bouton>
        ) : undefined
      }
    />
  );

  function rendre({ item }: { item: LignePlanning }) {
    if (item.type === 'section') {
      return (
        <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
          <View className="flex-row items-center gap-1.5">
            {item.cle === 'bloquees' ? <Icone nom="alerte" taille={14} couleur={t.warn} /> : null}
            <Etiquette style={item.cle === 'bloquees' ? { color: t.warn } : undefined}>
              {item.titre} · {item.nb}
            </Etiquette>
          </View>
          {item.repliable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.ouverte ? 'Masquer les livrées' : 'Afficher les livrées'}
              onPress={() => {
                impulsion('leger');
                setLivreesOuvertes(!item.ouverte);
              }}
              className="min-h-[44px] justify-center px-1">
              <Legende ton="accent" className="font-semibold">
                {item.ouverte ? 'Masquer' : 'Afficher'}
              </Legende>
            </Pressable>
          ) : null}
        </View>
      );
    }
    const i = item.intervention;
    const client = clientDe(i);
    return (
      <Animated.View entering={FadeIn.duration(200)} className="px-4 pb-2">
        <CarteIntervention
          intervention={i}
          client={client}
          vehicule={vehiculeDe(i)}
          mecanicien={mecanicienDe(i)}
          jour={jour}
          onPress={() => ouvrir(i.id)}
          onLongPress={() => setActionsPour(i.id)}
          pied={
            item.cle === 'a_valider' ? (
              <Bouton
                compact
                variante="secondaire"
                icone={<Icone nom="valider" taille={16} couleur={t.accent} />}
                onPress={() => passer(i, 'planifie').catch(signaler)}
                accessibilityLabel={`Confirmer le rendez-vous de ${client ? `${client.prenom} ${client.nom}` : 'ce client'}`}>
                Confirmer
              </Bouton>
            ) : undefined
          }
        />
      </Animated.View>
    );
  }

  return (
    <Ecran>
      {vue === 'liste' ? (
        <FlashList
          data={lignes}
          renderItem={rendre}
          keyExtractor={(l) => (l.type === 'section' ? `s-${l.cle}` : l.intervention.id)}
          getItemType={(l) => l.type}
          ListHeaderComponent={entete}
          ListEmptyComponent={vide}
          contentContainerStyle={{ paddingBottom: margeBasse }}
          extraData={d}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View className="flex-1">
          {entete}
          {d.duJour.length === 0 ? (
            vide
          ) : (
            <Kanban
              interventions={d.duJour}
              clients={d.clients}
              vehicules={d.vehicules}
              membres={d.membres}
              jour={jour}
              onOuvrir={ouvrir}
              onActions={setActionsPour}
            />
          )}
        </View>
      )}

      <FeuilleActions
        intervention={cibleActions}
        client={cibleActions ? clientDe(cibleActions) : undefined}
        peutAttribuer={p.voirTout}
        onFermer={() => setActionsPour(null)}
        onAction={(a) => {
          const i = cibleActions;
          setActionsPour(null);
          // Laisser la feuille se fermer avant d’en ouvrir une autre (SMS).
          if (i) setTimeout(() => executer(i, a).catch(signaler), 220);
        }}
        onAttribuer={() => {
          const id = actionsPour;
          setActionsPour(null);
          setTimeout(() => setAttribuerPour(id), 260);
        }}
      />
      <FeuilleAttribution
        ouverte={cibleAttribution !== null}
        onFermer={() => setAttribuerPour(null)}
        actuel={cibleAttribution?.membreId ?? null}
        membres={d.equipe}
        onChoisir={(membreId) => {
          const i = cibleAttribution;
          setAttribuerPour(null);
          if (i && i.membreId !== membreId) {
            impulsion('succes');
            ecrire(repo().affecter(i.id, membreId, membre.id), montrerAvis, 'Impossible de changer le mécanicien.');
          }
        }}
      />
      <FeuilleSmsPret
        cible={cibleSms}
        onFermer={fermerSms}
        onFait={(avecSms) => montrerAvis(avecSms ? 'Véhicule prêt · SMS envoyé' : 'Véhicule prêt · sans SMS')}
        onErreur={montrerAvis}
      />
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
