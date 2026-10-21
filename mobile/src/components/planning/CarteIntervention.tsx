/**
 * Carte d’une intervention dans le planning. Ce que le mécanicien cherche
 * d’abord : la plaque et le modèle, puis le travail, puis où en est la
 * voiture (piste d’avancement ou blocage). Appui = fiche, appui long =
 * actions rapides.
 */

import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Avatar, Carte, Icone, Legende, Plaque, PisteAvancement, Secondaire, Texte, impulsion } from '@/components/ui';
import { BLOCAGES, STATUTS, estBloquee } from '@/domain/statuts';
import type { Client, Intervention, Membre, Statut, Vehicule } from '@/domain/types';
import { heure } from '@/lib/format';
import { useTheme, type Palette } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  client?: Client;
  vehicule?: Vehicule;
  mecanicien?: Membre | null;
  /** Montrer l’avatar du mécanicien (vue « Tout l’atelier ») */
  avecMecanicien?: boolean;
  /** Jour affiché : l’heure seule si le créneau tombe ce jour, sinon le jour aussi */
  jour?: Date;
  onPress: () => void;
  onLongPress?: () => void;
  /** Contenu sous la carte (bouton « Confirmer » par exemple) */
  pied?: ReactNode;
};

/** Mot court de l’état, et sa couleur. */
function etat(statut: Statut, t: Palette): { mot: string; couleur: string } {
  switch (statut) {
    case 'a_valider':
      return { mot: 'À valider', couleur: t.warn };
    case 'planifie':
      return { mot: 'À recevoir', couleur: t.muted };
    case 'termine':
      return { mot: 'Prêt', couleur: t.ok };
    case 'livre':
    case 'annule':
      return { mot: STATUTS[statut].court, couleur: t.muted };
    default:
      return { mot: STATUTS[statut].court, couleur: t.accent };
  }
}

export function CarteIntervention({ intervention: i, client, vehicule, mecanicien, avecMecanicien, jour, onPress, onLongPress, pied }: Props) {
  const t = useTheme();
  const nomClient = client ? `${client.prenom} ${client.nom}` : 'Client inconnu';
  const modele = vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Véhicule inconnu';
  const memeJour = !jour || isSameDay(new Date(i.debut), jour);
  const quand = memeJour ? heure(i.debut) : `${format(new Date(i.debut), 'EEE', { locale: fr }).replace('.', '')} ${heure(i.debut)}`;
  const bloquee = estBloquee(i) && i.blocage ? i.blocage : null;
  const e = etat(i.statut, t);

  const label = [
    i.prioritaire ? 'Prioritaire' : null,
    vehicule ? `${modele}, plaque ${vehicule.plaque}` : modele,
    i.prestation,
    nomClient,
    bloquee ? BLOCAGES[bloquee].label : STATUTS[i.statut].label,
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
      <Carte className="px-4 pb-3.5 pt-4">
        <View className="flex-row items-center gap-2.5">
          {vehicule ? <Plaque plaque={vehicule.plaque} /> : null}
          <Secondaire ton="ink" className="flex-1 font-medium" numberOfLines={1}>
            {vehicule ? `${vehicule.marque} ${vehicule.modele}` : modele}
          </Secondaire>
          <Text maxFontSizeMultiplier={1.4} className="font-mono text-[14px] text-muted dark:text-muted-dark">
            {quand}
          </Text>
        </View>

        <View className="mt-3 flex-row items-center gap-2">
          {i.prioritaire ? <View accessibilityLabel="Prioritaire" className="h-2 w-2 rounded-full bg-danger dark:bg-danger-dark" /> : null}
          <Texte className="flex-1 text-[19px] font-bold leading-[24px] tracking-tight" numberOfLines={2}>
            {i.prestation}
          </Texte>
        </View>

        <View className="mt-1 flex-row items-center gap-2">
          <Legende className="flex-1 text-[14px]" numberOfLines={1}>
            {client ? nomClient : 'Client inconnu'}
            {i.memo ? ` · ${i.memo}` : ''}
          </Legende>
          {avecMecanicien ? (
            mecanicien ? (
              <Avatar membre={mecanicien} taille={24} />
            ) : (
              <View accessibilityLabel="Non attribué" className="h-6 w-6 rounded-full border border-dashed border-faint dark:border-faint-dark" />
            )
          ) : null}
        </View>

        <View className="mt-3.5 flex-row items-center gap-3">
          <PisteAvancement intervention={i} />
          {bloquee ? (
            <View className="flex-row items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-2.5 py-1 dark:border-warn-dark/40 dark:bg-warn-softdark">
              <Icone nom="pause" taille={11} couleur={t.warn} poids="bold" />
              <Text maxFontSizeMultiplier={1.4} className="text-[13px] font-semibold text-warn dark:text-warn-dark">
                {BLOCAGES[bloquee].label}
              </Text>
            </View>
          ) : (
            <Text maxFontSizeMultiplier={1.4} className="min-w-[64px] text-right text-[13px] font-semibold" style={{ color: e.couleur }}>
              {e.mot}
            </Text>
          )}
        </View>

        {pied ? <View className="mt-3.5 flex-row">{pied}</View> : null}
      </Carte>
    </Pressable>
  );
}
