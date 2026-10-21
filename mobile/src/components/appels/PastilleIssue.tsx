/**
 * Issue d'un appel traité par le réceptionniste : libellé et couleur.
 * La couleur porte un sens (pris = ok, à rappeler = attention, transféré = accent).
 */

import { Pastille } from '@/components/ui/pastille';
import type { IssueAppel } from '@/domain/types';

export const ISSUES: Record<IssueAppel, { label: string; ton: 'ok' | 'warn' | 'muted' | 'accent' }> = {
  rdv_pris: { label: 'Rendez-vous pris', ton: 'ok' },
  rappel_demande: { label: 'Rappel demandé', ton: 'warn' },
  renseignement: { label: 'Renseignement', ton: 'muted' },
  transfere: { label: 'Transféré', ton: 'accent' },
};

export function PastilleIssue({ issue }: { issue: IssueAppel }) {
  const i = ISSUES[issue];
  return <Pastille label={i.label} ton={i.ton} />;
}

export function PastilleHorsHoraires() {
  return <Pastille label="Hors horaires" ton="warn" />;
}
