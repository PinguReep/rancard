/**
 * Le geste suivant : l’action principale pleine largeur, les autres calmes.
 * Les boutons viennent de `actionsPossibles`, jamais inventés ici.
 * L’annulation est rendue par la fiche, tout en bas, derrière confirmation.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { Bouton, Carte, Legende, Section, Texte } from '@/components/ui';
import { BLOCAGES, actionsPossibles, estBloquee, type Action } from '@/domain/statuts';
import type { Intervention } from '@/domain/types';

type Props = {
  intervention: Intervention;
  onAction: (a: Action) => Promise<void> | void;
};

const cle = (a: Action) => `${a.type}-${a.vers ?? 'aucun'}`;

export function ProchaineEtape({ intervention: i, onAction }: Props) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const actions = actionsPossibles(i);
  const principale = actions.find((a) => a.principal);
  const secondaires = actions.filter((a) => a.type === 'statut' && !a.principal && a.vers !== 'annule');
  const blocages = actions.filter((a) => a.type === 'blocage');
  const bloquee = estBloquee(i) && i.blocage;

  async function lancer(a: Action) {
    if (enCours) return;
    setEnCours(cle(a));
    try {
      await onAction(a);
    } finally {
      setEnCours(null);
    }
  }

  if (!principale && secondaires.length === 0 && blocages.length === 0) {
    return (
      <Section titre="Prochaine étape">
        <Carte className="p-4">
          <Texte>{i.statut === 'livre' ? 'Intervention close, véhicule livré au client.' : 'Aucune action possible pour l’instant.'}</Texte>
        </Carte>
      </Section>
    );
  }

  return (
    <Section titre="Prochaine étape">
      <View className="gap-2">
        {principale ? (
          <Bouton
            onPress={() => lancer(principale)}
            chargement={enCours === cle(principale)}
            desactive={enCours !== null && enCours !== cle(principale)}
            accessibilityLabel={`${principale.label}, action principale`}>
            {principale.label}
          </Bouton>
        ) : null}
        {secondaires.map((a) => (
          <Bouton
            key={cle(a)}
            variante="secondaire"
            onPress={() => lancer(a)}
            chargement={enCours === cle(a)}
            desactive={enCours !== null && enCours !== cle(a)}
            accessibilityLabel={a.label}>
            {a.label}
          </Bouton>
        ))}
        {blocages.length ? (
          <View className={bloquee ? 'gap-2' : 'flex-row flex-wrap gap-2 pt-1'}>
            {blocages.map((a) => (
              <Bouton
                key={cle(a)}
                compact={!bloquee}
                variante="secondaire"
                onPress={() => lancer(a)}
                chargement={enCours === cle(a)}
                desactive={enCours !== null && enCours !== cle(a)}
                accessibilityLabel={a.vers === null ? 'Débloquer l’intervention' : `Signaler : ${a.label}`}>
                {a.label}
              </Bouton>
            ))}
          </View>
        ) : null}
        {bloquee ? (
          <Legende className="ml-1 mt-1">
            Bloquée : {BLOCAGES[i.blocage!].label}. Le client lit « {BLOCAGES[i.blocage!].client} »
          </Legende>
        ) : null}
      </View>
    </Section>
  );
}
