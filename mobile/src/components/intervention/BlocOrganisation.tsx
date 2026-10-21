/**
 * Créneau, restitution prévue, mécanicien (réattribuable) et priorité.
 */

import { Switch, View } from 'react-native';

import { Avatar, Groupe, Icone, Legende, Ligne, Texte, impulsion } from '@/components/ui';
import { repo } from '@/data';
import type { Intervention, Membre } from '@/domain/types';
import { ecrire } from '@/lib/ecrire';
import { duree, quand } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

type Props = {
  intervention: Intervention;
  mecanicien: Membre | null;
  peutAttribuer: boolean;
  onAttribuer: () => void;
  /** Message court si l’enregistrement de la priorité échoue */
  onErreur: (message: string) => void;
};

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BlocOrganisation({ intervention: i, mecanicien, peutAttribuer, onAttribuer, onErreur }: Props) {
  const t = useTheme();
  return (
    <Groupe titre="Organisation">
      <Ligne>
        <Icone nom="horloge" taille={18} couleur={t.muted} />
        <View className="flex-1">
          <Legende>Rendez-vous</Legende>
          <Texte>
            {majuscule(quand(i.debut))} · {duree(i.dureeMin)}
          </Texte>
        </View>
      </Ligne>
      <Ligne>
        <Icone nom="planning" taille={18} couleur={t.muted} />
        <View className="flex-1">
          <Legende>Restitution prévue</Legende>
          <Texte>{i.restitutionPrevue ? majuscule(quand(i.restitutionPrevue)) : 'Non renseignée'}</Texte>
        </View>
      </Ligne>
      <Ligne onPress={peutAttribuer ? onAttribuer : undefined} accessibilityLabel={peutAttribuer ? 'Changer le mécanicien' : undefined}>
        {mecanicien ? (
          <Avatar membre={mecanicien} taille={32} />
        ) : (
          <View className="h-8 w-8 rounded-full border border-dashed border-faint dark:border-faint-dark" />
        )}
        <View className="flex-1">
          <Legende>Mécanicien</Legende>
          <Texte>{mecanicien ? `${mecanicien.prenom} ${mecanicien.nom}` : 'Non attribué'}</Texte>
        </View>
        {peutAttribuer ? <Icone nom="chevron.droite" taille={16} couleur={t.faint} /> : null}
      </Ligne>
      <Ligne derniere>
        <View className="flex-1">
          <Texte>Prioritaire</Texte>
          <Legende>Passe en tête du planning.</Legende>
        </View>
        <Switch
          value={i.prioritaire}
          onValueChange={(v) => {
            impulsion('leger');
            ecrire(repo().modifierIntervention(i.id, { prioritaire: v }), onErreur, 'Impossible de changer la priorité.');
          }}
          trackColor={{ true: t.accent, false: t.line }}
          ios_backgroundColor={t.line}
          accessibilityLabel="Prioritaire"
        />
      </Ligne>
    </Groupe>
  );
}
