/**
 * Appel en cours avec le réceptionniste : carte verte, point qui pulse,
 * durée qui défile, et la fiche qui se remplit en direct à mesure que
 * l'appelant confirme ses informations (outil update_call_context de
 * l'agent, via Realtime). L'appelant est en ligne avec le réceptionniste ;
 * le rappel et la fiche à valider viennent à la fin de l'appel. Quand le
 * réceptionniste passe l'appel à l'équipe (0016), la carte le suit jusqu'au
 * décroché (`BlocTransfert`). Texte affiché tel quel : il est dicté par
 * l'appelant.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Etiquette, Legende, Secondaire, Texte } from '@/components/ui/texte';
import { LIBELLES_ETAPE } from '@/domain/appels';
import type { Appel } from '@/domain/types';
import { dureeSecondes, formaterTelephone, ilYA } from '@/lib/format';

import { BlocTransfert } from './BlocTransfert';
import { donneesAppelant } from './donnees-appelant';
import { InfosAppelant, aDesInfos } from './InfosAppelant';

const secondesDepuis = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

export function CarteAppelEnCours({ appel }: { appel: Appel }) {
  // Halo qui respire autour du point vert.
  const souffle = useSharedValue(1);
  useEffect(() => {
    souffle.value = withRepeat(withTiming(0.2, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(souffle);
  }, [souffle]);
  const halo = useAnimatedStyle(() => ({
    opacity: souffle.value * 0.6,
    transform: [{ scale: 2.4 - souffle.value * 1.2 }],
  }));

  // Durée écoulée depuis le début de l'appel (rafraîchit aussi « mis à jour il y a… »).
  const [ecoule, setEcoule] = useState(() => secondesDepuis(appel.debut));
  useEffect(() => {
    const id = setInterval(() => setEcoule(secondesDepuis(appel.debut)), 1000);
    return () => clearInterval(id);
  }, [appel.debut]);

  const d = donneesAppelant(appel);
  const numero = appel.numero ? formaterTelephone(appel.numero) : '';
  const titre = appel.appelant || d.identite?.texte || numero || 'Numéro masqué';
  const sousTitre = titre !== numero ? numero : '';
  const etape = appel.contexte?.etape;
  const rien = !aDesInfos(d);

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      accessibilityLabel={`Appel en cours, ${titre}, ${dureeSecondes(ecoule)}`}
      className="mx-4 mb-6 rounded-2xl border border-ok bg-ok-soft p-4 dark:border-ok-dark dark:bg-ok-softdark">
      <View className="flex-row items-center gap-2.5">
        <View className="h-3 w-3 items-center justify-center">
          <Animated.View className="absolute h-3 w-3 rounded-full bg-ok dark:bg-ok-dark" style={halo} />
          <View className="h-2.5 w-2.5 rounded-full bg-ok dark:bg-ok-dark" />
        </View>
        <Etiquette ton="ok">Appel en cours</Etiquette>
        <Legende ton="ok" className="ml-auto font-mono">
          {dureeSecondes(ecoule)}
        </Legende>
      </View>

      <Texte className="mt-3 font-semibold" numberOfLines={1}>
        {titre}
      </Texte>
      {sousTitre ? <Legende>{sousTitre}</Legende> : null}
      {etape ? (
        <Legende ton="ok" className="mt-1">
          {`Étape : ${LIBELLES_ETAPE[etape]}`}
        </Legende>
      ) : null}
      <BlocTransfert appel={appel} />

      <Etiquette className="mt-4">Fiche en direct</Etiquette>
      {rien ? (
        <Secondaire className="mt-1">
          Le réceptionniste est en ligne. Les informations confirmées par l’appelant s’affichent ici au fil de l’appel.
        </Secondaire>
      ) : (
        <InfosAppelant donnees={d} className="mt-2" />
      )}
      {appel.contexte?.majLe ? (
        <Legende className="mt-4">{`Mis à jour ${ilYA(appel.contexte.majLe)}`}</Legende>
      ) : null}
    </Animated.View>
  );
}
