/**
 * « Prévenir le client » : au passage en Véhicule prêt, aperçu du SMS et
 * choix d’envoyer ou non. Le statut change dans les deux cas. En cas de
 * refus (SMS désactivés, réseau), la feuille se ferme et l’écran affiche
 * l’avis d’erreur reçu par `onErreur`.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { Bouton, Feuille, Legende, Secondaire, Texte } from '@/components/ui';
import { impulsion } from '@/components/ui';
import { repo } from '@/data';
import type { Client, Intervention } from '@/domain/types';
import { formaterTelephone, gabaritSms } from '@/lib/format';
import { useDonnees, useMembre } from '@/state/session';

export type CibleSms = { intervention: Intervention; client?: Client };

type Props = {
  cible: CibleSms | null;
  onFermer: () => void;
  /** Appelé une fois le statut changé, avec ou sans SMS */
  onFait?: (avecSms: boolean) => void;
  /** Message court en cas d’échec du changement de statut ou de l’envoi */
  onErreur?: (message: string) => void;
};

export function FeuilleSmsPret({ cible, onFermer, onFait, onErreur }: Props) {
  const membre = useMembre();
  const garage = useDonnees((s) => s.garage);
  const [envoi, setEnvoi] = useState<'sms' | 'sans' | null>(null);

  const texte = cible ? gabaritSms(garage.texteSmsPret, { prenom: cible.client?.prenom ?? '', garage: garage.nom }) : '';
  const nom = cible?.client ? `${cible.client.prenom} ${cible.client.nom}` : 'le client';

  async function valider(avecSms: boolean) {
    if (!cible) return;
    setEnvoi(avecSms ? 'sms' : 'sans');
    try {
      await repo().changerStatut(cible.intervention.id, 'termine', membre.id);
      if (avecSms) await repo().envoyerSmsPret(cible.intervention.id, membre.id, texte);
      impulsion('succes');
      onFait?.(avecSms);
    } catch (e) {
      impulsion('erreur');
      onErreur?.((e as Error).message || 'Impossible de passer en véhicule prêt.');
    } finally {
      setEnvoi(null);
      onFermer();
    }
  }

  return (
    <Feuille ouverte={cible !== null} onFermer={onFermer} titre="Prévenir le client">
      {cible ? (
        <View>
          <Secondaire>
            Le véhicule passe en « Véhicule prêt ». Envoyer le SMS à {nom}
            {cible.client ? ` (${formaterTelephone(cible.client.telephone)})` : ''}
            {' ?'}
          </Secondaire>
          <View className="mt-3 rounded-2xl bg-surface2 dark:bg-surface2-dark p-4">
            <Texte>{texte}</Texte>
          </View>
          <Legende className="ml-1 mt-2">
            Expéditeur {garage.expediteurSms} · {texte.length} caractères
          </Legende>
          <View className="mt-4 gap-2">
            <Bouton
              onPress={() => valider(true)}
              chargement={envoi === 'sms'}
              desactive={envoi === 'sans'}
              accessibilityLabel="Envoyer le SMS et passer en véhicule prêt">
              Envoyer le SMS
            </Bouton>
            <Bouton
              variante="secondaire"
              onPress={() => valider(false)}
              chargement={envoi === 'sans'}
              desactive={envoi === 'sms'}
              accessibilityLabel="Passer en véhicule prêt sans envoyer de SMS">
              Sans SMS
            </Bouton>
          </View>
        </View>
      ) : null}
    </Feuille>
  );
}
