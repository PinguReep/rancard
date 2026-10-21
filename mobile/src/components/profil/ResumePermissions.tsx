/**
 * Résumé des permissions d'un membre : une ligne par permission, coche ou
 * « Non ». Sert à l'invitation (aperçu) et fournit `resumeCourt` pour les
 * descriptions de poste.
 */

import { View } from 'react-native';

import { Groupe, Icone, Legende, Ligne, Texte } from '@/components/ui';
import { PERMISSIONS_LABELS, TOUTES_PERMISSIONS } from '@/domain/permissions';
import type { Permissions, Role } from '@/domain/types';
import { useTheme } from '@/theme/tokens';

const CLES = Object.keys(PERMISSIONS_LABELS) as (keyof Permissions)[];

const COURT: Record<keyof Permissions, string> = {
  voirTout: 'planning complet',
  voirPrix: 'montants',
  creer: 'création',
  appels: 'appels',
  activite: 'activité',
};

/** « Planning complet · montants · création » ou « Ses interventions seulement ». */
export function resumeCourt(p: Permissions): string {
  const actives = CLES.filter((k) => p[k]).map((k) => COURT[k]);
  if (!actives.length) return 'Ses interventions seulement';
  const texte = actives.join(' · ');
  return texte[0].toUpperCase() + texte.slice(1);
}

export function ResumePermissions({ role, permissions, note }: { role: Role; permissions: Permissions; note?: string }) {
  const t = useTheme();
  const effectives = role === 'gerant' ? TOUTES_PERMISSIONS : permissions;
  return (
    <Groupe titre="Permissions" note={note ?? (role === 'gerant' ? 'Un gérant a tous les droits.' : 'Modifiables ensuite depuis la fiche du membre.')}>
      {CLES.map((k, i) => (
        <Ligne key={k} derniere={i === CLES.length - 1}>
          <View className={`flex-1 ${effectives[k] ? '' : 'opacity-50'}`}>
            <Texte>{PERMISSIONS_LABELS[k].label}</Texte>
          </View>
          {effectives[k] ? <Icone nom="valider" taille={18} couleur={t.ok} poids="bold" /> : <Legende>Non</Legende>}
        </Ligne>
      ))}
    </Groupe>
  );
}
