/**
 * Présence sur une fiche : signale celle que l'écran affiche (quand il a le
 * focus, retirée quand il le perd) et renvoie les collègues qui la
 * consultent au même moment.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { repo } from '@/data';
import type { Consultations } from '@/data/repo';
import type { Membre } from '@/domain/types';
import { useDonnees, useMembre } from '@/state/session';

export function useCollegues(fiche: string | null): Membre[] {
  const moi = useMembre();
  const membres = useDonnees((s) => s.membres);
  const [consultations, setConsultations] = useState<Consultations>({});

  useFocusEffect(
    useCallback(() => {
      if (!fiche) return undefined;
      repo().signalerConsultation(fiche);
      return () => {
        repo().signalerConsultation(null);
      };
    }, [fiche]),
  );

  useEffect(() => {
    const fin = repo().abonnerConsultations(setConsultations);
    return () => {
      fin();
    };
  }, []);

  const ids = fiche ? (consultations[fiche] ?? []) : [];
  return membres.filter((m) => m.id !== moi.id && ids.includes(m.id));
}
