/**
 * Fil « Suivi » : commentaires (auteur, photos, visible client ou interne)
 * et événements (statut, blocage, attribution, SMS) dans l’ordre du temps.
 */

import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, Legende, Pastille, Texte } from '@/components/ui';
import { BLOCAGES, ORIGINES, STATUTS } from '@/domain/statuts';
import type { Blocage, Commentaire, Evenement, Membre, Origine, Statut } from '@/domain/types';
import { ilYA } from '@/lib/format';

import { PhotosGrille } from './PhotosGrille';

type Props = { commentaires: Commentaire[]; evenements: Evenement[]; membres: Membre[] };

type Entree =
  | { cle: string; date: string; type: 'commentaire'; c: Commentaire }
  | { cle: string; date: string; type: 'evenement'; e: Evenement };

function texteEvenement(e: Evenement, parId: Map<string, Membre>): string {
  const prenom = e.membreId ? parId.get(e.membreId)?.prenom ?? null : null;
  const qui = prenom ?? 'Le garage';
  switch (e.type) {
    case 'creation': {
      const origine = e.valeur as Origine | null;
      const via = origine && ORIGINES[origine] ? ORIGINES[origine].label : null;
      if (prenom) return via ? `${prenom} a créé la fiche · ${via}` : `${prenom} a créé la fiche`;
      if (origine === 'ia') return 'Fiche créée par le réceptionniste';
      if (origine === 'site') return 'Demande reçue depuis le site internet';
      return via ? `Fiche créée · ${via}` : 'Fiche créée';
    }
    case 'statut': {
      const s = e.valeur as Statut | null;
      return `${qui} a passé en ${s && STATUTS[s] ? STATUTS[s].label : e.valeur ?? '?'}`;
    }
    case 'blocage': {
      const b = e.valeur as Blocage | null;
      return b ? `${qui} a signalé : ${BLOCAGES[b]?.label ?? b}` : `${qui} a débloqué l’intervention`;
    }
    case 'affectation': {
      if (!e.valeur) return `${qui} a retiré l’attribution`;
      const cible = parId.get(e.valeur);
      return `${qui} a attribué à ${cible ? `${cible.prenom} ${cible.nom}` : 'un membre'}`;
    }
    case 'sms':
      return `${qui} a envoyé le SMS « Véhicule prêt »`;
  }
}

function LigneCommentaire({ c, membre }: { c: Commentaire; membre?: Membre }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} className="flex-row gap-3">
      {membre ? (
        <Avatar membre={membre} taille={32} />
      ) : (
        <View
          accessibilityLabel={c.auteurNom}
          className="h-8 w-8 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
          <Text className="text-[12px] font-bold text-muted dark:text-muted-dark">{c.auteurNom.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View className="flex-1 rounded-2xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-3">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Texte className="text-[15px] font-semibold">{c.auteurNom}</Texte>
          <Legende>{ilYA(c.creeLe)}</Legende>
          <View className="flex-1" />
          <Pastille label={c.visibleClient ? 'Visible par le client' : 'Interne'} ton={c.visibleClient ? 'ok' : 'muted'} />
        </View>
        {c.texte ? <Texte className="mt-1.5">{c.texte}</Texte> : null}
        <PhotosGrille photos={c.photos} />
      </View>
    </Animated.View>
  );
}

function LigneEvenement({ texte, date }: { texte: string; date: string }) {
  return (
    <View className="flex-row items-center gap-3 pl-3" accessibilityLabel={`${texte}, ${ilYA(date)}`}>
      <View className="h-1.5 w-1.5 rounded-full bg-faint dark:bg-faint-dark" />
      <Legende className="flex-1">
        {texte} · {ilYA(date)}
      </Legende>
    </View>
  );
}

export function FilSuivi({ commentaires, evenements, membres }: Props) {
  const parId = new Map(membres.map((m) => [m.id, m] as const));
  const entrees: Entree[] = [
    ...commentaires.map((c) => ({ cle: `k-${c.id}`, date: c.creeLe, type: 'commentaire' as const, c })),
    ...evenements.map((e) => ({ cle: `e-${e.id}`, date: e.creeLe, type: 'evenement' as const, e })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (entrees.length === 0) {
    return <Legende className="px-1">Aucune note pour l’instant.</Legende>;
  }

  return (
    <View className="gap-3">
      {entrees.map((x) =>
        x.type === 'commentaire' ? (
          <LigneCommentaire key={x.cle} c={x.c} membre={x.c.auteurId ? parId.get(x.c.auteurId) : undefined} />
        ) : (
          <LigneEvenement key={x.cle} texte={texteEvenement(x.e, parId)} date={x.e.creeLe} />
        ),
      )}
    </View>
  );
}
