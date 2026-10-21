/**
 * En-tête des onglets : nom du garage en petit, grand titre, cloche avec
 * compteur, avatar vers le profil. Même en-tête sur les quatre onglets.
 * Le compteur ne compte que les notifications dont la cible est visible.
 */

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { notificationsVisibles } from '@/components/notifications/visibles';
import { Avatar } from '@/components/ui/avatar';
import { BoutonRond } from '@/components/ui/bouton-rond';
import { impulsion } from '@/components/ui/haptique';
import { Legende, Titre } from '@/components/ui/texte';
import { useDonnees, useMembre, usePermissions } from '@/state/session';

export function Entete({ titre, sousTitre, droite }: { titre: string; sousTitre?: string; droite?: ReactNode }) {
  const router = useRouter();
  const membre = useMembre();
  const p = usePermissions();
  const garage = useDonnees((s) => s.garage);
  const nonLues = useDonnees((s) => notificationsVisibles(s, membre, p).filter((n) => !n.lue).length);

  return (
    <View className="px-4 pt-2 pb-3">
      <View className="flex-row items-center justify-between">
        <Legende numberOfLines={1} className="flex-1 uppercase tracking-[1.5px] text-[11px] font-semibold">
          {garage.nom}
        </Legende>
        <View className="flex-row items-center gap-2">
          {droite}
          <BoutonRond nom="cloche" label={nonLues ? `Notifications, ${nonLues} non lues` : 'Notifications'} onPress={() => router.push('/notifications')}>
            {nonLues > 0 ? (
              <View className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] items-center justify-center rounded-full bg-danger dark:bg-danger-dark px-1">
                <Text className="text-white text-[11px] font-bold">{nonLues > 9 ? '9+' : nonLues}</Text>
              </View>
            ) : null}
          </BoutonRond>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profil et réglages"
            hitSlop={4}
            onPress={() => {
              impulsion();
              router.push('/profil');
            }}
            className="active:opacity-70">
            <Avatar membre={membre} taille={40} />
          </Pressable>
        </View>
      </View>
      <Titre className="mt-2">{titre}</Titre>
      {sousTitre ? <Legende className="mt-1">{sousTitre}</Legende> : null}
    </View>
  );
}
