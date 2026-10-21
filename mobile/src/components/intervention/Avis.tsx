/**
 * Avis transitoire (« SMS envoyé », « SMS non activé pour ce garage ») :
 * une pastille sombre qui apparaît quelques secondes, jamais une erreur
 * bloquante. `flottant` la pose au-dessus de la barre d’onglets.
 */

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useMargeBasse } from '@/components/ui';

const DUREE_MS = 3200;

export function useAvis(): [string | null, (texte: string) => void] {
  const [avis, setAvis] = useState<string | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  function montrer(texte: string) {
    setAvis(texte);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAvis(null), DUREE_MS);
  }

  return [avis, montrer];
}

export function Avis({ texte, flottant }: { texte: string | null; flottant?: boolean }) {
  const margeBasse = useMargeBasse();
  if (!texte) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      className={flottant ? 'absolute left-4 right-4 items-center' : 'mt-3 items-center'}
      style={flottant ? { bottom: margeBasse } : undefined}>
      <View className="rounded-full bg-ink dark:bg-ink-dark px-4 py-2.5">
        <Text className="text-[14px] font-medium text-bg dark:text-bg-dark">{texte}</Text>
      </View>
    </Animated.View>
  );
}
