/**
 * Carte d’une intervention dans le planning : l’essentiel en un regard,
 * appui = fiche, appui long = actions rapides. `compacte` pour le kanban.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { isSameDay } from 'date-fns';
import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Avatar, Carte, Legende, Mono, PastilleBlocage, PastilleOrigine, PastilleStatut, Secondaire, Texte, impulsion } from '@/components/ui';
import { STATUTS, estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Membre, Vehicule } from '@/domain/types';
import { heure } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  mecanicien?: Membre | null;
  /** Jour affiché : l’heure seule si le créneau tombe ce jour, sinon la date */
  jour?: Date;
  compacte?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Contenu sous la carte (bouton « Confirmer » par exemple) */
  pied?: ReactNode;
};

export function CarteIntervention({ intervention: i, client, vehicule, mecanicien, jour, compacte, onPress, onLongPress, pied }: Props) {
  const t = useTheme();
  const nomClient = client ? `${client.prenom} ${client.nom}` : 'Client inconnu';
  const nomVehicule = vehicule ? `${vehicule.marque} ${vehicule.modele}` : '';
  const memeJour = !jour || isSameDay(new Date(i.debut), jour);
  const bloquee = estBloquee(i) && i.blocage;

  const label = [
    i.prioritaire ? 'Prioritaire' : null,
    nomClient,
    nomVehicule,
    i.prestation,
    STATUTS[i.statut].label,
    mecanicien ? `attribuée à ${mecanicien.prenom}` : 'non attribuée',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      // Sur le web, un bouton ne peut pas en contenir un autre (pied « Confirmer »).
      accessibilityRole={Platform.OS === 'web' && pied ? undefined : 'button'}
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Appui long pour les actions rapides' : undefined}
      onPress={() => {
        impulsion('leger');
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              impulsion('moyen');
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      className="active:opacity-80">
      <Carte className={compacte ? 'p-3' : 'p-4'}>
        <View className="flex-row items-start gap-3">
          <View className={compacte ? 'w-11' : 'w-12'}>
            {memeJour ? (
              <Texte className="font-semibold">{heure(i.debut)}</Texte>
            ) : (
              <>
                <Legende className="font-semibold">{format(new Date(i.debut), 'EEE d', { locale: fr }).replace('.', '')}</Legende>
                <Legende>{heure(i.debut)}</Legende>
              </>
            )}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              {i.prioritaire ? <View accessibilityLabel="Prioritaire" className="h-2 w-2 rounded-full bg-danger dark:bg-danger-dark" /> : null}
              <Texte className="flex-1 font-semibold" numberOfLines={1}>
                {nomClient}
              </Texte>
            </View>
            {vehicule ? (
              <View className="mt-0.5 flex-row items-center gap-2">
                <Secondaire className="shrink" numberOfLines={1}>
                  {nomVehicule}
                </Secondaire>
                <Mono ton="muted">{vehicule.plaque}</Mono>
              </View>
            ) : null}
            <Texte className="mt-1" numberOfLines={compacte ? 1 : 2}>
              {i.prestation}
            </Texte>
          </View>
          {mecanicien ? (
            <Avatar membre={mecanicien} taille={compacte ? 26 : 32} />
          ) : (
            <Legende className="text-right" accessibilityLabel="Non attribué">
              Non attribué
            </Legende>
          )}
        </View>
        <View className={`${compacte ? 'mt-2' : 'mt-3'} flex-row flex-wrap items-center gap-1.5`}>
          <PastilleStatut statut={i.statut} court />
          {bloquee ? <PastilleBlocage blocage={i.blocage!} /> : null}
          {!compacte ? <PastilleOrigine origine={i.origine} /> : null}
        </View>
        {!compacte && i.memo ? (
          <Legende className="mt-2" numberOfLines={1}>
            {i.memo}
          </Legende>
        ) : null}
        {pied ? <View className="mt-3 flex-row">{pied}</View> : null}
      </Carte>
    </Pressable>
  );
}
