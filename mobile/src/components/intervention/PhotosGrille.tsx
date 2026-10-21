/**
 * Photos d’un commentaire : grille de trois colonnes, appui = plein écran.
 * Les vidéos sont signalées par une tuile sombre (pas de lecteur au MVP).
 */

import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icone } from '@/components/ui';
import type { Photo } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

export function PhotosGrille({ photos }: { photos: Photo[] }) {
  const [ouverte, setOuverte] = useState<Photo | null>(null);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  if (photos.length === 0) return null;

  return (
    <>
      <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
        {photos.map((p, idx) => (
          <Pressable
            key={p.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={p.video ? `Vidéo ${idx + 1} sur ${photos.length}` : `Photo ${idx + 1} sur ${photos.length}, ouvrir en plein écran`}
            onPress={() => setOuverte(p)}
            className="overflow-hidden rounded-xl bg-surface2 dark:bg-surface2-dark active:opacity-80"
            style={{ width: '31.5%', aspectRatio: 1 }}>
            {p.video ? (
              <View className="flex-1 items-center justify-center bg-ink dark:bg-surface2-dark">
                <Icone nom="camera" taille={22} couleur={t.blanc} />
                <Text className="mt-1 text-[11px] font-semibold text-white">Vidéo</Text>
              </View>
            ) : (
              <Image source={{ uri: p.uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} transition={120} />
            )}
          </Pressable>
        ))}
      </View>

      <Modal visible={ouverte !== null} transparent animationType="fade" onRequestClose={() => setOuverte(null)} statusBarTranslucent>
        <View className="flex-1 bg-black">
          {ouverte?.video ? (
            <View className="flex-1 items-center justify-center">
              <Icone nom="camera" taille={40} couleur={t.blanc} />
              <Text className="mt-3 text-[15px] text-white">La vidéo se lira depuis la page de suivi.</Text>
            </View>
          ) : ouverte ? (
            <Image source={{ uri: ouverte.uri }} contentFit="contain" style={{ flex: 1 }} accessibilityLabel="Photo en plein écran" />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={() => setOuverte(null)}
            className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-white/20 active:opacity-70"
            style={{ top: insets.top + 8 }}>
            <Icone nom="fermer" taille={20} couleur={t.blanc} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
