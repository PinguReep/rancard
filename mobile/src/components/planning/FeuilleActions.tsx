/**
 * Actions rapides à l’appui long sur une carte : le geste suivant en tête,
 * les blocages, puis « Attribuer à… ». L’annulation reste sur la fiche,
 * derrière une confirmation.
 */

import { ScrollView, View } from 'react-native';

import { Feuille, Groupe, Icone, Legende, Ligne, Texte } from '@/components/ui';
import { actionsPossibles, type Action } from '@/domain/statuts';
import type { Client, Intervention } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention | null;
  client?: Client;
  peutAttribuer: boolean;
  onFermer: () => void;
  onAction: (a: Action) => void;
  onAttribuer: () => void;
};

export function FeuilleActions({ intervention: i, client, peutAttribuer, onFermer, onAction, onAttribuer }: Props) {
  const t = useTheme();
  const actions = i ? actionsPossibles(i).filter((a) => !(a.type === 'statut' && a.vers === 'annule')) : [];
  const total = actions.length + (peutAttribuer ? 1 : 0);

  return (
    <Feuille ouverte={i !== null} onFermer={onFermer} titre={client ? `${client.prenom} ${client.nom}` : 'Actions'}>
      {i ? (
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          <Legende className="-mt-2 mb-3">{i.prestation}</Legende>
          {total === 0 ? (
            <View className="mb-4">
              <Texte>Intervention close, aucune action possible.</Texte>
            </View>
          ) : (
            <Groupe>
              {actions.map((a, idx) => (
                <Ligne
                  key={`${a.type}-${a.vers ?? 'aucun'}`}
                  derniere={idx === actions.length - 1 && !peutAttribuer}
                  onPress={() => onAction(a)}
                  accessibilityLabel={a.label}>
                  <Texte ton={a.principal ? 'accent' : 'ink'} className={`flex-1 ${a.principal ? 'font-semibold' : ''}`}>
                    {a.label}
                  </Texte>
                  {a.principal ? <Icone nom="chevron.droite" taille={16} couleur={t.accent} /> : null}
                </Ligne>
              ))}
              {peutAttribuer ? (
                <Ligne derniere onPress={onAttribuer} accessibilityLabel="Attribuer à un mécanicien">
                  <Texte className="flex-1">Attribuer à…</Texte>
                  <Icone nom="chevron.droite" taille={16} couleur={t.faint} />
                </Ligne>
              ) : null}
            </Groupe>
          )}
        </ScrollView>
      ) : null}
    </Feuille>
  );
}
