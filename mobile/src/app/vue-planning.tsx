/**
 * Éditeur d’une vue du planning (création et modification), modale ouverte
 * depuis la feuille « Affichage ». Peu de choses : le nom, la disposition
 * (« Journée » ou « Équipe »), ce que montre chaque voiture et la couleur
 * des cases. L’aperçu se met à jour en direct avec une vraie intervention
 * du jour (jamais d’exemple inventé), l’action principale enregistre.
 *
 * « Sur chaque voiture » : l’ordre d’affichage est l’ordre dans lequel on
 * coche (pastilles 1, 2, 3…, décocher renumérote), quatre champs au plus,
 * le premier en gras. Jamais de montant.
 *
 * Paramètre : `id` d’une vue personnelle à modifier ; sans lui, création.
 * La vue enregistrée devient la vue affichée. Tout reste sur le téléphone.
 */

import { isSameDay } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaseIntervention } from '@/components/planning/CaseIntervention';
import { HAUTEUR_MIN_CASE, H_MAX } from '@/components/planning/horaire';
import {
  CHAMPS,
  CHAMPS_MAX,
  nouvelId,
  useVuesPlanning,
  type ChampBloc,
  type CouleurCase,
  type Disposition,
  type VuePlanning,
} from '@/components/planning/vues';
import { Bouton, BoutonRond, Champ, Ecran, Etiquette, FeuilleConfirmation, LARGEUR_MAX, Legende, SousTitre, Texte, impulsion } from '@/components/ui';
import { Segments } from '@/components/ui/segments';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

/** Hauteur de l’aperçu : toutes les lignes choisies, comme une case d’une heure au zoom le plus grand (« Journée », un jour). */
const HAUTEUR_APERCU = Math.max(HAUTEUR_MIN_CASE, H_MAX - 2);

