/**
 * Activité : messages écrits par les clients sur leur page de suivi
 * (« Répondre au garage », 0020). Le nombre reçu sur la période, puis, s’il
 * y en a, ceux qui attendent encore une réponse (trois au plus, le plus
 * récent d’abord) : un appui ouvre l’intervention, où « Répondre à
 * Yassine » prépare la note visible client. Rien quand aucun client n’a écrit.
 */

import { View } from 'react-native';

import { Carte, Chiffre, Icone, Legende, Ligne, Secondaire, Texte } from '@/components/ui';
import { extraitMessage } from '@/domain/messages-clients';
import type { Client, Intervention, MessageClient, Vehicule } from '@/domain/types';
import { ilYA } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

/** Lignes « à répondre » montrées au plus : le reste se lit dans les notifications. */
const MAX_A_REPONDRE = 3;

type Props = {
  /** Messages reçus sur la période (fiches visibles du membre) */
  recus: number;
  /** Derniers messages sans réponse, un par fiche, du plus récent au plus ancien */
  aRepondre: MessageClient[];
  interventions: Intervention[];
  clients: Client[];
  vehicules: Vehicule[];
  onOuvrir: (interventionId: string) => void;
};

export function MessagesClients({ recus, aRepondre, interventions, clients, vehicules, onOuvrir }: Props) {
  const t = useTheme();
  if (recus === 0 && aRepondre.length === 0) return null;
  const lignes = aRepondre.slice(0, MAX_A_REPONDRE);

  return (
    <Carte className="overflow-hidden">
      <View className="px-5 pb-4 pt-5" accessible accessibilityLabel={`Messages des clients : ${recus}`}>
        <Legende className="text-[14px] font-medium">Messages des clients</Legende>
        <Chiffre className="mt-1 text-[44px] leading-[50px]" numberOfLines={1} adjustsFontSizeToFit>
          {String(recus)}
        </Chiffre>
      </View>
      {lignes.length ? (
        <View className="border-t border-line dark:border-line-dark">
          <Legende className="px-4 pb-1 pt-3 font-semibold">En attente de réponse</Legende>
          {lignes.map((m, idx) => {
            const i = interventions.find((x) => x.id === m.interventionId);
            const client = i ? clients.find((c) => c.id === i.clientId) : undefined;
            const vehicule = i ? vehicules.find((v) => v.id === i.vehiculeId) : undefined;
            const voiture = vehicule ? `${vehicule.marque} ${vehicule.modele}`.trim() : '';
            const qui = [client?.prenom, voiture].filter(Boolean).join(' · ') || 'Client';
            const extrait = extraitMessage(m.texte);
            const quand = ilYA(m.creeLe);
            return (
              <Ligne
                key={m.id}
                derniere={idx === lignes.length - 1}
                onPress={() => onOuvrir(m.interventionId)}
                accessibilityLabel={`${qui.replace(' · ', ', ')}, ${quand} : ${extrait}${/[.!?…]$/.test(extrait) ? '' : '.'} Ouvrir l’intervention pour répondre.`}>
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-soft dark:bg-accent-softdark">
                  <Icone nom="message" taille={18} couleur={t.accent} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-2">
                    <Texte numberOfLines={1} className="flex-1 font-semibold">
                      {qui}
                    </Texte>
                    <Legende>{quand}</Legende>
                  </View>
                  <Secondaire numberOfLines={2} className="mt-0.5">
                    {extrait}
                  </Secondaire>
                </View>
                <Icone nom="chevron.droite" taille={14} couleur={t.faint} />
              </Ligne>
            );
          })}
        </View>
      ) : null}
    </Carte>
  );
}
