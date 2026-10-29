/**
 * Planning : la journée de l’atelier. « Mes voitures » ou « Tout
 * l’atelier », sélecteur de jour (et « Autre jour » au-delà de J+6), puis
 * les sections dans l’ordre des décisions à prendre (à valider, bloquées,
 * aujourd’hui, prêtes, livrées). Chaque carte porte son geste suivant ;
 * appui long ou appui sur l’état : actions rapides. Tout vient du store et
 * se met à jour après chaque mutation.
 *
 * v2c : bandeau « À traiter » (vue « Tout l’atelier », chaque jour),
 * « Votre journée » (charge du jour affiché), et une seule garde du double
 * appui pour toute l’app : la liste reste inerte aussi longtemps que la
 * garde armée par `passage-statut` après chaque changement de statut.
 */

import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { isSameDay, startOfDay } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Entete } from '@/components/entete';
import { Avis } from '@/components/intervention/Avis';
import { FeuilleAttribution } from '@/components/intervention/FeuilleAttribution';
import { FeuilleDeplacer } from '@/components/intervention/FeuilleDeplacer';
import { FeuillesPassage, usePassageStatut } from '@/components/intervention/passage-statut';
import { useAjout } from '@/components/planning/ajout';
import { BandeauATraiter } from '@/components/planning/BandeauATraiter';
import { CarteIntervention } from '@/components/planning/CarteIntervention';
import { FeuilleActions } from '@/components/planning/FeuilleActions';
import {
  ORDRE_SECTIONS,
  evenementsParIntervention,
  sectionDe,
  texteJournee,
  titreSection,
  trier,
  visibleCeJour,
  type CleSection,
  type FiltreATraiter,
} from '@/components/planning/logique';
import { SelecteurJour, joursDeLaBande } from '@/components/planning/SelecteurJour';
import { Bouton, BoutonRond, Ecran, Etiquette, FeuilleDate, Icone, Legende, Vide, armerGarde, impulsion, useGardeActive, useMargeBasse } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { repo } from '@/data';
import { aTraiter, chargeDuJour, estNouvellePour } from '@/domain/echeances';
import type { CanalPrevenu, Evenement, Intervention } from '@/domain/types';
import { useControleRafraichir } from '@/hooks/use-rafraichir';
import { dePrenom, heure, jourHeure, nomClient, voitureEtPlaque } from '@/lib/format';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { halo, useTheme, type Palette } from '@/theme/tokens';

type Portee = 'moi' | 'tous';

type LignePlanning =
  | { type: 'section'; cle: CleSection; titre: string; nb: number; repliable: boolean; ouverte: boolean }
  | { type: 'carte'; cle: CleSection; intervention: Intervention };

/** Attente avant d’amener la carte ajoutée par l’assistant (fermeture de la modale). */
const DELAI_DEFILEMENT_AJOUT_MS = 400;

/** Le temps qu’une feuille se ferme avant d’en ouvrir une autre (iOS : une fenêtre modale à la fois). */
const FERMETURE_FEUILLE_MS = 260;

const AUCUN: Evenement[] = [];

const COULEUR_SECTION: Record<CleSection, keyof Palette> = {
  a_valider: 'warn',
  bloquees: 'warn',
  atelier: 'accent',
  pretes: 'ok',
  livrees: 'faint',
};

