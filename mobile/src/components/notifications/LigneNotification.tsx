/**
 * Ligne d'une notification : icône par type, titre, détail, ancienneté,
 * point accent si non lue.
 *
 * Détail (v2c) : une notification produite par un événement de l’équipe
 * (`evenementId` : attribution, pièce, accord, rappel, retour depuis
 * « Prêt »), écrite par le serveur ou par la démo, porte déjà des dates
 * absolues (« mar. 27 oct. 11:00 », « par Elias à 10:40 ») : elle
 * s’affiche telle quelle. Les plus anciennes (site, réceptionniste) ont été
 * écrites avec des mots relatifs (« demain 8h30 ») : `detailLisible` les
 * relit au jour de l’affichage, « demain » ne désigne jamais le mauvais jour.
 */

import { View } from 'react-native';

import { Icone, Legende, Ligne, Secondaire, Texte, type NomIcone } from '@/components/ui';
import type { Notification, TypeNotification } from '@/domain/types';
import { detailLisible, ilYA } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

export const ICONE_PAR_TYPE: Record<TypeNotification, NomIcone> = {
  rdv_site: 'planning',
  ia: 'appels',
  accord: 'valider',
  piece: 'colis',
  equipe: 'clients',
  message_client: 'message',
};

/** Détail affiché : tel quel s’il vient d’un événement (dates absolues), relu sinon. */
export function detailAffiche(n: Pick<Notification, 'detail' | 'creeLe' | 'evenementId'>, maintenant: Date = new Date()): string {
  return n.evenementId ? n.detail : detailLisible(n.detail, n.creeLe, maintenant);
}

/** Lecteur d’écran : le point médian se lit mal, il devient une pause. */
const aDire = (texte: string) => texte.replace(/\s+·\s+/g, ', ');

type Props = { notification: Notification; onPress: () => void; derniere?: boolean };

export function LigneNotification({ notification: n, onPress, derniere }: Props) {
  const t = useTheme();
  const detail = detailAffiche(n);
  const anciennete = ilYA(n.creeLe);
  return (
    <Ligne
      onPress={onPress}
      derniere={derniere}
      accessibilityLabel={`${n.lue ? '' : 'Non lue. '}${n.titre}.${detail ? ` ${aDire(detail)}.` : ''} ${anciennete}`}>
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${
          n.lue ? 'bg-surface2 dark:bg-surface2-dark' : 'bg-accent-soft dark:bg-accent-softdark'
        }`}>
        {/* Type ajouté côté serveur après ce build : la cloche plutôt qu’une icône absente. */}
        <Icone nom={ICONE_PAR_TYPE[n.type] ?? 'cloche'} taille={18} couleur={n.lue ? t.muted : t.accent} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-2">
          {/* Deux lignes : « Attente pièce : Volkswagen Polo » ne se coupe pas sur le nom de la voiture. */}
          <Texte numberOfLines={2} className={`flex-1 ${n.lue ? '' : 'font-semibold'}`}>
            {n.titre}
          </Texte>
          <Legende>{anciennete}</Legende>
        </View>
        {detail ? (
          <Secondaire numberOfLines={2} className="mt-0.5">
            {detail}
          </Secondaire>
        ) : null}
      </View>
      {!n.lue ? <View accessibilityLabel="Non lue" className="h-2.5 w-2.5 rounded-full bg-accent dark:bg-accent-dark" /> : null}
    </Ligne>
  );
}
