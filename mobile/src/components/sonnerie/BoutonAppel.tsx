/**
 * Grand bouton rond des écrans d'appel (64 pt, libellé dessous) : décrocher,
 * raccrocher, micro, haut-parleur. « actif » remplit le bouton (micro coupé,
 * haut-parleur allumé), comme sur l'écran d'appel d'iOS.
 */

import { Pressable, View } from 'react-native';

import { impulsion } from '@/components/ui/haptique';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Legende } from '@/components/ui/texte';
import { useTheme } from '@/theme/tokens';

type Props = {
  icone: NomIcone;
  libelle: string;
  /** Libellé lu par VoiceOver, s'il diffère du libellé affiché */
  accessibilityLabel?: string;
  onPress: () => void;
  ton?: 'neutre' | 'ok' | 'danger';
  actif?: boolean;
  desactive?: boolean;
  taille?: number;
};

export function BoutonAppel({ icone, libelle, accessibilityLabel, onPress, ton = 'neutre', actif, desactive, taille = 64 }: Props) {
  const t = useTheme();
  const fond =
    ton === 'ok'
      ? 'bg-ok dark:bg-ok-dark'
      : ton === 'danger'
        ? 'bg-danger dark:bg-danger-dark'
        : actif
          ? 'bg-ink dark:bg-ink-dark'
          : 'bg-surface2 dark:bg-surface2-dark border border-line dark:border-line-dark';
  const couleur = ton !== 'neutre' ? t.blanc : actif ? t.bg : t.ink;
  return (
    <View className={`items-center gap-2 ${desactive ? 'opacity-40' : ''}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? libelle}
        accessibilityState={{ disabled: desactive, selected: ton === 'neutre' ? Boolean(actif) : undefined }}
        disabled={desactive}
        onPress={() => {
          impulsion(ton === 'neutre' ? 'leger' : 'moyen');
          onPress();
        }}
        className={`items-center justify-center rounded-full active:opacity-70 ${fond}`}
        style={{ width: taille, height: taille }}>
        <Icone nom={icone} taille={Math.round(taille * 0.38)} couleur={couleur} poids="semibold" />
      </Pressable>
      <Legende ton={ton === 'danger' ? 'danger' : 'muted'}>{libelle}</Legende>
    </View>
  );
}
