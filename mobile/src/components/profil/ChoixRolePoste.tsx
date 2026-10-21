/**
 * Groupes de choix du rôle et du poste, partagés entre la fiche membre et
 * l'invitation. Le poste décrit ses permissions préréglées.
 */

import { Groupe } from '@/components/ui';
import { POSTES, ROLES } from '@/domain/permissions';
import type { Poste, Role } from '@/domain/types';

import { LigneChoix } from './LigneChoix';
import { resumeCourt } from './ResumePermissions';

const ROLES_ORDRE = Object.keys(ROLES) as Role[];
const POSTES_ORDRE = Object.keys(POSTES) as Poste[];

export function GroupeRole({
  valeur,
  onChange,
  verrouilles = [],
  note,
}: {
  valeur: Role;
  onChange: (r: Role) => void;
  /** Rôles qu'on ne peut pas choisir (ex. rétrograder le dernier gérant) */
  verrouilles?: Role[];
  note?: string;
}) {
  return (
    <Groupe titre="Rôle" note={note}>
      {ROLES_ORDRE.map((r, i) => (
        <LigneChoix
          key={r}
          titre={ROLES[r].label}
          description={ROLES[r].description}
          choisi={valeur === r}
          desactive={valeur !== r && verrouilles.includes(r)}
          onPress={() => onChange(r)}
          derniere={i === ROLES_ORDRE.length - 1}
        />
      ))}
    </Groupe>
  );
}

export function GroupePoste({ valeur, onChange, note }: { valeur: Poste; onChange: (p: Poste) => void; note?: string }) {
  return (
    <Groupe titre="Poste" note={note}>
      {POSTES_ORDRE.map((p, i) => (
        <LigneChoix
          key={p}
          titre={POSTES[p].label}
          description={resumeCourt(POSTES[p].permissions)}
          choisi={valeur === p}
          onPress={() => onChange(p)}
          derniere={i === POSTES_ORDRE.length - 1}
        />
      ))}
    </Groupe>
  );
}
