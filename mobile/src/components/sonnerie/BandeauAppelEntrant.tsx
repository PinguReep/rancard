/**
 * Appel qui sonne, en démonstration : bandeau en haut de l'app à la place de
 * l'écran CallKit (que le simulateur ne peut pas montrer). Sur iPhone avec
 * Twilio, iOS affiche son propre écran d'appel, même verrouillé : ce bandeau
 * n'apparaît pas.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { impulsion } from '@/components/ui/haptique';
import { Etiquette, Legende, Texte } from '@/components/ui/texte';
import { decrocher, refuser, sonnerieSimulee, useTelephone } from '@/lib/sonnerie';

import { BoutonAppel } from './BoutonAppel';

export function BandeauAppelEntrant({ onErreur }: { onErreur: (message: string) => void }) {
  const insets = useSafeAreaInsets();
  const entrant = useTelephone((s) => s.entrant);
  const souffle = useSharedValue(1);

  useEffect(() => {
    if (!entrant) return;
    impulsion('moyen');
    souffle.value = withRepeat(withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(souffle);
  }, [entrant, souffle]);

  const halo = useAnimatedStyle(() => ({ opacity: souffle.value * 0.7, transform: [{ scale: 2.6 - souffle.value * 1.4 }] }));

  if (!entrant || !sonnerieSimulee()) return null;

  const agir = (f: () => Promise<void>) => () => {
    f().catch((e: unknown) => onErreur(e instanceof Error ? e.message : 'Action impossible pour le moment.'));
  };

  return (
    <Animated.View
      entering={SlideInUp.duration(260)}
      exiting={SlideOutUp.duration(200)}
      accessibilityRole="alert"
      accessibilityLabel={`${entrant.essai ? 'Essai de la sonnerie' : 'Appel transmis par le réceptionniste'} : ${entrant.nom}`}
      className="absolute left-3 right-3 z-50 rounded-3xl border border-ok bg-surface p-4 dark:border-ok-dark dark:bg-surface-dark"
      style={{ top: insets.top + 8, maxWidth: 560, alignSelf: 'center' }}>
      <View className="flex-row items-center gap-2.5">
        <View className="h-3 w-3 items-center justify-center">
          <Animated.View className="absolute h-3 w-3 rounded-full bg-ok dark:bg-ok-dark" style={halo} />
          <View className="h-2.5 w-2.5 rounded-full bg-ok dark:bg-ok-dark" />
        </View>
        <Etiquette ton="ok">{entrant.essai ? 'Appel d’essai' : 'Appel du réceptionniste'}</Etiquette>
        <Legende className="ml-auto">Démonstration</Legende>
      </View>
      <View className="mt-3 flex-row items-center gap-4">
        <View className="flex-1">
          <Texte className="font-semibold" numberOfLines={2}>
            {entrant.nom}
          </Texte>
          <Legende className="mt-0.5">
            {entrant.essai ? 'Votre téléphone reçoit bien les appels.' : 'Le premier qui décroche parle au client.'}
          </Legende>
        </View>
        <BoutonAppel icone="raccrocher" libelle="Refuser" ton="danger" taille={52} onPress={agir(refuser)} />
        <BoutonAppel icone="decrocher" libelle="Décrocher" ton="ok" taille={52} onPress={agir(decrocher)} />
      </View>
    </Animated.View>
  );
}
