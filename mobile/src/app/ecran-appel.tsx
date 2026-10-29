/**
 * Écran d'appel : la conversation avec le client que le réceptionniste a
 * passé à l'équipe, décrochée sur ce téléphone (CallKit, ou bandeau en
 * démonstration). Qui appelle, depuis combien de temps, ce que le
 * réceptionniste a déjà noté (même lecture que la carte en direct), et trois
 * gestes : micro, haut-parleur, raccrocher. « Réduire » revient à l'app sans
 * couper l'appel ; la carte de l'onglet Appels propose d'y revenir. L'écran
 * se referme seul à la fin de l'appel.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InfosAppelant, aDesInfos } from '@/components/appels/InfosAppelant';
import { donneesAppelant } from '@/components/appels/donnees-appelant';
import { Avis, useAvis } from '@/components/intervention/Avis';
import { BoutonAppel } from '@/components/sonnerie/BoutonAppel';
import { BoutonRond, Carte, Ecran, Etiquette, Legende, Mono, Pastille, Secondaire, Titre } from '@/components/ui';
import { dureeSecondes, formaterTelephone } from '@/lib/format';
import { basculerHautParleur, basculerMicro, raccrocher, sonnerieSimulee, useTelephone, type EtatLigne } from '@/lib/sonnerie';
import { useDonnees } from '@/state/session';

const ETATS: Record<EtatLigne, { label: string; ton: 'ok' | 'warn' | 'muted' }> = {
  connexion: { label: 'Connexion…', ton: 'muted' },
  en_ligne: { label: 'En ligne', ton: 'ok' },
  reconnexion: { label: 'Reconnexion…', ton: 'warn' },
  termine: { label: 'Appel terminé', ton: 'muted' },
};

export default function EcranAppel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actif = useTelephone((s) => s.actif);
  const appel = useDonnees((s) => (actif?.appelId ? s.appels.find((a) => a.id === actif.appelId) : undefined));
  const [avis, montrerAvis] = useAvis();
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fin de l'appel : l'écran se referme.
  const termine = !actif;
  useEffect(() => {
    if (!termine) return;
    const id = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/appels');
    }, 300);
    return () => clearTimeout(id);
  }, [termine, router]);

  const fermer = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/appels');
  };

  const agir = (f: () => Promise<void>) => () => {
    f().catch((e: unknown) => montrerAvis(e instanceof Error ? e.message : 'Action impossible pour le moment.'));
  };

  const etat = ETATS[actif?.etat ?? 'termine'];
  const ecoule = actif?.debut ? Math.max(0, Math.floor((maintenant - actif.debut) / 1000)) : 0;
  const d = appel ? donneesAppelant(appel) : null;
  const numero = appel?.numero ? formaterTelephone(appel.numero) : '';
  const nom = actif?.nom ?? '';
  const enCours = Boolean(actif) && actif?.etat !== 'termine';

  return (
    <Ecran>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <BoutonRond nom="chevron.bas" label="Réduire l’écran d’appel sans raccrocher" onPress={fermer} />
        <Pastille label={etat.label} ton={etat.ton} point={actif?.etat === 'en_ligne'} />
        <View className="w-11" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <View className="items-center">
          <View
            className="h-24 w-24 items-center justify-center rounded-full bg-ok-soft dark:bg-ok-softdark"
            accessibilityElementsHidden
            importantForAccessibility="no">
            <Titre ton="ok">{(nom.trim()[0] ?? '?').toUpperCase()}</Titre>
          </View>
          <Titre className="mt-4 text-center" numberOfLines={2} accessibilityLabel={`Appel avec ${nom}`}>
            {nom}
          </Titre>
          {numero ? <Secondaire className="mt-1">{numero}</Secondaire> : null}
          <Legende className="mt-1">
            {actif?.essai ? 'Votre téléphone reçoit bien les appels' : 'Appel transmis par le réceptionniste'}
            {sonnerieSimulee() ? ' · démonstration' : ''}
          </Legende>
          {actif?.debut ? (
            <Mono className="mt-3 text-[22px]" accessibilityLabel={`Durée : ${dureeSecondes(ecoule)}`}>
              {dureeSecondes(ecoule)}
            </Mono>
          ) : null}
        </View>

        {actif && !actif.essai ? (
          <Carte className="mt-8 p-4">
            <Etiquette>Ce que le réceptionniste a noté</Etiquette>
            {d && aDesInfos(d, true) ? (
              <InfosAppelant donnees={d} avecIdentite className="mt-3" />
            ) : (
              <Secondaire className="mt-2">Aucune information notée avant le passage à l’équipe.</Secondaire>
            )}
            {appel?.resume ? (
              <>
                <Etiquette className="mt-5">Résumé</Etiquette>
                <Secondaire className="mt-1">{appel.resume}</Secondaire>
              </>
            ) : null}
          </Carte>
        ) : null}
        {actif?.essai ? (
          <Carte className="mt-8 p-4">
            <Secondaire>
              Voici l’écran d’un appel passé à l’équipe : qui appelle, ce que le réceptionniste a noté, et les gestes pour parler au client.
            </Secondaire>
          </Carte>
        ) : null}
      </ScrollView>

      <View className="flex-row items-start justify-evenly px-6 pt-2" style={{ paddingBottom: insets.bottom + 20 }}>
        <BoutonAppel
          icone={actif?.microCoupe ? 'micro.coupe' : 'micro'}
          libelle={actif?.microCoupe ? 'Micro coupé' : 'Micro'}
          accessibilityLabel={actif?.microCoupe ? 'Réactiver le micro' : 'Couper le micro'}
          actif={actif?.microCoupe}
          desactive={!enCours}
          onPress={agir(basculerMicro)}
        />
        <BoutonAppel
          icone="haut-parleur"
          libelle="Haut-parleur"
          accessibilityLabel={actif?.hautParleur ? 'Couper le haut-parleur' : 'Mettre le haut-parleur'}
          actif={actif?.hautParleur}
          desactive={!enCours}
          onPress={agir(basculerHautParleur)}
        />
        <BoutonAppel
          icone="raccrocher"
          libelle="Raccrocher"
          ton="danger"
          desactive={!enCours}
          onPress={agir(raccrocher)}
        />
      </View>
      <Avis texte={avis} flottant />
    </Ecran>
  );
}
