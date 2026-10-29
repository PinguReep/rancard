/**
 * Confirmation d’une action irréversible (annuler, ignorer, se déconnecter,
 * réinitialiser) : une phrase, l’action, puis « Annuler ». En feuille plutôt
 * qu’en alerte système pour rester identique sur le web. L’appelant ferme
 * la feuille et affiche un avis en cas d’échec.
 */

import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Bouton } from './bouton';
import { Feuille } from './feuille';
import { Secondaire } from './texte';

type Props = {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  texte?: string;
  /** Libellé du bouton de confirmation */
  libelle: string;
  /** Libellé du bouton qui renonce (« Annuler » par défaut) */
  libelleRetour?: string;
  variante?: 'principal' | 'danger';
  onConfirmer: () => void | Promise<void>;
  chargement?: boolean;
  /** Inertie à l’ouverture (v2c) : `GARDE_MS` pour une confirmation ouverte par un geste */
  inerteMs?: number;
  /** Sous-titre (voiture, client) */
  legende?: string;
  children?: ReactNode;
};

export function FeuilleConfirmation({
  ouverte,
  onFermer,
  titre,
  texte,
  libelle,
  libelleRetour = 'Annuler',
  variante = 'danger',
  onConfirmer,
  chargement,
  inerteMs,
  legende,
  children,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const occupe = Boolean(chargement) || enCours;

  async function confirmer() {
    setEnCours(true);
    try {
      await onConfirmer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre} legende={legende} inerteMs={inerteMs}>
      {texte ? <Secondaire className="mb-5">{texte}</Secondaire> : null}
      {children}
      <View className="gap-2">
        <Bouton variante={variante} onPress={confirmer} chargement={occupe}>
          {libelle}
        </Bouton>
        <Bouton variante="secondaire" onPress={onFermer} desactive={occupe}>
          {libelleRetour}
        </Bouton>
      </View>
    </Feuille>
  );
}
