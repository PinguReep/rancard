/**
 * Appel en cours de traitement par le réceptionniste : carte verte, point
 * qui pulse, durée qui défile, résumé en direct. Deux gestes : écouter
 * (bientôt) et prendre l'appel depuis son propre téléphone.
 */

import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Bouton } from '@/components/ui/bouton';
import { impulsion } from '@/components/ui/haptique';
import { Icone } from '@/components/ui/icone';
import { Etiquette, Legende, Secondaire, Texte } from '@/components/ui/texte';
import type { Appel } from '@/domain/types';
import { dureeSecondes, formaterTelephone, telHref } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

const secondesDepuis = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

export function CarteAppelEnCours({ appel }: { appel: Appel }) {
  const t = useTheme();

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

  // Durée écoulée depuis le début de l'appel.
  const [ecoule, setEcoule] = useState(() => secondesDepuis(appel.debut));
  useEffect(() => {
    const id = setInterval(() => setEcoule(secondesDepuis(appel.debut)), 1000);
    return () => clearInterval(id);
  }, [appel.debut]);

  const prendre = () => {
    impulsion('moyen');
    Linking.openURL(telHref(appel.numero)).catch(() => {
      // pas d'application téléphone (web, simulateur) : rien à faire
    });
  };

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      accessibilityLabel={`Appel en cours, ${appel.appelant ?? formaterTelephone(appel.numero)}, ${dureeSecondes(ecoule)}`}
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
        {appel.appelant ?? formaterTelephone(appel.numero)}
      </Texte>
      {appel.appelant ? <Legende>{formaterTelephone(appel.numero)}</Legende> : null}

      <Etiquette className="mt-4">Résumé en direct</Etiquette>
      <Secondaire className="mt-1">{appel.resume}</Secondaire>

      <View className="mt-5 gap-1.5">
        <Bouton variante="secondaire" desactive>
          Écouter en direct
        </Bouton>
        <Legende className="mb-2 text-center">Bientôt disponible</Legende>
        <Bouton onPress={prendre} icone={<Icone nom="telephone" taille={18} couleur={t.blanc} />}>
          Prendre l’appel
        </Bouton>
        <Legende className="text-center">Le transfert se fait depuis votre téléphone.</Legende>
      </View>
    </Animated.View>
  );
}
