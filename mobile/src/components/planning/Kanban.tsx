/**
 * Vue « Par statut » : une colonne par statut actif, cartes compactes, et
 * une colonne « Livré » quand le jour en compte (même contenu que la liste).
 * La hauteur disponible est mesurée pour que chaque colonne défile seule.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Legende, PastilleStatut, useMargeBasse } from '@/components/ui';
import { STATUTS_ACTIFS } from '@/domain/statuts';
import type { Client, Intervention, Membre, Statut, Vehicule } from '@/domain/types';

import { CarteIntervention } from './CarteIntervention';

type Props = {
  interventions: Intervention[];
  clients: Client[];
  vehicules: Vehicule[];
  membres: Membre[];
  jour: Date;
  onOuvrir: (id: string) => void;
  onActions: (id: string) => void;
};

const LARGEUR_COLONNE = 272;

export function Kanban({ interventions, clients, vehicules, membres, jour, onOuvrir, onActions }: Props) {
  const margeBasse = useMargeBasse();
  const [hauteur, setHauteur] = useState(0);
  const statuts: Statut[] = interventions.some((i) => i.statut === 'livre') ? [...STATUTS_ACTIFS, 'livre'] : STATUTS_ACTIFS;
  const colonnes = statuts.map((statut) => ({ statut, items: interventions.filter((i) => i.statut === statut) }));

  return (
    <View className="flex-1 pt-3" onLayout={(e) => setHauteur(e.nativeEvent.layout.height)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {colonnes.map((c) => (
          <View
            key={c.statut}
            className="rounded-2xl bg-surface2 dark:bg-surface2-dark p-2"
            style={{ width: LARGEUR_COLONNE, height: hauteur > 0 ? hauteur - 12 : undefined }}>
            <View className="flex-row items-center justify-between px-2 py-2">
              <PastilleStatut statut={c.statut} />
              <Legende className="font-semibold" accessibilityLabel={`${c.items.length} interventions`}>
                {c.items.length}
              </Legende>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: margeBasse }}>
              {c.items.length === 0 ? (
                <Legende className="px-2 py-6 text-center">Rien ici</Legende>
              ) : (
                c.items.map((i) => (
                  <CarteIntervention
                    key={i.id}
                    compacte
                    intervention={i}
                    client={clients.find((x) => x.id === i.clientId)}
                    vehicule={vehicules.find((x) => x.id === i.vehiculeId)}
                    mecanicien={i.membreId ? (membres.find((m) => m.id === i.membreId) ?? null) : null}
                    jour={jour}
                    onPress={() => onOuvrir(i.id)}
                    onLongPress={() => onActions(i.id)}
                  />
                ))
              )}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
