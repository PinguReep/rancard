/**
 * Un seul chemin pour changer le statut ou le blocage d’une intervention,
 * partagé par le planning (actions rapides) et la fiche. Le passage en
 * « Véhicule prêt » suit les options du garage : feuille de confirmation
 * du SMS, envoi automatique, ou simple changement si les SMS ne sont pas
 * activés.
 */

import { useState } from 'react';

import { impulsion } from '@/components/ui';
import { repo } from '@/data';
import type { Action } from '@/domain/statuts';
import type { Blocage, Intervention, Statut } from '@/domain/types';
import { gabaritSms } from '@/lib/format';
import { useDonnees, useMembre } from '@/state/session';

import { useAvis } from './Avis';
import type { CibleSms } from './FeuilleSmsPret';

export function usePassageStatut() {
  const membre = useMembre();
  const garage = useDonnees((s) => s.garage);
  const clients = useDonnees((s) => s.clients);
  const [cibleSms, setCibleSms] = useState<CibleSms | null>(null);
  const [avis, montrerAvis] = useAvis();

  async function passer(i: Intervention, vers: Statut): Promise<void> {
    if (vers !== 'termine') {
      await repo().changerStatut(i.id, vers, membre.id);
      impulsion('succes');
      return;
    }
    const client = clients.find((c) => c.id === i.clientId);
    if (!garage.options.sms) {
      await repo().changerStatut(i.id, 'termine', membre.id);
      impulsion('succes');
      montrerAvis('Véhicule prêt · SMS non activé pour ce garage');
      return;
    }
    if (garage.options.smsAutomatique) {
      const texte = gabaritSms(garage.texteSmsPret, { prenom: client?.prenom ?? '', garage: garage.nom });
      await repo().changerStatut(i.id, 'termine', membre.id);
      await repo().envoyerSmsPret(i.id, membre.id, texte);
      impulsion('succes');
      montrerAvis(client ? `SMS envoyé à ${client.prenom}` : 'SMS envoyé');
      return;
    }
    setCibleSms({ intervention: i, client });
  }

  async function bloquer(i: Intervention, vers: Blocage | null): Promise<void> {
    await repo().changerBlocage(i.id, vers, membre.id);
    impulsion('leger');
  }

  function executer(i: Intervention, a: Action): Promise<void> {
    return a.type === 'statut' ? passer(i, a.vers) : bloquer(i, a.vers);
  }

  return {
    passer,
    bloquer,
    executer,
    cibleSms,
    fermerSms: () => setCibleSms(null),
    avis,
    montrerAvis,
  };
}
