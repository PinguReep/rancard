/**
 * Fil des répliques d'un appel : instant, qui parle (réceptionniste ou
 * appelant), ce qui a été dit. Avec un enregistrement, la réplique en
 * cours de lecture est mise en évidence et toucher une réplique place la
 * lecture à son instant ; sans enregistrement, le fil se lit seul.
 */

import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { Legende, Mono, Secondaire, Texte } from '@/components/ui';
import type { Replique } from '@/domain/types';

import { minutage, minutageParle } from './ecoute';

type Props = {
  repliques: readonly Replique[];
  /** Prénom de l'appelant, ou « Appelant » */
  nomAppelant: string;
  /** Réplique en cours de lecture (-1 : aucune) */
  courante?: number;
  /** Lecture à partir d'une réplique ; absent : le fil n'est pas lié à un enregistrement */
  onToucher?: (r: Replique) => void;
};

export function FilAppel({ repliques, nomAppelant, courante = -1, onToucher }: Props) {
  if (!repliques.length) {
    return <Secondaire className="px-1">Aucune réplique transcrite pour cet appel.</Secondaire>;
  }
  return (
    <View className="gap-1">
      {repliques.map((r, i) => (
        <LigneReplique
          key={`${i}-${r.t}`}
          replique={r}
          qui={r.role === 'agent' ? 'Réceptionniste' : nomAppelant}
          active={i === courante}
          onToucher={onToucher}
        />
      ))}
    </View>
  );
}

const LigneReplique = memo(function LigneReplique({
  replique,
  qui,
  active,
  onToucher,
}: {
  replique: Replique;
  qui: string;
  active: boolean;
  onToucher?: (r: Replique) => void;
}) {
  const fond = active ? 'bg-accent-soft dark:bg-accent-softdark' : '';
  const contenu = (
    <>
      <Mono ton={active ? 'accent' : 'muted'} className="w-11 pt-[2px] text-[13px]">
        {minutage(replique.t)}
      </Mono>
      <View className="flex-1">
        <Legende ton={replique.role === 'agent' ? 'accent' : 'ink'} className="font-semibold">
          {qui}
        </Legende>
        <Texte className="mt-0.5" selectable={!onToucher}>
          {replique.texte}
        </Texte>
      </View>
    </>
  );
  const etiquette = `${qui}, à ${minutageParle(replique.t)} : ${replique.texte}`;
  if (!onToucher) {
    return (
      <View accessible accessibilityLabel={etiquette} className="min-h-[44px] flex-row gap-3 rounded-xl px-3 py-2.5">
        {contenu}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquette}
      accessibilityHint="Écoute l’appel à partir de cette réplique."
      accessibilityState={{ selected: active }}
      onPress={() => onToucher(replique)}
      className={`min-h-[44px] flex-row gap-3 rounded-xl px-3 py-2.5 active:opacity-70 ${fond}`}>
      {contenu}
    </Pressable>
  );
});
