/**
 * Retirer une note de la page du client (P1). Une note publiée pour le
 * client par erreur se retire :
 * - en 1 appui, par « Retirer » dans l’avis « Publié pour Hugo » (8 s,
 *   sans confirmation, `Composer`) ;
 * - en 2 appuis pendant 10 minutes, par le lien « Retirer de la page
 *   client » sous la note (ou un appui long, ou l’action d’accessibilité),
 *   qui ouvre cette feuille.
 * La note reste dans le fil pour l’équipe ; le serveur (ou le dépôt de
 * démonstration) vérifie l’auteur, la fenêtre de 10 minutes et refuse
 * les phrases automatiques, avec les mêmes messages.
 */

import { View } from 'react-native';

import { FeuilleConfirmation, Texte, impulsion } from '@/components/ui';
import { repo } from '@/data';
import type { Commentaire } from '@/domain/types';
import { dePrenom } from '@/lib/format';
import { useMembre } from '@/state/session';

import type { ActionAvis } from './Avis';

export type OnAvis = (texte: string, action?: ActionAvis) => void;

/** « la page de Hugo », « la page d’Clara », « la page du client ». */
export function pageDe(prenomClient?: string | null): string {
  return prenomClient ? `la page ${dePrenom(prenomClient)}` : 'la page du client';
}

/**
 * Retire une note de la page du client, puis dit le résultat par un avis
 * (« Note retirée de la page de Hugo », ou le refus tel quel : « Trop tard
 * pour retirer cette note de la page du client. »). Même effet depuis la
 * feuille et depuis l’avis « Retirer ».
 */
export function useRetirerNote(prenomClient?: string | null, onAvis?: OnAvis) {
  const membre = useMembre();
  return async function retirer(commentaireId: string): Promise<boolean> {
    try {
      await repo().retirerNote(commentaireId, membre.id);
      impulsion('succes');
      onAvis?.(`Note retirée de ${pageDe(prenomClient)}`);
      return true;
    } catch (e) {
      onAvis?.((e as Error).message || 'La note n’a pas pu être retirée.');
      return false;
    }
  };
}

type Props = {
  /** Note visée ; gardée pendant la fermeture pour que la feuille ne se vide pas en glissant */
  note: Commentaire | null;
  ouverte: boolean;
  onFermer: () => void;
  prenomClient?: string | null;
  onAvis?: OnAvis;
};

export function FeuilleNote({ note, ouverte, onFermer, prenomClient, onAvis }: Props) {
  const retirer = useRetirerNote(prenomClient, onAvis);
  const qui = prenomClient || 'Le client';

  async function confirmer() {
    if (!note) return;
    await retirer(note.id);
    onFermer();
  }

  return (
    <FeuilleConfirmation
      ouverte={ouverte && note !== null}
      onFermer={onFermer}
      titre={`Retirer cette note de ${pageDe(prenomClient)} ?`}
      texte={`La note reste dans le fil, pour l’équipe. ${qui} ne la verra plus.`}
      libelle="Retirer de la page client"
      libelleRetour="Garder"
      variante="danger"
      onConfirmer={confirmer}>
      {note?.texte ? (
        <View className="mb-5 rounded-xl bg-surface2 px-3 py-2.5 dark:bg-surface2-dark">
          <Texte numberOfLines={4}>« {note.texte} »</Texte>
        </View>
      ) : null}
    </FeuilleConfirmation>
  );
}