export default function EditeurVue() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const membre = useMembre();
  const p = usePermissions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existante = useVuesPlanning((s) => s.personnelles.find((v) => v.id === id) ?? null);
  const enregistrer = useVuesPlanning((s) => s.enregistrer);
  const supprimer = useVuesPlanning((s) => s.supprimer);
  const choisir = useVuesPlanning((s) => s.choisir);
  const nbPersonnelles = useVuesPlanning((s) => s.personnelles.length);

  const [nom, setNom] = useState(existante?.nom ?? '');
  const [disposition, setDisposition] = useState<Exclude<Disposition, 'liste'>>(
    existante && existante.disposition !== 'liste' && (p.voirTout || existante.disposition !== 'equipe') ? existante.disposition : 'journee',
  );
  const [champs, setChamps] = useState<ChampBloc[]>(existante?.champs ?? ['client', 'vehicule']);
  const [couleur, setCouleur] = useState<CouleurCase>(existante?.couleur ?? 'etat');
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [idVue] = useState(() => existante?.id ?? nouvelId());

  // Aperçu : une vraie intervention que ce membre voit, de préférence avec un créneau aujourd’hui.
  const d = useDonnees((s) => {
    const maintenant = new Date();
    const visibles = s.interventions.filter((i) => i.statut !== 'annule' && (p.voirTout || i.membreId === membre.id));
    const duJour = visibles.filter((i) => isSameDay(new Date(i.debut), maintenant)).sort((a, b) => a.debut.localeCompare(b.debut));
    const i = duJour.find((x) => x.statut !== 'livre') ?? duJour[0] ?? visibles.find((x) => x.statut !== 'livre') ?? null;
    return {
      i,
      client: i ? s.clients.find((c) => c.id === i.clientId) : undefined,
      vehicule: i ? s.vehicules.find((v) => v.id === i.vehiculeId) : undefined,
      mecanicien: i?.membreId ? (s.membres.find((m) => m.id === i.membreId) ?? null) : null,
    };
  });

  const nomPropose = nbPersonnelles ? `Ma vue ${nbPersonnelles + 1}` : 'Ma vue';
  const pleine = champs.length >= CHAMPS_MAX;
  const basculer = (c: ChampBloc) => {
    impulsion('leger');
    setChamps((avant) => (avant.includes(c) ? avant.filter((x) => x !== c) : avant.length >= CHAMPS_MAX ? avant : [...avant, c]));
  };

  const vue: VuePlanning = useMemo(
    () => ({
      id: idVue,
      nom: nom.trim() || existante?.nom || nomPropose,
      disposition,
      champs,
      couleur,
      prefaite: false,
    }),
    [idVue, existante, nom, nomPropose, disposition, champs, couleur],
  );

  const fermer = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/planning');
  };

  const valider = () => {
    enregistrer(vue);
    choisir(vue.id);
    fermer();
  };

  return (
    <Ecran sansHaut>
      <View style={{ paddingTop: Platform.OS === 'ios' ? 8 : insets.top }}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <SousTitre>{existante ? 'Modifier la vue' : 'Nouvelle vue'}</SousTitre>
          <BoutonRond nom="fermer" label="Fermer" onPress={fermer} />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
        }}>
        <Champ libelle="Nom de la vue" value={nom} onChangeText={setNom} placeholder={nomPropose} returnKeyType="done" maxLength={40} />

        {/* Aperçu en direct, en tête : chaque choix se voit aussitôt. */}
        <Etiquette className="mb-2 ml-1">Aperçu</Etiquette>
        {d.i ? (
          <View className="mb-6 flex-row gap-2 rounded-2xl border border-line bg-surface p-2 dark:border-line-dark dark:bg-surface-dark">
            <View style={{ height: HAUTEUR_APERCU }} className="flex-[3]">
              <CaseIntervention
                intervention={d.i}
                client={d.client}
                vehicule={d.vehicule}
                mecanicien={d.mecanicien}
                champs={champs}
                couleur={couleur}
                hauteur={HAUTEUR_APERCU}
              />
            </View>
            {/* La même case, serrée par un chevauchement et plus courte : ce qui reste lisible. */}
            <View style={{ height: Math.round(HAUTEUR_APERCU * 0.55) }} className="flex-[2]">
              <CaseIntervention
                intervention={d.i}
                client={d.client}
                vehicule={d.vehicule}
                mecanicien={d.mecanicien}
                champs={champs}
                couleur={couleur}
                hauteur={Math.round(HAUTEUR_APERCU * 0.55)}
                etroite
              />
            </View>
          </View>
        ) : (
          <Legende className="mb-6 ml-1">Aucune intervention à montrer pour l’aperçu.</Legende>
        )}

        {p.voirTout ? (
          <View className="mb-6">
            <Etiquette className="mb-2 ml-1">Disposition</Etiquette>
            <Segments<Exclude<Disposition, 'liste'>>
              options={[
                { id: 'journee', label: 'Journée' },
                { id: 'equipe', label: 'Équipe' },
              ]}
              valeur={disposition}
              onChange={setDisposition}
              className=""
            />
            <Legende className="ml-1 mt-2">
              {disposition === 'equipe' ? 'Une colonne par mécanicien, les heures à gauche.' : 'Toutes les voitures dans une même grille horaire.'}
            </Legende>
          </View>
        ) : null}

        <Etiquette accessibilityRole="header" className="mb-2 ml-1">
          Sur chaque voiture
        </Etiquette>
        <View className="overflow-hidden rounded-2xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
          {CHAMPS.map((c, k) => {
            const rang = champs.indexOf(c.id);
            const coche = rang >= 0;
            const bloque = !coche && pleine;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: coche, disabled: bloque }}
                accessibilityLabel={coche ? `${c.label}, en position ${rang + 1}` : c.label}
                disabled={bloque}
                onPress={() => basculer(c.id)}
                className={`min-h-[48px] flex-row items-center gap-3 px-4 py-2.5 ${k === CHAMPS.length - 1 ? '' : 'border-b border-line dark:border-line-dark'} ${
                  bloque ? 'opacity-40' : 'active:bg-surface2 dark:active:bg-surface2-dark'
                }`}>
                {coche ? (
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-accent dark:bg-accent-fond">
                    <Text maxFontSizeMultiplier={1.2} className="text-[13px] font-bold text-white">
                      {rang + 1}
                    </Text>
                  </View>
                ) : (
                  <View className="h-6 w-6 rounded-full border-2 border-line dark:border-line-dark" />
                )}
                <Texte className={`flex-1 ${rang === 0 ? 'font-semibold' : ''}`}>{c.label}</Texte>
              </Pressable>
            );
          })}
        </View>
        <Legende className="mb-6 ml-1 mt-2">
          {champs.length === 0 ? 'Cochez au moins un champ.' : `Dans l’ordre où vous cochez, le premier en gras. ${CHAMPS_MAX} au plus.`}
        </Legende>

        <Etiquette className="mb-2 ml-1">Couleur des cases</Etiquette>
        <Segments<CouleurCase>
          options={[
            { id: 'etat', label: 'Par état' },
            { id: 'mecanicien', label: 'Par mécanicien' },
          ]}
          valeur={couleur}
          onChange={setCouleur}
          className="mb-6"
        />

        {existante ? (
          <Bouton variante="danger" onPress={() => setConfirmerSuppression(true)} accessibilityLabel={`Supprimer la vue ${existante.nom}`}>
            Supprimer cette vue
          </Bouton>
        ) : null}
      </ScrollView>

      <View className="border-t border-line bg-bg px-4 pt-3 dark:border-line-dark dark:bg-bg-dark" style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="w-full self-center" style={{ maxWidth: LARGEUR_MAX }}>
          <Bouton onPress={valider} desactive={champs.length === 0} accessibilityLabel={`Enregistrer la vue ${vue.nom}`}>
            Enregistrer
          </Bouton>
        </View>
      </View>

      <FeuilleConfirmation
        ouverte={confirmerSuppression}
        onFermer={() => setConfirmerSuppression(false)}
        titre="Supprimer cette vue ?"
        texte="Seul l’affichage disparaît : aucune intervention n’est touchée. Le planning revient à la liste."
        libelle="Supprimer"
        variante="danger"
        onConfirmer={() => {
          const v = existante;
          setConfirmerSuppression(false);
          // La feuille se ferme d’abord : deux fermetures simultanées se gênent sur iOS.
          setTimeout(() => {
            if (v) supprimer(v.id);
            fermer();
          }, 240);
        }}
      />
    </Ecran>
  );
}
