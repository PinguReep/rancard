/**
 * Puces horizontales : « Tout l’atelier » puis un membre par puce.
 */

import { Pressable, ScrollView, Text } from 'react-native';

import { Avatar, impulsion } from '@/components/ui';
import type { Membre } from '@/domain/types';

type Props = {
  membres: Membre[];
  /** null = tout l’atelier */
  selection: string | null;
  onChanger: (membreId: string | null) => void;
};

function Puce({ actif, label, membre, onPress }: { actif: boolean; label: string; membre?: Membre; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={membre ? `Filtrer sur ${membre.prenom} ${membre.nom}` : 'Afficher tout l’atelier'}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      className={`min-h-[44px] flex-row items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 ${
        actif ? 'bg-accent-soft dark:bg-accent-softdark' : 'bg-surface2 dark:bg-surface2-dark'
      } active:opacity-80`}>
      {membre ? <Avatar membre={membre} taille={26} /> : null}
      <Text
        className={`text-[15px] font-semibold ${membre ? '' : 'pl-2'} ${
          actif ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function FiltreMembres({ membres, selection, onChanger }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      <Puce actif={selection === null} label="Tout l’atelier" onPress={() => onChanger(null)} />
      {membres.map((m) => (
        <Puce key={m.id} actif={selection === m.id} label={m.prenom} membre={m} onPress={() => onChanger(m.id)} />
      ))}
    </ScrollView>
  );
}
