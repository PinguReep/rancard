/**
 * Appels : ce que le réceptionniste téléphonique a traité. Appels en cours
 * en tête (fiche remplie en direct), fiches à valider ensuite, puis
 * l'historique. Un appel « en cours » depuis plus de 15 minutes rejoint
 * l'historique (domain/appels.ts). Sans l'option, une
 * explication calme et un aperçu. Un refus du serveur (fiche déjà traitée,
 * accès insuffisant) s'affiche en avis.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { CarteAppelAValider } from '@/components/appels/CarteAppelAValider';
import { CarteAppelEnCours } from '@/components/appels/CarteAppelEnCours';
import { LigneAppel } from '@/components/appels/LigneAppel';
import { OptionReceptionniste } from '@/components/appels/OptionReceptionniste';
import { Entete } from '@/components/entete';
import { Avis, useAvis } from '@/components/intervention/Avis';
import { Ecran, Etiquette, Legende, Vide, impulsion, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import { appelEnDirect } from '@/domain/appels';
import type { Appel } from '@/domain/types';
import { useControleRafraichir } from '@/hooks/use-rafraichir';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

export default function Appels() {
  const router = useRouter();
  const rafraichir = useControleRafraichir();
  const membre = useMembre();
  const p = usePermissions();
  const margeBasse = useMargeBasse();
  const garage = useDonnees((s) => s.garage);
  const appels = useDonnees((s) => s.appels);
  const interventions = useDonnees((s) => s.interventions);
  const vehicules = useDonnees((s) => s.vehicules);
  const [enTraitement, setEnTraitement] = useState<string | null>(null);
  const [avis, montrerAvis] = useAvis();

  // Un appel cesse d'être en direct 15 minutes après son début, même sans compte rendu de fin.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { enCours, aValider, historique } = useMemo(() => {
    const direct = (a: Appel) => appelEnDirect(a, maintenant);
    const enCours = appels.filter(direct).sort((a, b) => b.debut.localeCompare(a.debut));
    const aValider = appels
      .filter((a) => !direct(a) && a.interventionId && interventions.find((i) => i.id === a.interventionId)?.statut === 'a_valider')
      .sort((a, b) => b.debut.localeCompare(a.debut));
    const ids = new Set(aValider.map((a) => a.id));
    const historique = appels.filter((a) => !direct(a) && !ids.has(a.id)).sort((a, b) => b.debut.localeCompare(a.debut));
    return { enCours, aValider, historique };
  }, [appels, interventions, maintenant]);

  if (!p.appels) {
    return (
      <Ecran>
        <Entete titre="Appels" />
        <Vide icone="cadenas" titre="Accès réservé" texte="Les appels sont visibles avec la permission « Voir les appels ». Demandez-la au gérant." />
      </Ecran>
    );
  }

  if (!garage.options.receptionniste) {
    return (
      <Ecran defilant>
        <Entete titre="Appels" />
        <OptionReceptionniste />
      </Ecran>
    );
  }

  const valider = async (a: Appel) => {
    setEnTraitement(a.id);
    try {
      const i = await repo().validerAppel(a.id, membre.id);
      impulsion('succes');
      if (i) router.push(`/intervention/${i.id}`);
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible de valider cette fiche.');
    } finally {
      setEnTraitement(null);
    }
  };

  const ignorer = async (a: Appel) => {
    setEnTraitement(a.id);
    try {
      await repo().ignorerAppel(a.id);
      impulsion('leger');
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible d’ignorer cet appel.');
    } finally {
      setEnTraitement(null);
    }
  };

  const entete = (
    <View>
      <Entete titre="Appels" sansDate />
      {enCours.map((a) => (
        <CarteAppelEnCours key={a.id} appel={a} />
      ))}
      {aValider.length ? (
        <View className="mb-6 px-4">
          <Etiquette accessibilityRole="header" className="mb-2 ml-1">{`À valider · ${aValider.length}`}</Etiquette>
          <View className="gap-3">
            {aValider.map((a) => {
              const i = interventions.find((x) => x.id === a.interventionId);
              if (!i) return null;
              return (
                <Animated.View key={a.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(240)}>
                  <CarteAppelAValider
                    appel={a}
                    intervention={i}
                    vehicule={vehicules.find((v) => v.id === i.vehiculeId)}
                    chargement={enTraitement === a.id}
                    onValider={() => valider(a)}
                    onModifier={() => router.push(`/intervention/${i.id}`)}
                    onIgnorer={() => ignorer(a)}
                  />
                </Animated.View>
              );
            })}
          </View>
        </View>
      ) : null}
      {appels.length ? (
        <View className="px-4">
          <Etiquette accessibilityRole="header" className="mb-2 ml-1">
            Historique
          </Etiquette>
        </View>
      ) : null}
    </View>
  );

  return (
    <Ecran>
      <FlashList
        data={historique}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => (
          <View className="px-4 pb-2">
            <LigneAppel appel={item} onPress={() => router.push(`/appel/${item.id}`)} />
          </View>
        )}
        ListHeaderComponent={entete}
        refreshControl={rafraichir}
        ListEmptyComponent={
          appels.length === 0 ? (
            <Vide icone="appels" titre="Aucun appel pour l’instant" texte="Les appels pris par le réceptionniste apparaîtront ici, avec leur résumé." />
          ) : (
            <Legende className="px-5">Aucun appel passé pour l’instant.</Legende>
          )
        }
        contentContainerStyle={{ paddingBottom: margeBasse }}
      />
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
