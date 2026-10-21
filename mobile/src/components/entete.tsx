/**
 * En-tête des onglets : la date en petit, le grand titre, puis à droite les
 * gestes du moment (« + »), la cloche avec son compteur et l'avatar vers le
 * profil. Le compteur ne compte que les notifications dont la cible est
 * visible.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { notificationsVisibles } from '@/components/notifications/visibles';
import { Avatar } from '@/components/ui/avatar';
import { BoutonRond } from '@/components/ui/bouton-rond';
import { impulsion } from '@/components/ui/haptique';
import { Legende, Titre } from '@/components/ui/texte';
import { useDonnees, useMembre, usePermissions } from '@/state/session';
import { halo, useTheme } from '@/theme/tokens';

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Entete({ titre, droite, sansDate }: { titre: string; droite?: ReactNode; sansDate?: boolean }) {
  const router = useRouter();
  const t = useTheme();
  const membre = useMembre();
  const p = usePermissions();
  const nonLues = useDonnees((s) => notificationsVisibles(s, membre, p).filter((n) => !n.lue).length);

  return (
    <View className="flex-row items-end justify-between px-5 pb-4 pt-3">
      <View className="flex-1">
        {sansDate ? null : <Legende className="text-[14px] font-medium">{majuscule(format(new Date(), 'EEEE d MMMM', { locale: fr }))}</Legende>}
        <Titre className="mt-0.5 text-[34px] leading-[40px]">{titre}</Titre>
      </View>
      <View className="mb-1 flex-row items-center gap-2.5">
        {droite}
        <BoutonRond nom="cloche" label={nonLues ? `Notifications, ${nonLues} non lues` : 'Notifications'} onPress={() => router.push('/notifications')}>
          {nonLues > 0 ? (
            <View
              className="absolute -right-1 -top-1 h-[19px] min-w-[19px] items-center justify-center rounded-full bg-danger px-1 dark:bg-danger-dark"
              style={t.scheme === 'dark' ? halo(t.danger, 8, 0.8) : undefined}>
              <Text className="text-[11px] font-bold text-white">{nonLues > 9 ? '9+' : nonLues}</Text>
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
          <Avatar membre={membre} taille={44} />
        </Pressable>
      </View>
    </View>
  );
}