export default function Planning() {
  const router = useRouter();
  const rafraichir = useControleRafraichir();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const margeBasse = useMargeBasse();

  const [jour, setJour] = useState(() => startOfDay(new Date()));
  // Un mécanicien commence par ses voitures ; gérant et réception par l’atelier entier.
  const [portee, setPortee] = useState<Portee>(() => (p.voirTout && membre.poste !== 'mecanicien' ? 'tous' : 'moi'));
  const [livreesOuvertes, setLivreesOuvertes] = useState(false);
  // Puce choisie du bandeau « À traiter » ; elle tombe au changement de jour ou de segment.
  const [filtre, setFiltre] = useState<FiltreATraiter | null>(null);
  const [actionsPour, setActionsPour] = useState<string | null>(null);
  const [attribuerPour, setAttribuerPour] = useState<string | null>(null);
  const [deplacerPour, setDeplacerPour] = useState<string | null>(null);
  const [autreJour, setAutreJour] = useState(false);
  const passage = usePassageStatut();
  const { executer, passer, marquerPrevenu, avis, montrerAvis } = passage;

  // Garde du double appui (une seule pour l’app) : liste, gestes et « Confirmer » inertes pendant sa durée.
  const garde = useGardeActive();
  // Entre l’appui dans la feuille d’actions et le geste (le temps que la feuille se ferme), la liste
  // est déjà inerte : le second appui d’un double appui ne tombe pas sur la carte d’en dessous.
  const [relais, setRelais] = useState(false);
  const minuterieRelais = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (minuterieRelais.current) clearTimeout(minuterieRelais.current);
    },
    [],
  );
  /** Ferme la feuille d’actions et fait `faire` une fois fermée, liste inerte en attendant. */
  function apresFeuille(faire: () => void) {
    setActionsPour(null);
    setRelais(true);
    if (minuterieRelais.current) clearTimeout(minuterieRelais.current);
    minuterieRelais.current = setTimeout(() => {
      // Le geste prend la garde dès son appel (passage-statut) : le relais peut tomber.
      faire();
      setRelais(false);
    }, FERMETURE_FEUILLE_MS);
  }

  const tous = p.voirTout && portee === 'tous';
  const maintenant = new Date();

  const changerJour = (j: Date) => {
    setFiltre(null);
    setJour(startOfDay(j));
  };
  const changerPortee = (v: Portee) => {
    setFiltre(null);
    setPortee(v);
  };

  const d = useDonnees((s) => {
    const visibles = s.interventions.filter((i) => p.voirTout || i.membreId === membre.id);
    const duJourTous = visibles.filter((i) => visibleCeJour(i, jour, s.evenements, maintenant));
    const duJourMoi = duJourTous.filter((i) => i.membreId === membre.id);
    const parIntervention = evenementsParIntervention(s.evenements);
    const evenementsDe = (id: string) => parIntervention.get(id) ?? AUCUN;
    // Bandeau « À traiter » : vue « Tout l’atelier », chaque jour.
    const comptes = tous ? aTraiter(duJourTous, { maintenant, jour, evenementsDe }) : null;
    // Une puce retombée à zéro (dernière voiture traitée) ne masque plus rien.
    const filtreActif = comptes && filtre && comptes[filtre].length > 0 ? filtre : null;
    const retenues = comptes && filtreActif ? new Set(comptes[filtreActif]) : null;
    // Copie superficielle : le dépôt de démonstration modifie les objets en
    // place, une référence neuve garantit le rafraîchissement des cartes.
    const duJour = (tous ? duJourTous : duJourMoi)
      .filter((i) => !retenues || retenues.has(i.id))
      .map((i) => ({ ...i }))
      .sort(trier);
    const mesRdv = (tous ? visibles : visibles.filter((i) => i.membreId === membre.id)).filter((i) => i.statut !== 'annule');
    return {
      clients: s.clients,
      vehicules: s.vehicules,
      membres: s.membres,
      horaires: s.garage.horaires,
      equipe: s.membres.filter((m) => m.actif && !m.invitationEnAttente),
      tousLesJours: s.interventions,
      duJour,
      evenementsDe: parIntervention,
      comptes,
      filtreActif,
      // Pastille « Nouvelle » : voiture vraiment nouvelle pour ce membre (attribution non lue).
      nouvelles: new Set(duJour.filter((i) => estNouvellePour(i, s.notifications, s.evenements, membre.id)).map((i) => i.id)),
      // « Votre journée » : voitures du jour affiché, immobilisées comprises, sans prêtes ni livrées.
      charge: chargeDuJour(visibles, membre.id, jour),
      // Les compteurs disent ce qui reste à faire : les livrées ont leur propre section.
      nbMoi: duJourMoi.filter((i) => i.statut !== 'livre').length,
      nbTous: duJourTous.filter((i) => i.statut !== 'livre').length,
      joursAvecRdv: joursDeLaBande().filter((j) => mesRdv.some((i) => isSameDay(new Date(i.debut), j))),
    };
  });

  // Filtre retombé à zéro : oublié, il ne revient pas seul.
  const filtreActif = d.filtreActif;
  useEffect(() => {
    if (filtre && !filtreActif) setFiltre(null);
  }, [filtre, filtreActif]);

  // Ancienneté, retards et « depuis » se calculent au rendu : on rend de
  // nouveau quand l’écran reprend le focus, sans minuterie par carte.
  const [, setRetour] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRetour((n) => n + 1);
    }, []),
  );

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
  // La feuille Déplacer garde sa dernière cible le temps de se fermer.
  const cibleDeplacement = d.tousLesJours.find((i) => i.id === deplacerPour) ?? null;
  const derniereDeplacee = useRef<Intervention | null>(null);
  if (cibleDeplacement) derniereDeplacee.current = cibleDeplacement;
  const deplacee = cibleDeplacement ?? derniereDeplacee.current;

  const ouvrir = (id: string) => router.push(`/intervention/${id}`);
  // Les boutons qui l'appellent donnent déjà le retour haptique.
  const nouvelle = () => router.push('/nouvelle-intervention');
  const signaler = (e: Error) => montrerAvis(e.message || 'Impossible de changer le statut.');

  // Retour de l’assistant après « Ajouter au planning » : le jour du créneau
  // (même au-delà de J+6), la carte visible et « Ouvrir » dans l’avis, pour
  // enchaîner sans « Retour ».
  const ajout = useAjout((s) => s.dernier);
  const liste = useRef<FlashListRef<LignePlanning>>(null);
  // Carte ajoutée à amener sous les yeux, une fois son jour affiché.
  const [aMontrer, setAMontrer] = useState<string | null>(null);
  useEffect(() => {
    if (!ajout) return;
    useAjout.getState().oublier();
    const i = ajout.intervention;
    changerJour(new Date(i.debut));
    if (p.voirTout && i.membreId !== membre.id) setPortee('tous');
    // « Ajouter et réceptionner » : l’avis dit que la voiture est reçue (ou qu’elle ne l’est pas encore).
    const texte = ajout.receptionEchouee
      ? `Ajouté, mais pas encore réceptionné · ${ajout.vehicule}`
      : i.statut === 'recu'
        ? `Ajouté et réceptionné · ${ajout.vehicule} · arrivée ${heure(i.debut)}`
        : `Ajouté · ${ajout.vehicule} · ${jourHeure(i.debut)}`;
    // Règle v1 : sans « voir tout », une fiche confiée à un autre ne s’ouvre pas.
    if (p.voirTout || i.membreId === membre.id) {
      setAMontrer(i.id);
      montrerAvis(texte, { libelle: 'Ouvrir', onPress: () => ouvrir(i.id) });
    } else montrerAvis(texte);
    // Seul un nouvel ajout relance l’effet (il est oublié aussitôt traité).
  }, [ajout]);

  // Les sections du haut (à valider, bloquées) peuvent pousser la nouvelle
  // carte hors de l’écran : la liste défile jusqu’à elle, au-dessus de l’avis.
  const indexAMontrer = aMontrer ? lignes.findIndex((l) => l.type === 'carte' && l.intervention.id === aMontrer) : -1;
  useEffect(() => {
    if (indexAMontrer < 0) return;
    // Le temps que la modale se referme et que la liste du jour soit rendue.
    const minuterie = setTimeout(() => {
      liste.current?.scrollToIndex({ index: indexAMontrer, animated: true, viewPosition: 0.4 });
      setAMontrer(null);
    }, DELAI_DEFILEMENT_AJOUT_MS);
    return () => {
      clearTimeout(minuterie);
    };
  }, [indexAMontrer]);

  // « Votre journée : 4 voitures · 4 h 45 prévues » (vue « Mes voitures »).
  const journee = texteJournee(d.charge);
  const ligneJournee = tous ? null : (
    // Sans segments, la ligne remonte dans la marge de l’en-tête : la 4ᵉ carte de Elias reste en vue.
    <Legende className={`mx-5 ${p.voirTout ? '-mt-1 mb-3' : '-mt-2 mb-2'}`} accessibilityLabel={`Votre journée : ${journee.replace(' · ', ', ')}`}>
      Votre journée : <Legende ton="ink" className="font-semibold">{journee}</Legende>
    </Legende>
  );

  const entete = (
    <View className="pb-1">
      <Entete titre="Planning" date={jour} droite={p.creer ? <BoutonRond nom="plus" label="Nouvelle intervention" onPress={nouvelle} accent /> : undefined} />
      {p.voirTout ? (
        <Segments<Portee>
          options={[
            { id: 'moi', label: 'Mes voitures', compte: d.nbMoi },
            { id: 'tous', label: 'Tout l’atelier', compte: d.nbTous },
          ]}
          valeur={portee}
          onChange={changerPortee}
          className="mx-4 mb-4"
        />
      ) : null}
      {/* Sans segments (employé sans « voir tout »), « Votre journée » prend leur place. */}
      {ligneJournee}
      {d.comptes ? <BandeauATraiter comptes={d.comptes} filtre={d.filtreActif} onFiltrer={setFiltre} /> : null}
      <SelecteurJour
        jour={jour}
        onChanger={changerJour}
        aDesRendezVous={(j) => d.joursAvecRdv.some((x) => isSameDay(x, j))}
        onAutreJour={() => setAutreJour(true)}
      />
    </View>
  );

  const vide = (
    <Vide
      icone="planning"
      titre={d.filtreActif ? 'Plus rien dans ce filtre' : tous ? 'Rien de prévu ce jour' : 'Aucune voiture pour vous ce jour'}
      action={
        p.creer ? (
          <Bouton variante="secondaire" onPress={nouvelle} accessibilityLabel="Créer une nouvelle intervention">
            Nouvelle intervention
          </Bouton>
        ) : undefined
      }
    />
  );

  function rendre({ item, index }: { item: LignePlanning; index: number }) {
    if (item.type === 'section') {
      const couleur = t[COULEUR_SECTION[item.cle]];
      return (
        // La première section suit la bande de jours de près : la place va aux cartes.
        <View className={`flex-row items-center justify-between px-5 pb-2.5 ${index === 0 ? 'pt-3' : 'pt-6'}`}>
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
          evenements={d.evenementsDe.get(i.id)}
          nouvelle={d.nouvelles.has(i.id)}
          onPress={() => ouvrir(i.id)}
          onLongPress={() => setActionsPour(i.id)}
          onActions={() => setActionsPour(i.id)}
          onAttribuer={p.voirTout ? () => setAttribuerPour(i.id) : undefined}
          onGeste={(a) => {
            executer(i, a).catch(signaler);
          }}
          pied={
            item.cle === 'a_valider' ? (
              <Bouton
                compact
                variante="secondaire"
                desactive={garde}
                icone={<Icone nom="valider" taille={16} couleur={t.accent} />}
                onPress={() => passer(i, 'planifie').catch(signaler)}
                accessibilityLabel={`Confirmer le rendez-vous ${client ? dePrenom(nomClient(client)) : 'de ce client'}`}>
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
      <View className="flex-1" pointerEvents={garde || relais ? 'none' : 'auto'}>
        <FlashList
          ref={liste}
          data={lignes}
          renderItem={rendre}
          keyExtractor={(l) => (l.type === 'section' ? `s-${l.cle}` : l.intervention.id)}
          getItemType={(l) => l.type}
          ListHeaderComponent={entete}
          ListEmptyComponent={vide}
          refreshControl={rafraichir}
          contentContainerStyle={{ paddingBottom: margeBasse }}
          extraData={{ d, garde }}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <FeuilleActions
        intervention={cibleActions}
        client={cibleActions ? clientDe(cibleActions) : undefined}
        vehicule={cibleActions ? vehiculeDe(cibleActions) : undefined}
        evenements={cibleActions ? d.evenementsDe.get(cibleActions.id) : undefined}
        peutAttribuer={p.voirTout}
        onFermer={() => setActionsPour(null)}
        onAction={(a) => {
          const i = cibleActions;
          // Laisser la feuille se fermer avant d’en ouvrir une autre (SMS, Préciser, Accord).
          apresFeuille(() => {
            if (i) executer(i, a).catch(signaler);
          });
        }}
        onPrevenu={(canal: CanalPrevenu) => {
          const i = cibleActions;
          apresFeuille(() => {
            if (!i) return;
            // Pas un changement de statut : la garde protège quand même la liste du second appui.
            armerGarde();
            marquerPrevenu(i, canal).catch(signaler);
          });
        }}
        onAttribuer={() => {
          const id = actionsPour;
          setActionsPour(null);
          setTimeout(() => setAttribuerPour(id), FERMETURE_FEUILLE_MS);
        }}
        onDeplacer={
          p.creer
            ? () => {
                const id = actionsPour;
                setActionsPour(null);
                setTimeout(() => setDeplacerPour(id), FERMETURE_FEUILLE_MS);
              }
            : undefined
        }
      />
      <FeuilleAttribution
        ouverte={cibleAttribution !== null}
        onFermer={() => setAttribuerPour(null)}
        actuel={cibleAttribution?.membreId ?? null}
        membres={d.equipe}
        vehicule={cibleAttribution ? vehiculeDe(cibleAttribution) : undefined}
        prestation={cibleAttribution?.prestation}
        // Charge lue sous chaque nom : celle du jour du rendez-vous, pas d’aujourd’hui.
        jour={cibleAttribution ? new Date(cibleAttribution.debut) : undefined}
        onChoisir={(membreId) => {
          const i = cibleAttribution;
          setAttribuerPour(null);
          // Le second appui d’un double appui ne tombe pas sur la carte d’en dessous.
          armerGarde();
          if (i && i.membreId !== membreId) {
            impulsion('succes');
            // La carte quitte souvent la liste filtrée (« À attribuer ») : l’avis nomme la voiture et son mécanicien.
            const prenom = membreId ? d.membres.find((m) => m.id === membreId)?.prenom : null;
            const voiture = voitureEtPlaque(vehiculeDe(i));
            repo()
              .affecter(i.id, membreId, membre.id)
              .then(() => montrerAvis(prenom ? `Confiée à ${prenom} · ${voiture}` : `Plus attribuée · ${voiture}`))
              .catch((e: Error) => montrerAvis(e.message || 'Impossible de changer le mécanicien.'));
          }
        }}
      />
      {deplacee ? (
        <FeuilleDeplacer
          ouverte={cibleDeplacement !== null}
          onFermer={() => setDeplacerPour(null)}
          intervention={deplacee}
          client={clientDe(deplacee)}
          vehicule={vehiculeDe(deplacee)}
          horaires={d.horaires}
          onAvis={montrerAvis}
        />
      ) : null}
      <FeuilleDate
        ouverte={autreJour}
        onFermer={() => setAutreJour(false)}
        titre="Choisir un jour"
        horaires={d.horaires}
        valeur={jour}
        onChoisir={(j) => {
          setAutreJour(false);
          changerJour(j);
        }}
      />
      <FeuillesPassage passage={passage} />
      <Avis texte={avis} flottant loinDuDoigt />
    </Ecran>
  );
}
