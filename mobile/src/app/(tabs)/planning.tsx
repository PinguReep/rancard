/**
 * Planning : la journée de l’atelier. « Mes voitures » ou « Tout
 * l’atelier », sélecteur de jour, puis les sections dans l’ordre des
 * décisions à prendre (à valider, bloquées, aujourd’hui, prêtes, livrées).
 * Appui long sur une carte : actions rapides. Tout vient du store et se
 * met à jour après chaque mutation.
 */

import { FlashList } from '@shopify/flash-list';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Entete } from '@/components/entete';
import { Avis } from '@/components/intervention/Avis';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleSmsPret } from '@/components/intervention/FeuilleSmsPret';
import { usePassageStatut } from '@/components/intervention/passage-statut';
import { CarteIntervention } from '@/components/planning/CarteIntervention';
import { FeuilleActions } from '@/components/planning/FeuilleActions';
import { ORDRE_SECTIONS, sectionDe, titreSection, trier, visibleCeJour, type CleSection } from '@/components/planning/logique';
import { SelecteurJour } from '@/components/planning/SelecteurJour';
import { Bouton, BoutonRond, Ecran, Etiquette, Icone, Legende, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { repo } from '@/data';
import type { Intervention } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { halo, useTheme, type Palette } from '@/theme/tokens';

type Portee = 'moi' | 'tous';

type LignePlanning =
  | { type: 'section'; cle: CleSection; titre: string; nb: number; repliable: boolean; ouverte: boolean }
  | { type: 'carte'; cle: CleSection; intervention: Intervention };

const COULEUR_SECTION: Record<CleSection, keyof Palette> = {
  a_valider: 'warn',
  bloquees: 'warn',
  atelier: 'accent',
  pretes: 'ok',
  livrees: 'faint',
};

export default function Planning() {
  const router = useRouter();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const margeBasse = useMargeBasse();

  const [jour, setJour] = useState(() => startOfDay(new Date()));
  // Un mécanicien commence par ses voitures ; gérant et réception par l’atelier entier.
  const [portee, setPortee] = useState<Portee>(() => (p.voirTout && membre.poste !== 'mecanicien' ? 'tous' : 'moi'));
  const [livreesOuvertes, setLivreesOuvertes] = useState(false);
  const [actionsPour, setActionsPour] = useState<string | null>(null);
  const [attribuerPour, setAttribuerPour] = useState<string | null>(null);
  const { executer, passer, cibleSms, fermerSms, avis, montrerAvis } = usePassageStatut();

  const tous = p.voirTout && portee === 'tous';

  const d = useDonnees((s) => {
    const visibles = s.interventions.filter((i) => p.voirTout || i.membreId === membre.id);
    const duJourTous = visibles.filter((i) => visibleCeJour(i, jour, s.evenements));
    const duJourMoi = duJourTous.filter((i) => i.membreId === membre.id);
    // Copie superficielle : le dépôt de démonstration modifie les objets en
    // place, une référence neuve garantit le rafraîchissement des cartes.
    const duJour = (tous ? duJourTous : duJourMoi).map((i) => ({ ...i })).sort(trier);
    const mesRdv = (tous ? visibles : visibles.filter((i) => i.membreId === membre.id)).filter((i) => i.statut !== 'annule');
    return {
      clients: s.clients,
      vehicules: s.vehicules,
      membres: s.membres,
      equipe: s.membres.filter((m) => m.actif && !m.invitationEnAttente),
      duJour,
      nbMoi: duJourMoi.length,
      nbTous: duJourTous.length,
      joursAvecRdv: Array.from({ length: 7 }, (_, k) => addDays(startOfDay(new Date()), k - 3)).filter((j) => mesRdv.some((i) => isSameDay(new Date(i.debut), j))),
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

  const ouvrir = (id: string) => router.push(`/intervention/${id}`);
  // Les boutons qui l'appellent donnent déjà le retour haptique.
  const nouvelle = () => router.push('/nouvelle-intervention');
  const signaler = (e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.');

  const entete = (
    <View className="pb-1">
      <Entete titre="Planning" droite={p.creer ? <BoutonRond nom="plus" label="Nouvelle intervention" onPress={nouvelle} accent /> : undefined} />
      {p.voirTout ? (
        <Segments<Portee>
          options={[
            { id: 'moi', label: 'Mes voitures', compte: d.nbMoi },
            { id: 'tous', label: 'Tout l’atelier', compte: d.nbTous },
          ]}
          valeur={portee}
          onChange={setPortee}
          className="mx-4 mb-4"
        />
      ) : null}
      <SelecteurJour jour={jour} onChanger={setJour} aDesRendezVous={(j) => d.joursAvecRdv.some((x) => isSameDay(x, j))} />
    </View>
  );

  const vide = (
    <Vide
      icone="planning"
      titre={tous ? 'Rien de prévu ce jour' : 'Aucune voiture pour vous ce jour'}
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
      const couleur = t[COULEUR_SECTION[item.cle]];
      return (
        <View className="flex-row items-center justify-between px-5 pb-2.5 pt-6">
          <View className="flex-row items-center gap-2">
            <View className="h-[7px] w-[7px] rounded-full" style={[{ backgroundColor: couleur }, t.scheme === 'dark' ? halo(couleur, 6, 0.9) : null]} />
            <Etiquette>
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
      <Animated.View entering={FadeIn.duration(200)} className="px-4 pb-2.5">
        <CarteIntervention
          intervention={i}
          client={client}
          vehicule={vehiculeDe(i)}
          mecanicien={mecanicienDe(i)}
          avecMecanicien={tous}
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
