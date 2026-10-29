/**
 * Historique d'un appel passé à l'équipe (0016) : qui l'a pris et combien de
 * temps, ou personne n'a décroché (le client attend un rappel).
 */

import { Pastille } from '@/components/ui/pastille';
import type { Appel } from '@/domain/types';
import { dureeSecondes } from '@/lib/format';
import { useDonnees } from '@/state/session';

export function PastilleTransfert({ appel }: { appel: Appel }) {
  const membres = useDonnees((s) => s.membres);
  const t = appel.transfert;
  if (!t) return null;
  if (t.etat === 'sans_reponse') return <Pastille label="Personne n’a décroché" ton="warn" />;
  if ((t.etat === 'termine' || t.etat === 'en_ligne') && t.prisPar) {
    const prenom = membres.find((m) => m.id === t.prisPar)?.prenom ?? 'l’équipe';
    const duree = t.dureeSec ? ` · ${dureeSecondes(t.dureeSec)}` : '';
    return <Pastille label={`Pris par ${prenom}${duree}`} ton="accent" />;
  }
  return null;
}
