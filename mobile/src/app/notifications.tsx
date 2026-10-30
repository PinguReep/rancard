/**
 * Notifications (feuille). Les nouvelles d'abord, puis « Plus tôt ».
 * Un appui marque la notification lue et ouvre sa cible en remplaçant la
 * feuille, pour que le retour ramène aux onglets. Seules les notifications
 * dont la cible est visible avec les accès du membre sont listées.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EnteteFeuille } from '@/components/notifications/EnteteFeuille';
import { LigneNotification } from '@/components/notifications/LigneNotification';
import { notificationsVisibles } from '@/components/notifications/visibles';
import { Ecran, Etiquette, Vide } from '@/components/ui';
import { repo } from '@/data';
import type { Notification } from '@/domain/types';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

type Rangee = { type: 'entete'; id: string; titre: string } | { type: 'notif'; id: string; n: Notification; derniere: boolean };

function hrefCible(cible: NonNullable<Notification['cible']>): Href {
  return (cible.type === 'intervention' ? `/intervention/${cible.id}` : `/appel/${cible.id}`) as Href;
}

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const membre = useMembre();
  const p = usePermissions();
  const notifications = useDonnees((s) => s.notifications);
  const interventions = useDonnees((s) => s.interventions);

  const liste = useMemo(
    () => notificationsVisibles({ notifications, interventions }, membre, p).sort((a, b) => b.creeLe.localeCompare(a.creeLe)),
    [notifications, interventions, membre, p],
  );

  const rangees = useMemo(() => {
    const nouvelles = liste.filter((n) => !n.lue);
    const anciennes = liste.filter((n) => n.lue);
    const out: Rangee[] = [];
    if (nouvelles.length) {
      out.push({ type: 'entete', id: 'entete-nouvelles', titre: 'Nouvelles' });
      nouvelles.forEach((n, i) => out.push({ type: 'notif', id: n.id, n, derniere: i === nouvelles.length - 1 }));
    }
    if (anciennes.length) {
      out.push({ type: 'entete', id: 'entete-anciennes', titre: 'Plus tôt' });
      anciennes.forEach((n, i) => out.push({ type: 'notif', id: n.id, n, derniere: i === anciennes.length - 1 }));
    }
    return out;
  }, [liste]);

  const nonLues = liste.filter((n) => !n.lue).length;

  /**
   * « Tout marquer lu » ne touche que ce que le membre voit. En une seule
   * écriture quand toutes ses non lues (les siennes et celles du garage)
   * sont visibles ; sinon une par une : en démo, la lecture d’une
   * notification du garage vaut pour tous, et un mécanicien ne doit pas
   * vider la cloche du comptoir avec des fiches qu’il ne voit pas.
   */
  async function toutLire() {
    const visibles = new Set(liste.map((n) => n.id));
    const aLire = liste.filter((n) => !n.lue);
    const cachees = notifications.some((n) => !n.lue && (n.membreId === null || n.membreId === membre.id) && !visibles.has(n.id));
    try {
      if (!cachees) {
        await repo().toutMarquerLu(membre.id);
        return;
      }
      for (const n of aLire) await repo().marquerLue(n.id);
    } catch {
      // Confort : la pastille reviendra au prochain chargement.
    }
  }

  function fermer() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/planning');
  }

  // Marquer lue est un confort : un échec ne doit ni bloquer l'ouverture ni
  // remonter en rejet non géré ; la pastille reviendra au prochain chargement.
  function ouvrir(n: Notification) {
    if (!n.lue) repo().marquerLue(n.id).catch(() => {});
    if (!n.cible) return;
    router.replace(hrefCible(n.cible));
  }

  return (
    <Ecran sansHaut={Platform.OS === 'ios'}>
      <EnteteFeuille titre="Notifications" nonLues={nonLues} onToutLire={() => void toutLire()} onFermer={fermer} />
      {rangees.length === 0 ? (
        <Vide
          icone="cloche"
          titre="Rien de nouveau"
          texte={
            p.voirTout
              ? 'Les rendez-vous du site, les fiches du réceptionniste, les messages des clients et les relais de l’équipe (pièces, accords, voitures confiées) arrivent ici.'
              : 'Les voitures qui vous sont confiées, les pièces reçues, les accords et les messages des clients arrivent ici.'
          }
        />
      ) : (
        <FlashList
          data={rangees}
          keyExtractor={(r) => r.id}
          getItemType={(r) => r.type}
          renderItem={({ item }) =>
            item.type === 'entete' ? (
              <View className="px-4 pb-2 pt-5">
                <Etiquette accessibilityRole="header">{item.titre}</Etiquette>
              </View>
            ) : (
              <LigneNotification notification={item.n} derniere={item.derniere} onPress={() => ouvrir(item.n)} />
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}
    </Ecran>
  );
}
