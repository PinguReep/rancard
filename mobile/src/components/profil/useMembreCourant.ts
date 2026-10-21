/**
 * Le membre connecté, dans sa version à jour. Le store de session garde
 * l'instantané pris à la connexion ; les écrans qui modifient le membre
 * (prénom, rôle) lisent ici pour voir le changement tout de suite.
 */

import type { Membre } from '@/domain/types';
import { useDonnees, useMembre } from '@/state/session';

export function useMembreCourant(): Membre {
  const m = useMembre();
  const vivant = useDonnees((s) => s.membres.find((x) => x.id === m.id));
  return vivant ?? m;
}
