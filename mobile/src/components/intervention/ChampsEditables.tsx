/**
 * Champs modifiés en place, enregistrés à la perte du focus : mémo interne
 * et montant estimé. Le parent les remonte avec `key` sur la valeur
 * stockée pour repartir de la donnée à jour après enregistrement.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { Champ, Etiquette, Groupe, Ligne, Texte } from '@/components/ui';
import { repo } from '@/data';
import type { Intervention } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { euros } from '@/lib/format';

type Props = { intervention: Intervention; onErreur?: (message: string) => void };

export function MemoInterne({ intervention: i, onErreur = () => {} }: Props) {
  const [memo, setMemo] = useState(i.memo ?? '');

  function enregistrer() {
    const propre = memo.trim();
    if (propre === (i.memo ?? '')) return;
    ecrire(repo().modifierIntervention(i.id, { memo: propre || undefined }), onErreur, 'Le mémo n’a pas pu être enregistré.');
  }

  return (
    <View>
      <Etiquette accessibilityRole="header" className="mb-2 ml-1">
        Mémo interne
      </Etiquette>
      <Champ
        type="multiligne"
        value={memo}
        onChangeText={setMemo}
        onBlur={enregistrer}
        placeholder="Un rappel pour l’équipe…"
        accessibilityLabel="Mémo interne, visible de l’équipe seulement"
      />
    </View>
  );
}

export function MontantEstime({ intervention: i, editable, onErreur = () => {} }: Props & { editable: boolean }) {
  const [valeur, setValeur] = useState(i.montantEstime != null ? String(i.montantEstime) : '');

  function enregistrer() {
    const n = Number(valeur.replace(/\s/g, '').replace(',', '.'));
    const nouveau = valeur.trim() === '' || Number.isNaN(n) ? undefined : Math.round(n);
    if (nouveau === i.montantEstime) return;
    ecrire(repo().modifierIntervention(i.id, { montantEstime: nouveau }), onErreur, 'Le montant n’a pas pu être enregistré.');
  }

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
      <Champ type="nombre" value={valeur} onChangeText={setValeur} onBlur={enregistrer} placeholder="0" accessibilityLabel="Montant estimé en euros TTC" />
    </View>
  );
}
