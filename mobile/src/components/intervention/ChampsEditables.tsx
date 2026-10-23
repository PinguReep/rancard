/**
 * Champs modifiés en place, enregistrés à la perte du focus : mémo interne
 * et montant estimé. Chaque saisie est remontée avec `key` sur la valeur
 * stockée pour repartir de la donnée à jour après enregistrement ; le retour
 * « Enregistré. » vit dans le composant englobant pour survivre à ce
 * remontage.
 */

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Champ, Etiquette, Groupe, Ligne, Texte, impulsion } from '@/components/ui';
import { repo } from '@/data';
import type { Intervention } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { euros } from '@/lib/format';

type Props = { intervention: Intervention; onErreur?: (message: string) => void };

type PropsSaisie = Required<Props> & {
  /** Texte d’aide sous le champ (« Enregistré. » juste après un enregistrement réussi) */
  aide?: string;
  onEnregistre: () => void;
};

/** « Enregistré. » sous le champ pendant un court instant, comme sur la fiche client. */
function useRetourEnregistre(): [boolean, () => void] {
  const [visible, setVisible] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(minuteur.current);
    };
  }, []);

  function signaler() {
    impulsion('leger');
    setVisible(true);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setVisible(false), 1800);
  }

  return [visible, signaler];
}

function SaisieMemo({ intervention: i, onErreur, aide, onEnregistre }: PropsSaisie) {
  const [memo, setMemo] = useState(i.memo ?? '');

  function enregistrer() {
    const propre = memo.trim();
    if (propre === (i.memo ?? '')) return;
    ecrire(repo().modifierIntervention(i.id, { memo: propre || undefined }).then(onEnregistre), onErreur, 'Le mémo n’a pas pu être enregistré.');
  }

  return (
    <Champ
      type="multiligne"
      value={memo}
      onChangeText={setMemo}
      onBlur={enregistrer}
      placeholder="Un rappel pour l’équipe…"
      accessibilityLabel="Mémo interne, visible de l’équipe seulement"
      aide={aide}
    />
  );
}

export function MemoInterne({ intervention: i, onErreur = () => {} }: Props) {
  const [enregistre, signalerEnregistre] = useRetourEnregistre();

  return (
    <View>
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Mémo interne
      </Etiquette>
      <SaisieMemo
        key={i.memo ?? ''}
        intervention={i}
        onErreur={onErreur}
        aide={enregistre ? 'Enregistré.' : undefined}
        onEnregistre={signalerEnregistre}
      />
    </View>
  );
}

function SaisieMontant({ intervention: i, onErreur, aide, onEnregistre }: PropsSaisie) {
  const [valeur, setValeur] = useState(i.montantEstime != null ? String(i.montantEstime) : '');

  function enregistrer() {
    const n = Number(valeur.replace(/\s/g, '').replace(',', '.'));
    const nouveau = valeur.trim() === '' || Number.isNaN(n) ? undefined : Math.round(n);
    if (nouveau === i.montantEstime) return;
    ecrire(repo().modifierIntervention(i.id, { montantEstime: nouveau }).then(onEnregistre), onErreur, 'Le montant n’a pas pu être enregistré.');
  }

  return (
    <Champ
      type="nombre"
      value={valeur}
      onChangeText={setValeur}
      onBlur={enregistrer}
      placeholder="0"
      accessibilityLabel="Montant estimé en euros TTC"
      aide={aide}
    />
  );
}

export function MontantEstime({ intervention: i, editable, onErreur = () => {} }: Props & { editable: boolean }) {
  const [enregistre, signalerEnregistre] = useRetourEnregistre();

  if (!editable) {
    return (
      <Groupe titre="Montant estimé" className="mb-4">
        <Ligne derniere>
          <Texte className="flex-1">{i.montantEstime != null ? euros(i.montantEstime) : 'Non renseigné'}</Texte>
        </Ligne>
      </Groupe>
    );
  }

  return (
    <View>
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Montant estimé (€ TTC)
      </Etiquette>
      <SaisieMontant
        key={i.montantEstime != null ? String(i.montantEstime) : ''}
        intervention={i}
        onErreur={onErreur}
        aide={enregistre ? 'Enregistré.' : undefined}
        onEnregistre={signalerEnregistre}
      />
    </View>
  );
}
