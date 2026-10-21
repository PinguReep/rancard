/**
 * Choisir le mécanicien d’une intervention (ou retirer l’attribution).
 */

import { ScrollView, View } from 'react-native';

import { Avatar, Feuille, Groupe, Icone, Legende, Ligne, Texte } from '@/components/ui';
import { POSTES } from '@/domain/permissions';
import type { Membre } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  /** Membre actuellement attribué */
  actuel: string | null;
  membres: Membre[];
  onChoisir: (membreId: string | null) => void;
};

export function FeuilleAttribution({ ouverte, onFermer, actuel, membres, onChoisir }: Props) {
  const t = useTheme();
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Attribuer à">
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        <Groupe>
          {membres.map((m) => (
            <Ligne key={m.id} onPress={() => onChoisir(m.id)} accessibilityLabel={`Attribuer à ${m.prenom} ${m.nom}`}>
              <Avatar membre={m} taille={32} />
              <View className="flex-1">
                <Texte>
                  {m.prenom} {m.nom}
                </Texte>
                <Legende>{POSTES[m.poste].label}</Legende>
              </View>
              {actuel === m.id ? <Icone nom="valider" taille={18} couleur={t.accent} /> : null}
            </Ligne>
          ))}
          <Ligne derniere onPress={() => onChoisir(null)} accessibilityLabel="Retirer l’attribution">
            <View className="h-8 w-8 rounded-full border border-dashed border-faint dark:border-faint-dark" />
            <Texte className="flex-1">Non attribué</Texte>
            {actuel === null ? <Icone nom="valider" taille={18} couleur={t.accent} /> : null}
          </Ligne>
        </Groupe>
      </ScrollView>
    </Feuille>
  );
}
