/**
 * Appels : ce que le réceptionniste téléphonique a traité. Appels en cours
 * en tête (fiche remplie en direct), fiches à valider ensuite, puis
 * l'historique. Un appel « en cours » depuis plus de 15 minutes rejoint
 * l'historique (domain/appels.ts). Sans la prestation « Réceptionniste
 * IA », la fonction grisée et un aperçu. Un refus du serveur (fiche déjà traitée,
 * accès insuffisant) s'affiche en avis. Une fiche validée avec son
 * mécanicien est réglée : on reste sur les appels, la carte reste un moment
 * à sa place, « Confirmé · Elias · … » avec « Ouvrir » ; validée « plus
 * tard », elle s'ouvre comme en v1 pour attribuer.
 *
 * Double appui (relecture du 29 octobre) : la garde de l'app couvre la
 * validation (cartes inertes pendant l'écriture puis `GARDE_MS`), et la
 * carte validée ne laisse pas la suivante remonter sous le doigt : le
 * second appui ne valide jamais une fiche qu'on n'a pas lue.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { CarteAppelAValider } from '@/components/appels/CarteAppelAValider';
import { CarteAppelEnCours } from '@/components/appels/CarteAppelEnCours';
import { LigneAppel } from '@/components/appels/LigneAppel';
import { OptionReceptionniste } from '@/components/appels/OptionReceptionniste';
import { Entete } from '@/components/entete';
import { Avis, DUREE_AVIS_ACTION_MS, useAvis } from '@/components/intervention/Avis';
import { Ecran, Etiquette, GARDE_MS, Legende, Vide, armerGarde, gardeActive, impulsion, prendreGarde, useGardeActive, useMargeBasse } from '@/components/ui';
import { repo } from '@/data';
import { appelEnDirect } from '@/domain/appels';
import { aPrestation } from '@/domain/prestations';
import type { Appel } from '@/domain/types';
import { useControleRafraichir } from '@/hooks/use-rafraichir';
import { jourHeure, voitureEtPlaque } from '@/lib/format';
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
  const membres = useDonnees((s) => s.membres);
  const [enTraitement, setEnTraitement] = useState<string | null>(null);
  const [avis, montrerAvis] = useAvis();
  // Garde du double appui (une seule pour l'app) : cartes « À valider » inertes pendant sa durée.
  const garde = useGardeActive();

  /** Fiches validées gardées à leur place, « Confirmé · … », le temps d'un avis (par appel). */
  const [confirmees, setConfirmees] = useState<Record<string, { texte: string; interventionId: string }>>({});
  const minuteries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const m = minuteries.current;
    return () => {
      for (const x of m.values()) clearTimeout(x);
    };
  }, []);
  function garderConfirmee(appelId: string, texte: string, interventionId: string) {
    setConfirmees((c) => ({ ...c, [appelId]: { texte, interventionId } }));
    AccessibilityInfo.announceForAccessibility(texte);
    const avant = minuteries.current.get(appelId);
    if (avant) clearTimeout(avant);
    minuteries.current.set(
      appelId,
      setTimeout(() => {
        minuteries.current.delete(appelId);
        setConfirmees((c) => {
          const reste = { ...c };
          delete reste[appelId];
          return reste;
        });
      }, DUREE_AVIS_ACTION_MS),
    );
  }

  // Un appel cesse d'être en direct 15 minutes après son début, même sans compte rendu de fin.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { enCours, aValider, historique } = useMemo(() => {
    const direct = (a: Appel) => appelEnDirect(a, maintenant);
    const enCours = appels.filter(direct).sort((a, b) => b.debut.localeCompare(a.debut));
    // Une fiche tout juste validée reste à sa place (« Confirmé ») : la suivante ne remonte pas sous le doigt.
    const aValider = appels
      .filter(
        (a) =>
          !direct(a) &&
          a.interventionId &&
          (confirmees[a.id] || interventions.find((i) => i.id === a.interventionId)?.statut === 'a_valider'),
      )
      .sort((a, b) => b.debut.localeCompare(a.debut));
    const ids = new Set(aValider.map((a) => a.id));
    const historique = appels.filter((a) => !direct(a) && !ids.has(a.id)).sort((a, b) => b.debut.localeCompare(a.debut));
    return { enCours, aValider, historique };
  }, [appels, interventions, maintenant, confirmees]);
  const nbAValider = aValider.filter((a) => !confirmees[a.id]).length;

  /** Choix du mécanicien sur la carte : pour qui voit tout le planning, l'équipe active hors réceptionnaire. */
  const mecaniciens = useMemo(
    () => (p.voirTout ? membres.filter((m) => m.actif && !m.invitationEnAttente && m.poste !== 'receptionnaire') : []),
    [membres, p.voirTout],
  );

  if (!p.appels) {
    return (
      <Ecran>
        <Entete titre="Appels" />
        <Vide icone="cadenas" titre="Accès réservé" texte="Les appels sont visibles avec la permission « Voir les appels ». Demandez-la au gérant." />
      </Ecran>
    );
  }

  if (!aPrestation(garage, 'receptionniste')) {
    return (
      <Ecran defilant>
        <Entete titre="Appels" />
        <OptionReceptionniste />
      </Ecran>
    );
  }

  const valider = async (a: Appel, membreId: string | null) => {
    // Le second appui d'un double appui, même lent, ne valide pas la fiche d'en dessous.
    if (gardeActive()) return;
    const rendre = prendreGarde();
    setEnTraitement(a.id);
    try {
      const i = await repo().validerAppel(a.id, membre.id);
      if (!i) return;
      if (membreId !== i.membreId) {
        try {
          await repo().affecter(i.id, membreId, membre.id);
        } catch {
          // La fiche est confirmée : seule l'attribution reste à faire, depuis la fiche (« Ouvrir »).
          impulsion('erreur');
          garderConfirmee(a.id, `Confirmé, pas encore attribué · ${voitureEtPlaque(vehicules.find((v) => v.id === i.vehiculeId))}`, i.id);
          return;
        }
      }
      impulsion('succes');
      const choisi = membreId ? membres.find((m) => m.id === membreId) : undefined;
      if (!choisi) {
        router.push(`/intervention/${i.id}`);
        return;
      }
      // La carte nomme déjà la voiture et sa plaque : l'état, le mécanicien et le créneau.
      garderConfirmee(a.id, ['Confirmé', choisi.prenom, jourHeure(i.debut)].join(' · '), i.id);
    } catch (e) {
      impulsion('erreur');
      montrerAvis((e as Error).message || 'Impossible de valider cette fiche.');
    } finally {
      armerGarde(GARDE_MS);
      rendre();
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
      // La carte s'efface, la suivante remonte : la garde couvre ce mouvement.
      armerGarde(GARDE_MS);
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
          <Etiquette accessibilityRole="header" className="mb-2 ml-1">{`À valider · ${nbAValider}`}</Etiquette>
          <View className="gap-3" pointerEvents={garde ? 'none' : 'auto'}>
            {aValider.map((a) => {
              const i = interventions.find((x) => x.id === a.interventionId);
              if (!i) return null;
              const c = confirmees[a.id];
              return (
                <Animated.View key={a.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} layout={LinearTransition.duration(240)}>
                  <CarteAppelAValider
                    appel={a}
                    intervention={i}
                    vehicule={vehicules.find((v) => v.id === i.vehiculeId)}
                    mecaniciens={mecaniciens}
                    chargement={enTraitement === a.id}
                    desactive={garde}
                    confirmee={c ? { texte: c.texte, onOuvrir: () => router.push(`/intervention/${c.interventionId}`) } : undefined}
                    onValider={(membreId) => valider(a, membreId)}
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
      <Avis texte={avis} flottant loinDuDoigt />
    </Ecran>
  );
}
