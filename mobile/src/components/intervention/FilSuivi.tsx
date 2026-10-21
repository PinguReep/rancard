/**
 * Fil « Suivi » : commentaires (auteur, photos, visible client ou interne)
 * et événements (statut, blocage, attribution, SMS) dans l’ordre du temps.
 */

import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Carte, Icone, Legende, Texte } from '@/components/ui';
import { BLOCAGES, ORIGINES, STATUTS } from '@/domain/statuts';
import type { Blocage, Commentaire, Evenement, Membre, Origine, Statut } from '@/domain/types';
import { ilYA } from '@/lib/format';
import { useTheme } from '@/theme/tokens';

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

function LigneCommentaire({ c }: { c: Commentaire }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Carte className="px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Legende className="flex-1 font-semibold" numberOfLines={1}>
            {c.auteurNom} · {ilYA(c.creeLe)}
          </Legende>
          <View className="flex-row items-center gap-1" accessibilityLabel={c.visibleClient ? 'Visible par le client' : 'Réservée à l’équipe'}>
            <Icone nom={c.visibleClient ? 'oeil' : 'cadenas'} taille={13} couleur={c.visibleClient ? t.ok : t.muted} />
            <Text maxFontSizeMultiplier={1.3} className={`text-[13px] font-semibold ${c.visibleClient ? 'text-ok dark:text-ok-dark' : 'text-muted dark:text-muted-dark'}`}>
              {c.visibleClient ? 'Client' : 'Équipe'}
            </Text>
          </View>
        </View>
        {c.texte ? <Texte className="mt-1">{c.texte}</Texte> : null}
        <PhotosGrille photos={c.photos} />
      </Carte>
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
    return null;
  }

  return (
    <View className="gap-2">
      {entrees.map((x) =>
        x.type === 'commentaire' ? (
          <LigneCommentaire key={x.cle} c={x.c} />
        ) : (
          <LigneEvenement key={x.cle} texte={texteEvenement(x.e, parId)} date={x.e.creeLe} />
        ),
      )}
    </View>
  );
}
